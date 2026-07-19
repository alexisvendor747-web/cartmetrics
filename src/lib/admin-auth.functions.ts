import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

const OWNER_EMAIL = "apraisesamuel@gmail.com";

function passkeyMatches(input: string, expectedHex: string): boolean {
  const inputHash = createHash("sha256").update(input, "utf8").digest();
  const expected = Buffer.from(expectedHex, "hex");
  if (inputHash.length !== expected.length) return false;
  return timingSafeEqual(inputHash, expected);
}

export const adminUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ passkey: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const email = typeof context.claims?.email === "string" ? context.claims.email.toLowerCase() : "";
    if (email !== OWNER_EMAIL) throw new Error("Not authorized");
    // 1. verify user is super_admin
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Not authorized");

    // 2. load stored passkey hash
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "admin_passkey_sha256")
      .single();
    const stored = typeof row?.value === "string" ? row.value : null;
    if (!stored) throw new Error("Admin passkey not configured");

    if (!passkeyMatches(data.passkey, stored)) throw new Error("Invalid passkey");

    // 3. set encrypted admin session cookie
    const { getAdminSession } = await import("./admin-session.server");
    const session = await getAdminSession();
    await session.update({ userId: context.userId, unlockedAt: Date.now() });

    // audit
    await supabaseAdmin
      .from("admin_audit_log")
      .insert({ actor_id: context.userId, action: "admin_login", metadata: {} });

    return { ok: true as const };
  });

export const adminLock = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdminSession } = await import("./admin-session.server");
  const session = await getAdminSession();
  await session.clear();
  return { ok: true as const };
});

export const adminSessionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = typeof context.claims?.email === "string" ? context.claims.email.toLowerCase() : "";
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    const { getAdminSession } = await import("./admin-session.server");
    const session = await getAdminSession();
    const unlocked =
      !!session.data.userId &&
      session.data.userId === context.userId &&
      (Date.now() - (session.data.unlockedAt ?? 0)) < 8 * 60 * 60 * 1000;
    const ownerAllowed = email === OWNER_EMAIL && !!isSuper;
    return { isSuperAdmin: ownerAllowed, unlocked: ownerAllowed && unlocked };
  });

export const adminRotatePasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ current: z.string().min(1), next: z.string().min(8).max(200) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const email = typeof context.claims?.email === "string" ? context.claims.email.toLowerCase() : "";
    if (email !== OWNER_EMAIL) throw new Error("Not authorized");
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Not authorized");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "admin_passkey_sha256")
      .single();
    const stored = typeof row?.value === "string" ? row.value : null;
    if (!stored || !passkeyMatches(data.current, stored)) throw new Error("Current passkey wrong");
    const nextHex = createHash("sha256").update(data.next, "utf8").digest("hex");
    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "admin_passkey_sha256", value: nextHex as unknown as never, updated_at: new Date().toISOString() });
    await supabaseAdmin
      .from("admin_audit_log")
      .insert({ actor_id: context.userId, action: "rotate_passkey", metadata: {} });
    return { ok: true as const };
  });
