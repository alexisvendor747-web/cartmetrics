import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const BodySchema = z.object({
  chatId: z.string().uuid(),
  message: z.string().min(1).max(20000),
  model: z.string().min(1).max(80),
  history: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() })).max(200),
  attachments: z.array(z.object({
    name: z.string().min(1).max(180),
    mime: z.string().min(1).max(120),
    size: z.number().int().min(1).max(20_000_000),
    dataUrl: z.string().startsWith("data:").max(30_000_000),
  })).max(10).optional().default([]),
});

const SYSTEM_PROMPT = `You are CartMetrics AI, a helpful, insightful, and creative assistant.
- Format code responses using fenced code blocks with the language tag.
- Use markdown headings, lists, and tables for clarity.
- Cite reasoning briefly when giving recommendations.
- Be direct, concise, and correct. Ask a clarifying question only when necessary.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!LOVABLE_API_KEY) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        // Auth
        const supaAuthClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: authErr } = await supaAuthClient.auth.getUser(token);
        if (authErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        let body: z.infer<typeof BodySchema>;
        try { body = BodySchema.parse(await request.json()); }
        catch { return new Response("Invalid input", { status: 400 }); }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Verify chat ownership
        const { data: chat } = await supabaseAdmin.from("chats").select("id, user_id, title").eq("id", body.chatId).single();
        if (!chat || chat.user_id !== userId) return new Response("Forbidden", { status: 403 });

        // Load enabled models to check cost
        const { data: settings } = await supabaseAdmin.from("app_settings").select("value").eq("key", "enabled_models").single();
        const enabledModels = (settings?.value as { id: string; cost: number; enabled: boolean }[]) ?? [];
        const modelConfig = enabledModels.find((m) => m.id === body.model && m.enabled);
        if (!modelConfig) return new Response("Model not available", { status: 400 });

        // Deduct credits
        try {
          await supabaseAdmin.rpc("adjust_credits", {
            _user_id: userId, _delta: -modelConfig.cost, _reason: "chat", _metadata: { model: body.model, chat_id: body.chatId },
          }).throwOnError();
        } catch (e) {
          return new Response(JSON.stringify({ error: "insufficient_credits" }), { status: 402, headers: { "content-type": "application/json" } });
        }

        const attachmentSummary = body.attachments.length
          ? `\n\nAttachments:\n${body.attachments.map((a) => `- ${a.name} (${a.mime}, ${Math.ceil(a.size / 1024)} KB)`).join("\n")}`
          : "";
        const savedUserContent = `${body.message}${attachmentSummary}`;

        // Save user message
        await supabaseAdmin.from("messages").insert({
          chat_id: body.chatId, user_id: userId, role: "user", content: savedUserContent, model: body.model,
        });

        // Auto-title on first message
        if (chat.title === "New chat") {
          const title = (body.message || body.attachments[0]?.name || "New chat").slice(0, 60).replace(/\s+/g, " ").trim() || "New chat";
          await supabaseAdmin.from("chats").update({ title, model: body.model }).eq("id", body.chatId);
        } else {
          await supabaseAdmin.from("chats").update({ updated_at: new Date().toISOString(), model: body.model }).eq("id", body.chatId);
        }

        // Build multimodal user content. Inline small text-like files as text
        // so any chat model can "see" them, even when the model does not
        // accept a `file` block. Images always use image_url (OpenAI-compat).
        function isTextLike(mime: string, name: string) {
          if (mime.startsWith("text/") || mime === "application/json" || mime === "text/markdown" || mime === "text/csv") return true;
          const ext = name.split(".").pop()?.toLowerCase();
          return ext === "txt" || ext === "md" || ext === "csv" || ext === "json";
        }
        function decodeTextDataUrl(dataUrl: string): string {
          const comma = dataUrl.indexOf(",");
          if (comma === -1) return "";
          const meta = dataUrl.slice(5, comma);
          const payload = dataUrl.slice(comma + 1);
          if (meta.includes(";base64")) {
            try { return Buffer.from(payload, "base64").toString("utf8"); }
            catch { return ""; }
          }
          try { return decodeURIComponent(payload); } catch { return payload; }
        }

        const textAttachments = body.attachments.filter((a) => isTextLike(a.mime, a.name));
        const imageAttachments = body.attachments.filter((a) => a.mime.startsWith("image/"));
        const otherAttachments = body.attachments.filter((a) => !isTextLike(a.mime, a.name) && !a.mime.startsWith("image/"));

        const inlinedTextBlock = textAttachments.length
          ? "\n\n" + textAttachments.map((a) => {
              const text = decodeTextDataUrl(a.dataUrl).slice(0, 120_000);
              return `--- File: ${a.name} (${a.mime}) ---\n${text}\n--- End ${a.name} ---`;
            }).join("\n\n")
          : "";

        const compositeText = `${body.message}${inlinedTextBlock}`;

        const userContent: unknown = imageAttachments.length || otherAttachments.length
          ? [
              { type: "text", text: compositeText },
              ...imageAttachments.map((file) => ({ type: "image_url", image_url: { url: file.dataUrl } })),
              ...otherAttachments.map((file) => ({ type: "file", file: { filename: file.name, file_data: file.dataUrl } })),
            ]
          : compositeText;

        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...body.history.slice(-30),
          { role: "user", content: userContent },
        ];

        // Auto-route to a vision-capable model when images are attached but the
        // selected model can't see images (e.g. DeepSeek/Mistral text-only).
        const visionCapable = /^(google\/gemini|openai\/gpt-5|openai\/gpt-4|anthropic\/claude)/i;
        let effectiveModel = body.model;
        if (imageAttachments.length && !visionCapable.test(body.model)) {
          effectiveModel = "google/gemini-2.5-flash";
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({ model: effectiveModel, messages, stream: true }),
        });

        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text();
          console.error("gateway error", upstream.status, errText);
          await supabaseAdmin.rpc("adjust_credits", {
            _user_id: userId, _delta: modelConfig.cost, _reason: "chat_refund", _metadata: { model: body.model, chat_id: body.chatId },
          });
          if (upstream.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type": "application/json" } });
          if (upstream.status === 402) return new Response(JSON.stringify({ error: "gateway_credits_exhausted" }), { status: 402, headers: { "content-type": "application/json" } });
          return new Response(JSON.stringify({ error: "upstream_error", detail: errText.slice(0, 300) }), { status: 502, headers: { "content-type": "application/json" } });
        }

        // Stream and accumulate
        let assistantText = "";
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            const reader = upstream.body!.getReader();
            let buffer = "";
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n");
                buffer = parts.pop() ?? "";
                for (const raw of parts) {
                  const line = raw.trim();
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (payload === "[DONE]") continue;
                  try {
                    const json = JSON.parse(payload);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (typeof delta === "string" && delta) {
                      assistantText += delta;
                      controller.enqueue(encoder.encode(delta));
                    }
                  } catch { /* skip */ }
                }
              }
            } finally {
              // Persist the assistant before closing the response so the client refetch
              // cannot race ahead and clear the visible streamed reply.
              if (assistantText) {
                const { error } = await supabaseAdmin.from("messages").insert({
                  chat_id: body.chatId, user_id: userId, role: "assistant", content: assistantText, model: body.model,
                });
                if (error) console.error("assistant message persist failed", error.message);
              }
              controller.close();
            }
          },
        });

        return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      },
    },
  },
});
