import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getChatMessages, getMyProfile, getAppSettings } from "@/lib/chats.functions";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, RefreshCw, Sparkles, User, Loader2, Paperclip, X, FileText, Image as ImageIcon, Video } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/_authenticated/chat/$chatId")({
  component: ChatView,
});

type Msg = { id: string; role: "user" | "assistant" | "system"; content: string; model?: string | null; created_at?: string; streaming?: boolean };
type Attachment = { id: string; name: string; mime: string; size: number; dataUrl: string };

function ChatView() {
  const { chatId } = Route.useParams();
  const qc = useQueryClient();
  const msgsFn = useServerFn(getChatMessages);
  const profileFn = useServerFn(getMyProfile);
  const settingsFn = useServerFn(getAppSettings);
  const messagesQuery = useQuery({ queryKey: ["messages", chatId], queryFn: () => msgsFn({ data: { chatId } }) });
  const profileQuery = useQuery({ queryKey: ["me"], queryFn: () => profileFn() });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => settingsFn() });

  const enabledModels = (settingsQuery.data?.find((s) => s.key === "enabled_models")?.value as { id: string; name: string; provider: string; cost: number; enabled: boolean }[] | undefined)?.filter((m) => m.enabled) ?? [];
  const [model, setModel] = useState<string>("");
  useEffect(() => {
    if (!model && enabledModels.length && profileQuery.data) {
      const pref = profileQuery.data.preferred_model;
      setModel(enabledModels.find((m) => m.id === pref)?.id ?? enabledModels[0].id);
    }
  }, [enabledModels, profileQuery.data, model]);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [live, setLive] = useState<Msg[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLive([]); setInput(""); setAttachments([]); }, [chatId]);
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messagesQuery.data, live, streaming]);

  const messages: Msg[] = [...(messagesQuery.data ?? []) as Msg[], ...live];

  async function onFilesSelected(files: FileList | null) {
    if (!files?.length || streaming) return;
    const incoming = Array.from(files).slice(0, Math.max(0, 10 - attachments.length));
    if (attachments.length + files.length > 10) toast.error("You can attach up to 10 files per message.");
    const accepted: Attachment[] = [];
    for (const file of incoming) {
      if (file.size > 20_000_000) {
        toast.error(`${file.name} is larger than 20MB.`);
        continue;
      }
      const mime = file.type || inferMime(file.name);
      const dataUrl = await readFileAsDataUrl(file, mime);
      accepted.push({ id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`, name: file.name, mime, size: file.size, dataUrl });
    }
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted].slice(0, 10));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function send(prompt?: string) {
    const outgoingAttachments = prompt ? [] : attachments;
    const text = (prompt ?? input).trim() || (outgoingAttachments.length ? "Please analyze the attached file(s)." : "");
    if ((!text && !outgoingAttachments.length) || streaming || !model) return;
    setInput("");
    setAttachments([]);
    setStreaming(true);

    const attachmentText = outgoingAttachments.length ? `\n\nAttachments:\n${outgoingAttachments.map((a) => `- ${a.name} (${formatBytes(a.size)})`).join("\n")}` : "";
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: `${text}${attachmentText}` };
    const assistantMsg: Msg = { id: `a-${Date.now()}`, role: "assistant", content: "", model, streaming: true };
    setLive((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId, message: text, model, history, attachments: outgoingAttachments.map(({ name, mime, size, dataUrl }) => ({ name, mime, size, dataUrl })) }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "unknown" }));
        if (resp.status === 402 && err.error === "insufficient_credits") toast.error("You're out of credits. Top up to continue.");
        else if (resp.status === 402) toast.error("AI service credits exhausted. Contact support.");
        else if (resp.status === 429) toast.error("Rate limit hit — try again in a moment.");
        else toast.error(err.error ?? "Something went wrong");
        setLive((prev) => prev.filter((m) => !m.streaming));
        setInput(text);
        setAttachments(outgoingAttachments);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLive((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: acc } : m));
      }
      setLive((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false } : m));
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["chats"] });
      // Reload persisted messages, but keep the streamed answer visible if the
      // database refetch is delayed or persistence fails.
      await qc.invalidateQueries({ queryKey: ["messages", chatId] });
      const savedMessages = (qc.getQueryData(["messages", chatId]) ?? []) as Msg[];
      const savedAssistant = savedMessages.some((m) => m.role === "assistant" && m.content.trim() === acc.trim());
      if (savedAssistant) {
        setLive([]);
      } else {
        toast.warning("Answer is still visible, but saving took longer than expected. Refresh before leaving this chat.");
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Stream error");
      setLive((prev) => prev.filter((m) => !m.streaming));
      setInput(text);
      setAttachments(outgoingAttachments);
    } finally {
      setStreaming(false);
    }
  }

  // Handle initial prompt from suggestion cards
  const search = Route.useSearch() as { prompt?: string };
  useEffect(() => {
    if (search.prompt && model && (messagesQuery.data?.length ?? 0) === 0 && !streaming) {
      const p = search.prompt;
      setTimeout(() => send(p), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, messagesQuery.data]);

  async function regenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    send(lastUser.content);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b border-border h-14 flex items-center px-4 gap-3">
        <div className="flex-1 truncate text-sm text-muted-foreground">Chat</div>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="w-[min(55vw,220px)] h-9"><SelectValue placeholder="Select model" /></SelectTrigger>
          <SelectContent>
            {enabledModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground ml-2 text-xs">· {m.provider} · {m.cost}c</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
          {messagesQuery.isLoading && <div className="text-center text-muted-foreground text-sm">Loading…</div>}
          {messages.length === 0 && !messagesQuery.isLoading && (
            <div className="text-center py-20">
              <div className="inline-block h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center shadow-glow mb-4"><Sparkles className="h-5 w-5 text-background" /></div>
              <div className="font-display text-3xl">How can I help?</div>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
        </div>
      </div>

      <div className="border-t border-border px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="glass rounded-2xl p-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1 pb-2">
                {attachments.map((file) => (
                  <div key={file.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-background/50 px-2 py-1.5 text-xs max-w-full sm:max-w-[240px]">
                    <AttachmentIcon mime={file.mime} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{file.name}</div>
                      <div className="text-muted-foreground">{formatBytes(file.size)}</div>
                    </div>
                    <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))} aria-label={`Remove ${file.name}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json"
                onChange={(e) => void onFilesSelected(e.target.files)}
              />
              <Button size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={streaming || attachments.length >= 10} title="Attach files" aria-label="Attach files">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Message CartMetrics AI…"
                rows={1}
                className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 max-h-40 min-h-[36px] py-2"
                maxLength={20000}
                disabled={streaming}
              />
              <div className="flex gap-1">
                {messages.some((m) => m.role === "assistant" && !m.streaming) && !streaming && (
                  <Button size="icon" variant="ghost" onClick={regenerate} title="Regenerate" aria-label="Regenerate response"><RefreshCw className="h-4 w-4" /></Button>
                )}
                <Button size="icon" onClick={() => send()} disabled={(!input.trim() && attachments.length === 0) || streaming || !model} className="bg-gradient-to-r from-amber-400 to-orange-500 text-background border-0" aria-label="Send message">
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground text-center">
            CartMetrics AI can make mistakes. Verify important information.
          </div>
        </div>
      </div>
    </div>
  );
}

function inferMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}

function readFileAsDataUrl(file: File, mime: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.startsWith("data:;") ? result.replace("data:;", `data:${mime};`) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-primary" />;
  if (mime.startsWith("video/")) return <Video className="h-4 w-4 text-primary" />;
  return <FileText className="h-4 w-4 text-primary" />;
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${isUser ? "bg-accent" : "bg-gradient-to-br from-amber-400 to-orange-600"}`}>
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-background" />}
      </div>
      <div className={`min-w-0 flex-1 ${isUser ? "text-right" : ""}`}>
        <div className={`inline-block max-w-full ${isUser ? "bg-accent text-accent-foreground rounded-2xl px-4 py-2.5" : ""}`}>
          {isUser ? (
            <div className="whitespace-pre-wrap text-left">{msg.content}</div>
          ) : (
            <div className="md-prose text-left">
              {msg.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              ) : (
                <div className="flex items-center gap-1 py-1">
                  <span className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                  <span className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          )}
        </div>
        {msg.model && !isUser && !msg.streaming && (
          <div className="text-xs text-muted-foreground mt-1.5">{msg.model}</div>
        )}
      </div>
    </div>
  );
}
