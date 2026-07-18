import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAnnouncements, upsertAnnouncement, deleteAnnouncement } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/announcements")({
  head: () => ({ meta: [{ title: "Announcements — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type A = { id?: string; title: string; body: string; severity: "info" | "success" | "warning" | "critical"; active: boolean };
const empty: A = { title: "", body: "", severity: "info", active: true };

function Page() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "announcements"], queryFn: () => useServerFn(listAnnouncements)() });
  const upFn = useServerFn(upsertAnnouncement);
  const delFn = useServerFn(deleteAnnouncement);
  const [ed, setEd] = useState<A | null>(null);
  const save = useMutation({
    mutationFn: (v: A) => upFn({ data: v }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin", "announcements"] }); setEd(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Announcements</h1><p className="text-sm text-muted-foreground">Post platform-wide messages users see in-app.</p></div>
        <Button onClick={() => setEd({ ...empty })}><Plus className="h-4 w-4 mr-2" />New</Button>
      </header>

      <div className="space-y-2">
        {list.data?.map((a: any) => (
          <div key={a.id} className="rounded-xl border bg-card p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h3 className="font-medium">{a.title}</h3><Badge variant="outline" className="text-[10px] capitalize">{a.severity}</Badge>{!a.active && <Badge variant="outline" className="text-[10px]">Hidden</Badge>}</div>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setEd(a as A)}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (!confirm("Delete?")) return; await delFn({ data: { id: a.id } }); qc.invalidateQueries({ queryKey: ["admin", "announcements"] }); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!ed} onOpenChange={(o) => { if (!o) setEd(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{ed?.id ? "Edit" : "New"} announcement</DialogTitle></DialogHeader>
          {ed && (
            <div className="grid gap-3">
              <div className="grid gap-1"><Label>Title</Label><Input value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} /></div>
              <div className="grid gap-1"><Label>Body</Label><Textarea rows={5} value={ed.body} onChange={(e) => setEd({ ...ed, body: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1"><Label>Severity</Label>
                  <Select value={ed.severity} onValueChange={(v: any) => setEd({ ...ed, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm"><Switch checked={ed.active} onCheckedChange={(v) => setEd({ ...ed, active: v })} />Active</label>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setEd(null)}>Cancel</Button><Button onClick={() => ed && save.mutate(ed)} disabled={save.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
