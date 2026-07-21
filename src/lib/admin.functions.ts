import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OWNER_EMAIL = "apraisesamuel@gmail.com";

async function requireSuperAdmin(context: { supabase: any; userId: string; claims?: Record<string, unknown> }) {
  let email = typeof context.claims?.email === "string" ? context.claims.email.toLowerCase() : "";
  if (!email) {
    const { data } = await context.supabase.from("profiles").select("email").eq("id", context.userId).single();
    email = typeof data?.email === "string" ? data.email.toLowerCase() : "";
  }
  if (email !== OWNER_EMAIL) throw new Error("Forbidden");
  const { data: ok } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (!ok) throw new Error("Forbidden");
}

async function requireAdminSession(context: { userId: string }) {
  const { getAdminSession } = await import("./admin-session.server");
  const s = await getAdminSession();
  const unlocked =
    !!s.data.userId &&
    s.data.userId === context.userId &&
    (Date.now() - (s.data.unlockedAt ?? 0)) < 8 * 60 * 60 * 1000;
  if (!unlocked) throw new Error("Admin session locked. Enter passkey.");
}

async function audit(actorId: string, action: string, target_type?: string, target_id?: string, metadata: Record<string, unknown> = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: actorId,
    action,
    target_type: target_type ?? null,
    target_id: target_id ?? null,
    metadata: metadata as never,
  });
}

// ---------- Analytics ----------

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, chats, messages, pendingPay, txns, payments] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, credits, created_at, status"),
      supabaseAdmin.from("chats").select("id, created_at"),
      supabaseAdmin.from("messages").select("id, model, created_at"),
      supabaseAdmin.from("payment_requests").select("id, credits, amount, status").eq("status", "pending"),
      supabaseAdmin.from("credit_transactions").select("delta, reason, created_at"),
      supabaseAdmin.from("payment_requests").select("amount, status, created_at").eq("status", "approved"),
    ]);
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const modelCounts: Record<string, number> = {};
    for (const m of messages.data ?? []) {
      if (m.model) modelCounts[m.model] = (modelCounts[m.model] ?? 0) + 1;
    }
    return {
      totalUsers: users.data?.length ?? 0,
      suspendedUsers: (users.data ?? []).filter((u) => u.status === "suspended").length,
      newUsers24h: (users.data ?? []).filter((u) => new Date(u.created_at).getTime() > dayAgo).length,
      totalChats: chats.data?.length ?? 0,
      totalMessages: messages.data?.length ?? 0,
      messages24h: (messages.data ?? []).filter((m) => new Date(m.created_at).getTime() > dayAgo).length,
      pendingPayments: pendingPay.data?.length ?? 0,
      pendingCreditsTotal: (pendingPay.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0),
      totalRevenue: (payments.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0),
      totalCreditsSpent: Math.abs((txns.data ?? []).filter((t) => t.delta < 0).reduce((s, t) => s + t.delta, 0)),
      creditsInCirculation: (users.data ?? []).reduce((s, u) => s + (u.credits ?? 0), 0),
      modelUsage: Object.entries(modelCounts).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count),
      dailyMessages: buildDailySeries(messages.data ?? [], weekAgo),
      dailyUsers: buildDailySeries(users.data ?? [], weekAgo),
    };
  });

function buildDailySeries(items: { created_at: string }[], since: number) {
  const buckets: Record<string, number> = {};
  for (let d = new Date(since); d.getTime() <= Date.now(); d.setDate(d.getDate() + 1)) {
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const it of items) {
    const key = it.created_at.slice(0, 10);
    if (key in buckets) buckets[key] += 1;
  }
  return Object.entries(buckets).map(([date, count]) => ({ date: date.slice(5), count }));
}

// ---------- Users ----------

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, credits, created_at, status")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.search) q = q.ilike("email", `%${data.search}%`);
    const { data: profiles, error } = await q;
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
    user_id: z.string().uuid(),
    delta: z.number().int(),
    reason: z.string().max(200).default("admin_adjustment"),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("adjust_credits", {
      _user_id: data.user_id,
      _delta: data.delta,
      _reason: data.reason,
      _metadata: { admin_id: context.userId } as never,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "adjust_credits", "user", data.user_id, { delta: data.delta, reason: data.reason });
    return { ok: true };
  });

