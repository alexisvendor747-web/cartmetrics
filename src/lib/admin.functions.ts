import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, chats, messages, pendingPay, txns] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, credits, created_at"),
      supabaseAdmin.from("chats").select("id, created_at"),
      supabaseAdmin.from("messages").select("id, model, created_at"),
      supabaseAdmin.from("payment_requests").select("id, credits, amount, status").eq("status", "pending"),
      supabaseAdmin.from("credit_transactions").select("delta, reason, created_at"),
    ]);
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const modelCounts: Record<string, number> = {};
    for (const m of messages.data ?? []) {
      if (m.model) modelCounts[m.model] = (modelCounts[m.model] ?? 0) + 1;
    }
    return {
      totalUsers: users.data?.length ?? 0,
      newUsers24h: (users.data ?? []).filter((u) => new Date(u.created_at).getTime() > dayAgo).length,
      totalChats: chats.data?.length ?? 0,
      totalMessages: messages.data?.length ?? 0,
      messages24h: (messages.data ?? []).filter((m) => new Date(m.created_at).getTime() > dayAgo).length,
      pendingPayments: pendingPay.data?.length ?? 0,
      pendingCreditsTotal: (pendingPay.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0),
      totalCreditsSpent: (txns.data ?? []).filter((t) => t.delta < 0).reduce((s, t) => s + t.delta, 0),
      creditsInCirculation: (users.data ?? []).reduce((s, u) => s + (u.credits ?? 0), 0),
      modelUsage: Object.entries(modelCounts).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count),
      dailyMessages: buildDailySeries(messages.data ?? [], weekAgo),
    };
  });

function buildDailySeries(items: { created_at: string }[], since: number) {
  const buckets: Record<string, number> = {};
  for (let d = new Date(since); d.getTime() <= Date.now(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
  }
  for (const item of items) {
    const key = item.created_at.slice(0, 10);
    if (key in buckets) buckets[key] += 1;
  }
  return Object.entries(buckets).map(([date, count]) => ({ date: date.slice(5), count }));
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin.from("profiles")
      .select("id, email, display_name, credits, created_at").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    }
    return (profiles ?? []).map((p) => ({ ...p, roles: roleMap.get(p.id) ?? ["user"] }));
  });

export const adminAdjustCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    user_id: z.string().uuid(), delta: z.number().int(), reason: z.string().max(200).default("admin_adjustment"),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("adjust_credits", {
      _user_id: data.user_id, _delta: data.delta, _reason: data.reason, _metadata: { admin_id: context.userId },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), make_admin: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (data.user_id === context.userId && !data.make_admin) throw new Error("Cannot demote yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.make_admin) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.user_id, role: "admin" }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", "admin");
    }
    return { ok: true };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().max(80), value: z.unknown() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert({ key: data.key, value: data.value as any, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
