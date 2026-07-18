import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAllPayments, decidePayment } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Admin" }, { name: "robots", content: "noindex" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllPayments);
  const decideFn = useServerFn(decidePayment);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewing, setReviewing] = useState<{ id: string; decision: "approved" | "rejected" | "info_requested" } | null>(null);
  const [note, setNote] = useState("");

  const list = useQuery({ queryKey: ["admin", "payments"], queryFn: () => listFn() });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" | "info_requested"; admin_note?: string }) =>
      decideFn({ data: v }),
    onSuccess: () => { toast.success("Decision recorded"); qc.invalidateQueries({ queryKey: ["admin", "payments"] }); setReviewing(null); setNote(""); },
    onError: (e) => toast.error((e as Error).message),
  });

  const filtered = (list.data ?? []).filter((p) => filter === "all" || p.status === filter);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">Approve or reject manual credit purchases.</p>
        </div>
        <div className="flex gap-1 rounded-lg border p-1 bg-card">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
      </header>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">User</th>
              <th className="text-left px-4 py-2">Bank</th>
              <th className="text-left px-4 py-2">Reference</th>
              <th className="text-right px-4 py-2">Amount</th>
              <th className="text-right px-4 py-2">Credits</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Proof</th>
              <th className="text-left px-4 py-2">Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {filtered.map((p: any) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="text-xs">{p.profiles?.display_name ?? p.profiles?.email}</div>
                  <div className="text-xs text-muted-foreground">{p.profiles?.email}</div>
                </td>
                <td className="px-4 py-3">{p.bank_name}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.reference}</td>
                <td className="px-4 py-3 text-right tabular-nums">${Number(p.amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{p.credits.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <Badge variant={p.status === "pending" ? "secondary" : p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "outline"} className="capitalize">{p.status.replace("_", " ")}</Badge>
                </td>
                <td className="px-4 py-3">
                  {p.screenshot_url ? <a href={p.screenshot_url} target="_blank" rel="noreferrer" className="text-primary text-xs underline">View</a> : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  {p.status === "pending" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 text-green-600" onClick={() => setReviewing({ id: p.id, decision: "approved" })}><CheckCircle2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setReviewing({ id: p.id, decision: "rejected" })}><XCircle className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setReviewing({ id: p.id, decision: "info_requested" })}><HelpCircle className="h-4 w-4" /></Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!list.isLoading && filtered.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted-foreground text-sm">No payments to show.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) setReviewing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="capitalize">{reviewing?.decision.replace("_", " ")} payment</DialogTitle></DialogHeader>
          <Textarea placeholder="Optional note to user…" value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button onClick={() => reviewing && decide.mutate({ id: reviewing.id, decision: reviewing.decision, admin_note: note || undefined })} disabled={decide.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
