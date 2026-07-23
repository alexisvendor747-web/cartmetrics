import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

export const listChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chats")
      .select("id, title, pinned, model, updated_at, created_at")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const createChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ title: z.string().max(200).optional(), model: z.string().max(80).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: chat, error } = await context.supabase
      .from("chats").insert({ user_id: context.userId, title: data.title ?? "New chat", model: data.model ?? null })
      .select("id, title, pinned, model, updated_at, created_at").single();
    if (error) throw new Error(error.message);
    return chat;
  });

export const renameChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chats").update({ title: data.title }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const togglePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chats").update({ pinned: data.pinned }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chats").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ chatId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: messages, error } = await context.supabase
      .from("messages").select("id, role, content, model, created_at")
      .eq("chat_id", data.chatId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return messages;
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles").select("id, email, display_name, avatar_url, credits, preferred_model, custom_instructions")
      .eq("id", context.userId).single();
    if (error) throw new Error(error.message);
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const isSuperAdmin = roles?.some((r) => r.role === "super_admin") ?? false;
    const isAdmin = roles?.some((r) => r.role === "admin") ?? false;
    return { ...data, is_admin: isAdmin || isSuperAdmin, is_super_admin: isSuperAdmin };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    display_name: z.string().min(1).max(60).optional(),
    preferred_model: z.string().max(80).optional(),
    custom_instructions: z.string().max(2000).optional().nullable(),
    avatar_url: z.string().max(500).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("profiles").update(data).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    subject: z.string().trim().min(3).max(160),
    body: z.string().trim().min(10).max(4000),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .insert({ user_id: context.userId, subject: data.subject, priority: data.priority })
      .select("id, subject, status, priority, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    const { error: messageError } = await context.supabase
      .from("support_ticket_messages")
      .insert({ ticket_id: ticket.id, author_id: context.userId, is_staff: false, body: data.body });
    if (messageError) throw new Error(messageError.message);
    return ticket;
  });

export const listMySupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select("id, subject, status, priority, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
export const getMyTicketThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: ticket, error: tErr } = await context.supabase
      .from("support_tickets")
      .select("id, user_id, subject, status, priority, created_at, updated_at")
      .eq("id", data.id).eq("user_id", context.userId).single();
    if (tErr) throw new Error(tErr.message);
    const { data: msgs, error: mErr } = await context.supabase
      .from("support_ticket_messages")
      .select("id, author_id, is_staff, body, created_at")
      .eq("ticket_id", data.id).order("created_at");
    if (mErr) throw new Error(mErr.message);
    return { ticket, messages: msgs ?? [] };
  });

export const replyToMyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: t, error: tErr } = await context.supabase
      .from("support_tickets").select("id").eq("id", data.id).eq("user_id", context.userId).single();
    if (tErr || !t) throw new Error("Ticket not found");
    const { error } = await context.supabase.from("support_ticket_messages")
      .insert({ ticket_id: data.id, author_id: context.userId, is_staff: false, body: data.body });
    if (error) throw new Error(error.message);
    await context.supabase.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

export const listActivePackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("credit_packages")
      .select("id, name, credits, price, currency, bonus_credits, featured, sort_order, description")
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Allow-list of keys safe to expose to authenticated end-users.
// Never include secret keys such as `admin_passkey_sha256`.
const PUBLIC_APP_SETTING_KEYS = [
  "enabled_models",
  "default_model",
  "bank_details",
  "support_email",
  "announcement_banner",
  "brand",
  "pricing_note",
] as const;

export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("key, value")
      .in("key", PUBLIC_APP_SETTING_KEYS as unknown as string[]);
    if (error) throw new Error(error.message);
    return (data ?? []) as { key: string; value: Json }[];
  });

