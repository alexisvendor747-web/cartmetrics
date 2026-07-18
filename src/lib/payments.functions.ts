import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const createPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    credits: z.number().int().min(100).max(1000000),
    amount: z.number().min(1).max(100000),
    bank_name: z.string().min(1).max(120),
    reference: z.string().min(1).max(200),
    screenshot_url: z.string().max(500).optional().nullable(),
    note: z.string().max(1000).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: pay, error } = await context.supabase
      .from("payment_requests").insert({ user_id: context.userId, ...data }).select("id").single();
    if (error) throw new Error(error.message);
    return pay;
  });

export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payment_requests").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const listAllPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await context.supabase.from("payment_requests")
      .select("*, profiles!inner(email, display_name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const decidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    decision: z.enum(["approved", "rejected", "info_requested"]),
    admin_note: z.string().max(1000).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pay, error: e1 } = await supabaseAdmin.from("payment_requests").select("*").eq("id", data.id).single();
    if (e1 || !pay) throw new Error("Payment not found");
    if (pay.status !== "pending") throw new Error("Payment already processed");

    const { error: e2 } = await supabaseAdmin.from("payment_requests")
      .update({ status: data.decision, admin_note: data.admin_note ?? null, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);

    if (data.decision === "approved") {
      const { error: e3 } = await supabaseAdmin.rpc("adjust_credits", {
        _user_id: pay.user_id, _delta: pay.credits, _reason: "payment_approved", _metadata: { payment_id: data.id, amount: pay.amount },
      });
      if (e3) throw new Error(e3.message);
    }
    return { ok: true };
  });

export const uploadProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filename: z.string().min(1).max(200),
    dataUrl: z.string().max(5_000_000),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const match = /^data:(.+?);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Invalid data URL");
    const mime = match[1];
    if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) throw new Error("Only PNG/JPG/WEBP allowed");
    const buf = Buffer.from(match[2], "base64");
    if (buf.byteLength > 3_500_000) throw new Error("File too large (max 3.5MB)");
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = `${context.userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("payment-proofs").upload(path, buf, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
    const { data: signed } = await supabaseAdmin.storage.from("payment-proofs").createSignedUrl(path, 60 * 60 * 24 * 365);
    return { path, url: signed?.signedUrl ?? null };
  });
