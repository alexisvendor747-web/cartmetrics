import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminListReviews, adminUpdateReview, adminDeleteReview } from "@/lib/reviews.functions";
import { Button } from "@/components/ui/button";
import { Star, Trash2, Check, X, Pin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/reviews")({
  head: () => ({ meta: [{ title: "Reviews · Admin" }, { name: "robots", content: "noindex" }] }),
  component: Reviews,
});

function Reviews() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListReviews);
  const updateFn = useServerFn(adminUpdateReview);
  const delFn = useServerFn(adminDeleteReview);
  const q = useQuery({ queryKey: ["admin", "reviews"], queryFn: () => listFn(), retry: false });

  const update = useMutation({
    mutationFn: (v: { id: string; approved?: boolean; featured?: boolean }) => updateFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "reviews"] }); qc.invalidateQueries({ queryKey: ["public-reviews"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin", "reviews"] }); qc.invalidateQueries({ queryKey: ["public-reviews"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <p className="text-sm text-muted-foreground">Approve, feature, or remove homepage reviews.</p>
      </header>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {q.error && <div className="text-sm text-destructive">{(q.error as Error).message}</div>}

      <div className="space-y-3">
        {(q.data ?? []).map((r) => (
          <div key={r.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{r.author_name}
                  {r.author_email && <span className="text-muted-foreground font-normal"> · {r.author_email}</span>}
                </div>
                <div className="flex text-amber-400 gap-0.5 mt-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-current" : "opacity-30"}`} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${r.approved ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"}`}>{r.approved ? "Approved" : "Pending"}</span>
                {r.featured && <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">Featured</span>}
              </div>
            </div>
            <p className="mt-3 text-sm whitespace-pre-wrap">{r.comment}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.approved ? (
                <Button size="sm" variant="outline" onClick={() => update.mutate({ id: r.id, approved: false })}>
                  <X className="h-3.5 w-3.5 mr-1" />Unapprove
                </Button>
              ) : (
                <Button size="sm" onClick={() => update.mutate({ id: r.id, approved: true })}>
                  <Check className="h-3.5 w-3.5 mr-1" />Approve
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: r.id, featured: !r.featured })}>
                <Pin className="h-3.5 w-3.5 mr-1" />{r.featured ? "Unfeature" : "Feature"}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete review?")) del.mutate(r.id); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
              </Button>
            </div>
          </div>
        ))}
        {q.data && q.data.length === 0 && <div className="text-sm text-muted-foreground">No reviews yet.</div>}
      </div>
    </div>
  );
}