export const toggleAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), make_admin: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    if (data.user_id === context.userId) throw new Error("Cannot modify your own admin role");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.make_admin) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.user_id, role: "admin" } as never, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", "admin");
    }
    await audit(context.userId, data.make_admin ? "grant_admin" : "revoke_admin", "user", data.user_id);
    return { ok: true };
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    if (data.user_id === context.userId) throw new Error("Cannot suspend yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ status: data.status }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "set_status", "user", data.user_id, { status: data.status });
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), confirm_email: z.string().email() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    if (data.user_id === context.userId) throw new Error("Cannot delete yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("profiles").select("email").eq("id", data.user_id).single();
    if (!p || p.email?.toLowerCase() !== data.confirm_email.toLowerCase()) throw new Error("Email confirmation mismatch");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "delete_user", "user", data.user_id, { email: p.email });
    return { ok: true };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("profiles").select("email").eq("id", data.user_id).single();
    if (!p?.email) throw new Error("User has no email");
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: p.email,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "send_password_reset", "user", data.user_id, { email: p.email });
    return { ok: true };
  });

// ---------- Settings ----------

export const listSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("app_settings").select("key, value, updated_at").order("key");
    if (error) throw new Error(error.message);
    return (data ?? []).filter((r) => r.key !== "admin_passkey_sha256");
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().max(80), value: z.unknown() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    if (data.key === "admin_passkey_sha256") throw new Error("Use the passkey rotation function");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: data.key, value: data.value as never, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await audit(context.userId, "update_setting", "setting", data.key, { value: data.value as never });
    return { ok: true };
  });

// ---------- Credit packages ----------

const PackageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  credits: z.number().int().min(1),
  price: z.number().min(0),
  currency: z.string().max(6).default("USD"),
  bonus_credits: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  description: z.string().max(500).nullable().optional(),
});

export const listPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("credit_packages").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PackageSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("credit_packages").upsert(data as never);
    if (error) throw new Error(error.message);
    await audit(context.userId, "upsert_package", "credit_package", data.id ?? undefined, data as never);
    return { ok: true };
  });

export const deletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("credit_packages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "delete_package", "credit_package", data.id);
    return { ok: true };
  });

// ---------- Announcements ----------

const AnnouncementSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  severity: z.enum(["info", "success", "warning", "critical"]).default("info"),
  active: z.boolean().default(true),
});

export const listAnnouncements = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("announcements").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const upsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnnouncementSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: Record<string, unknown> = { ...data, created_by: context.userId };
    const { error } = await supabaseAdmin.from("announcements").upsert(payload as never);
    if (error) throw new Error(error.message);
    await audit(context.userId, "upsert_announcement", "announcement", data.id ?? undefined);
    return { ok: true };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "delete_announcement", "announcement", data.id);
    return { ok: true };
  });

// ---------- FAQs ----------

const FaqSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(4000),
  category: z.string().max(80).default("general"),
  sort_order: z.number().int().default(0),
  published: z.boolean().default(true),
});

export const listFaqs = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("faqs").select("*").order("category").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const upsertFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FaqSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("faqs").upsert(data as never);
    if (error) throw new Error(error.message);
    await audit(context.userId, "upsert_faq", "faq", data.id ?? undefined);
    return { ok: true };
  });

export const deleteFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("faqs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "delete_faq", "faq", data.id);
    return { ok: true };
  });

// ---------- Feature flags ----------

export const listFlags = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("feature_flags").select("*").order("key");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const upsertFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string().min(1).max(80), enabled: z.boolean(), description: z.string().max(300).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("feature_flags").upsert({ ...data, updated_at: new Date().toISOString() } as never);
    if (error) throw new Error(error.message);
    await audit(context.userId, "upsert_flag", "feature_flag", data.key, { enabled: data.enabled });
    return { ok: true };
  });

