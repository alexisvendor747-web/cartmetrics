import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listBlogPosts, upsertBlogPost, deleteBlogPost } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/blog")({
  head: () => ({ meta: [{ title: "Blog — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type B = { id?: string; slug: string; title: string; excerpt?: string | null; body_md: string; cover_url?: string | null; published: boolean };
const empty: B = { slug: "", title: "", excerpt: "", body_md: "", cover_url: "", published: false };

function Page() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "blog"], queryFn: () => useServerFn(listBlogPosts)() });
  const upFn = useServerFn(upsertBlogPost);
  const delFn = useServerFn(deleteBlogPost);
  const [ed, setEd] = useState<B | null>(null);
  const save = useMutation({
    mutationFn: (v: B) => upFn({ data: { ...v, cover_url: v.cover_url || null, excerpt: v.excerpt || null } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin", "blog"] }); setEd(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Blog</h1><p className="text-sm text-muted-foreground">Content marketing posts.</p></div>
        <Button onClick={() => setEd({ ...empty })}><Plus className="h-4 w-4 mr-2" />New post</Button>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {list.data?.map((p: any) => (
          <div key={p.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><h3 className="font-semibold truncate">{p.title}</h3><Badge variant={p.published ? "default" : "outline"} className="text-[10px]">{p.published ? "Live" : "Draft"}</Badge></div>
                <div className="text-xs text-muted-foreground font-mono">/{p.slug}</div>
                {p.excerpt && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{p.excerpt}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setEd(p as B)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (!confirm("Delete?")) return; await delFn({ data: { id: p.id } }); qc.invalidateQueries({ queryKey: ["admin", "blog"] }); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!ed} onOpenChange={(o) => { if (!o) setEd(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{ed?.id ? "Edit" : "New"} blog post</DialogTitle></DialogHeader>
          {ed && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1"><Label>Title</Label><Input value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} /></div>
                <div className="grid gap-1"><Label>Slug</Label><Input value={ed.slug} onChange={(e) => setEd({ ...ed, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></div>
              </div>
              <div className="grid gap-1"><Label>Cover image URL</Label><Input value={ed.cover_url ?? ""} onChange={(e) => setEd({ ...ed, cover_url: e.target.value })} /></div>
              <div className="grid gap-1"><Label>Excerpt</Label><Textarea rows={2} value={ed.excerpt ?? ""} onChange={(e) => setEd({ ...ed, excerpt: e.target.value })} /></div>
              <div className="grid gap-1"><Label>Body (Markdown)</Label><Textarea rows={16} value={ed.body_md} onChange={(e) => setEd({ ...ed, body_md: e.target.value })} className="font-mono text-sm" /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={ed.published} onCheckedChange={(v) => setEd({ ...ed, published: v })} />Published</label>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setEd(null)}>Cancel</Button><Button onClick={() => ed && save.mutate(ed)} disabled={save.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
