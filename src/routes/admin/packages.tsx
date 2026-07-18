import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listPackages, upsertPackage, deletePackage } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star } from "lucide-react";

export const Route = createFileRoute("/admin/packages")({
  head: () => ({ meta: [{ title: "Credit Packages — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type Pkg = { id?: string; name: string; credits: number; price: number; currency: string; bonus_credits: number; featured: boolean; active: boolean; sort_order: number; description?: string | null };

const empty: Pkg = { name: "", credits: 1000, price: 10, currency: "USD", bonus_credits: 0, featured: false, active: true, sort_order: 0, description: "" };

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPackages);
  const upFn = useServerFn(upsertPackage);
  const delFn = useServerFn(deletePackage);
  const list = useQuery({ queryKey: ["admin", "packages"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<Pkg | null>(null);

  const save = useMutation({
    mutationFn: (v: Pkg) => upFn({ data: v }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin", "packages"] }); setEditing(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Credit Packages</h1><p className="text-sm text-muted-foreground">Manage pricing tiers users can purchase.</p></div>
        <Button onClick={() => setEditing({ ...empty })}><Plus className="h-4 w-4 mr-2" />New package</Button>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.data?.map((p: any) => (
          <div key={p.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2"><h3 className="font-semibold">{p.name}</h3>{p.featured && <Star className="h-4 w-4 text-primary fill-primary" />}</div>
                <div className="text-2xl font-bold mt-1">${Number(p.price).toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">{p.credits.toLocaleString()} credits{p.bonus_credits ? ` + ${p.bonus_credits} bonus` : ""}</div>
              </div>
              <Badge variant={p.active ? "default" : "outline"} className="text-[10px]">{p.active ? "Active" : "Hidden"}</Badge>
            </div>
            {p.description && <p className="text-xs text-muted-foreground mt-2">{p.description}</p>}
            <div className="flex gap-1 mt-3">
              <Button size="sm" variant="ghost" onClick={() => setEditing(p as Pkg)}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (!confirm("Delete?")) return; try { await delFn({ data: { id: p.id } }); toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin", "packages"] }); } catch (e) { toast.error((e as Error).message); } }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} package</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-1"><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1"><Label>Credits</Label><Input type="number" value={editing.credits} onChange={(e) => setEditing({ ...editing, credits: Number(e.target.value) })} /></div>
                <div className="grid gap-1"><Label>Bonus credits</Label><Input type="number" value={editing.bonus_credits} onChange={(e) => setEditing({ ...editing, bonus_credits: Number(e.target.value) })} /></div>
                <div className="grid gap-1"><Label>Price</Label><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></div>
                <div className="grid gap-1"><Label>Currency</Label><Input value={editing.currency} onChange={(e) => setEditing({ ...editing, currency: e.target.value.toUpperCase() })} /></div>
                <div className="grid gap-1"><Label>Sort order</Label><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              </div>
              <div className="grid gap-1"><Label>Description</Label><Textarea rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />Active</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.featured} onCheckedChange={(v) => setEditing({ ...editing, featured: v })} />Featured</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
