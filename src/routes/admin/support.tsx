import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAllTickets, getTicketMessages, replyTicket } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/support")({
  head: () => ({ meta: [{ title: "Support — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const listAllTicketsFn = useServerFn(listAllTickets);
  const list = useQuery({ queryKey: ["admin", "tickets"], queryFn: () => listAllTicketsFn() });
  const msgsFn = useServerFn(getTicketMessages);
  const replyFn = useServerFn(replyTicket);
  const [selected, setSelected] = useState<string | null>(null);
  const [body, setBody] = useState(""); const [status, setStatus] = useState<"open" | "pending" | "resolved" | "closed">("pending");

  const msgs = useQuery({
    queryKey: ["admin", "ticket", selected],
    queryFn: () => msgsFn({ data: { id: selected! } }),
    enabled: !!selected,
  });

  const reply = useMutation({
    mutationFn: () => replyFn({ data: { id: selected!, body, new_status: status } }),
    onSuccess: () => { toast.success("Reply sent"); setBody(""); qc.invalidateQueries({ queryKey: ["admin", "tickets"] }); qc.invalidateQueries({ queryKey: ["admin", "ticket", selected] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="flex h-screen">
      <aside className="w-80 border-r bg-card/50 overflow-y-auto">
        <div className="p-4 border-b"><h1 className="font-semibold">Support Tickets</h1></div>
        {list.data?.map((t: any) => (
          <button key={t.id} onClick={() => setSelected(t.id)} className={`w-full text-left p-3 border-b hover:bg-muted ${selected === t.id ? "bg-muted" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium truncate">{t.subject}</div>
              <Badge variant={t.status === "open" ? "default" : t.status === "resolved" ? "outline" : "secondary"} className="text-[10px] capitalize">{t.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground truncate">{t.profiles?.email}</div>
            <div className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleString()}</div>
          </button>
        ))}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {msgs.data?.map((m: any) => (
                <div key={m.id} className={`rounded-xl p-4 max-w-2xl ${m.is_staff ? "bg-primary/10 ml-auto" : "bg-card border"}`}>
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">{m.is_staff ? "Staff" : "User"} · {new Date(m.created_at).toLocaleString()}</div>
                  <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                </div>
              ))}
            </div>
            <div className="border-t p-4 space-y-2">
              <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
              <div className="flex items-center justify-between">
                <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => reply.mutate()} disabled={reply.isPending || !body}>Send reply</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select a ticket</div>
        )}
      </main>
    </div>
  );
}
