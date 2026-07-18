import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listBroadcasts, sendBroadcast } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send } from "lucide-react";

export const Route = createFileRoute("/admin/broadcast")({
  head: () => ({ meta: [{ title: "Broadcast — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const listBroadcastsFn = useServerFn(listBroadcasts);
  const list = useQuery({ queryKey: ["admin", "broadcasts"], queryFn: () => listBroadcastsFn() });
  const sendFn = useServerFn(sendBroadcast);
  const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [aud, setAud] = useState<"all" | "active" | "suspended">("active");

  const send = useMutation({
    mutationFn: () => sendFn({ data: { subject, body_html: body, audience: aud } }),
    onSuccess: (r) => { toast.success(`Sent to ${r.sent} recipients${r.error ? " (with errors)" : ""}`); setSubject(""); setBody(""); qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <header><h1 className="text-2xl font-semibold">Broadcast Email</h1><p className="text-sm text-muted-foreground">Send an email to selected users. Powered by Resend.</p></header>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="grid gap-1"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="grid gap-1"><Label>Body (HTML supported)</Label><Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm" /></div>
        <div className="flex items-end justify-between">
          <div className="grid gap-1 w-56"><Label>Audience</Label>
            <Select value={aud} onValueChange={(v: any) => setAud(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="suspended">Suspended only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => send.mutate()} disabled={send.isPending || !subject || !body}><Send className="h-4 w-4 mr-2" />Send broadcast</Button>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">History</h2>
        <div className="rounded-xl border bg-card divide-y">
          {list.data?.map((b: any) => (
            <div key={b.id} className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium">{b.subject}</div>
                <div className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString()} · {b.audience} · {b.sent_count ?? 0} sent</div>
                {b.error && <div className="text-xs text-destructive mt-1">{b.error}</div>}
              </div>
              <Badge variant={b.status === "sent" ? "default" : b.status === "failed" ? "destructive" : "secondary"} className="capitalize">{b.status}</Badge>
            </div>
          ))}
          {list.data?.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No broadcasts yet.</div>}
        </div>
      </div>
    </div>
  );
}
