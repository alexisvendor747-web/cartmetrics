import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listFaqs, upsertFaq, deleteFaq } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/faqs")({
  head: () => ({ meta: [{ title: "FAQs — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type F = { id?: string; question: string; answer: string; category: string; sort_order: number; published: boolean };
const empty: F = { question: "", answer: "", category: "general", sort_order: 0, published: true };

function Page() {
  const qc = useQueryClient();
  const listFaqsFn = useServerFn(listFaqs);
  const list = useQuery({ queryKey: ["admin", "faqs"], queryFn: () => listFaqsFn() });
  const upFn = useServerFn(upsertFaq);
  const delFn = useServerFn(deleteFaq);
  const [ed, setEd] = useState<F | null>(null);
  const save = useMutation({
    mutationFn: (v: F) => upFn({ data: v }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin", "faqs"] }); setEd(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">FAQs</h1><p className="text-sm text-muted-foreground">Frequently asked questions shown in the help center.</p></div>
        <Button onClick={() => setEd({ ...empty })}><Plus className="h-4 w-4 mr-2" />New FAQ</Button>
      </header>

      <div className="space-y-2">
        {list.data?.map((f: any) => (
          <details key={f.id} className="rounded-xl border bg-card p-4 group">
            <summary className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">{f.question}</span>
              <div className="flex gap-1"><span className="text-xs text-muted-foreground mr-2">{f.category}</span>
                <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); setEd(f as F); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={async (e) => { e.preventDefault(); if (!confirm("Delete?")) return; await delFn({ data: { id: f.id } }); qc.invalidateQueries({ queryKey: ["admin", "faqs"] }); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </summary>
            <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{f.answer}</p>
          </details>
        ))}
      </div>

      <Dialog open={!!ed} onOpenChange={(o) => { if (!o) setEd(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{ed?.id ? "Edit" : "New"} FAQ</DialogTitle></DialogHeader>
          {ed && (
            <div className="grid gap-3">
              <div className="grid gap-1"><Label>Question</Label><Input value={ed.question} onChange={(e) => setEd({ ...ed, question: e.target.value })} /></div>
              <div className="grid gap-1"><Label>Answer</Label><Textarea rows={6} value={ed.answer} onChange={(e) => setEd({ ...ed, answer: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1"><Label>Category</Label><Input value={ed.category} onChange={(e) => setEd({ ...ed, category: e.target.value })} /></div>
                <div className="grid gap-1"><Label>Sort</Label><Input type="number" value={ed.sort_order} onChange={(e) => setEd({ ...ed, sort_order: Number(e.target.value) })} /></div>
                <label className="flex items-end gap-2 pb-2 text-sm"><Switch checked={ed.published} onCheckedChange={(v) => setEd({ ...ed, published: v })} />Published</label>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setEd(null)}>Cancel</Button><Button onClick={() => ed && save.mutate(ed)} disabled={save.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