// ---------- Broadcast emails ----------

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("broadcast_emails").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      subject: z.string().min(1).max(200),
      body_html: z.string().min(1).max(50_000),
      audience: z.enum(["all", "active", "suspended"]).default("all"),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: e0 } = await supabaseAdmin
      .from("broadcast_emails")
      .insert({
        subject: data.subject,
        body_html: data.body_html,
        audience: data.audience,
        status: "sending",
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (e0) throw new Error(e0.message);

    let q = supabaseAdmin.from("profiles").select("email").not("email", "is", null);
    if (data.audience === "active") q = q.eq("status", "active");
    if (data.audience === "suspended") q = q.eq("status", "suspended");
    const { data: rows } = await q;
    const emails = (rows ?? []).map((r) => r.email).filter(Boolean) as string[];

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    let sent = 0;
    let errorMsg: string | null = null;
    if (!RESEND_API_KEY) {
      errorMsg = "RESEND_API_KEY not configured";
    } else {
      const chunkSize = 40;
      for (let i = 0; i < emails.length; i += chunkSize) {
        const chunk = emails.slice(i, i + chunkSize);
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "CartMetrics AI <noreply@cartmetrics.ai>",
              to: chunk,
              subject: data.subject,
              html: data.body_html,
            }),
          });
          if (res.ok) sent += chunk.length;
          else if (!errorMsg) errorMsg = `Resend error ${res.status}`;
        } catch (e) {
          if (!errorMsg) errorMsg = String(e);
        }
      }
    }

    await supabaseAdmin
      .from("broadcast_emails")
      .update({
        status: errorMsg && sent === 0 ? "failed" : "sent",
        sent_count: sent,
        sent_at: new Date().toISOString(),
        error: errorMsg,
      } as never)
      .eq("id", created!.id);

    await audit(context.userId, "broadcast_email", "broadcast", created!.id, { sent, audience: data.audience });
    return { id: created!.id, sent, error: errorMsg };
  });

// ---------- Audit log ----------

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Support tickets ----------

export const listAllTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject, status, priority, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((data ?? []).map((ticket) => ticket.user_id).filter(Boolean)));
    const profileMap = new Map<string, { email: string | null; display_name: string | null }>();
    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, email, display_name")
        .in("id", userIds);
      if (profileError) throw new Error(profileError.message);
      for (const profile of profiles ?? []) {
        profileMap.set(profile.id, { email: profile.email, display_name: profile.display_name });
      }
    }
    return (data ?? []).map((ticket) => ({
      ...ticket,
      profiles: profileMap.get(ticket.user_id) ?? { email: null, display_name: null },
    }));
  });

export const getTicketMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: msgs, error } = await supabaseAdmin
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", data.id)
      .order("created_at");
    if (error) throw new Error(error.message);
    return msgs ?? [];
  });

export const replyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      body: z.string().min(1).max(4000),
      new_status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: messageError } = await supabaseAdmin
      .from("support_ticket_messages")
      .insert({ ticket_id: data.id, author_id: context.userId, is_staff: true, body: data.body } as never);
    if (messageError) throw new Error(messageError.message);
    if (data.new_status) {
      const { error: ticketError } = await supabaseAdmin.from("support_tickets").update({ status: data.new_status } as never).eq("id", data.id);
      if (ticketError) throw new Error(ticketError.message);
    }
    await audit(context.userId, "reply_ticket", "ticket", data.id, { status: data.new_status });
    return { ok: true };
  });

// ---------- Blog ----------

const BlogSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(500).nullable().optional(),
  body_md: z.string().min(1),
  cover_url: z.string().url().nullable().optional(),
  published: z.boolean().default(false),
});

export const listBlogPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("blog_posts").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BlogSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: Record<string, unknown> = {
      ...data,
      author_id: context.userId,
      published_at: data.published ? new Date().toISOString() : null,
    };
    const { error } = await supabaseAdmin.from("blog_posts").upsert(payload as never);
    if (error) throw new Error(error.message);
    await audit(context.userId, "upsert_blog", "blog_post", data.id ?? data.slug);
    return { ok: true };
  });

export const deleteBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    await requireAdminSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("blog_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "delete_blog", "blog_post", data.id);
    return { ok: true };
  });
