import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAuditLog } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Audit Log — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const listAuditLogFn = useServerFn(listAuditLog);
  const list = useQuery({ queryKey: ["admin", "audit"], queryFn: () => listAuditLogFn() });

  return (
    <div className="p-6 space-y-4">
      <header><h1 className="text-2xl font-semibold">Audit Log</h1><p className="text-sm text-muted-foreground">Every administrative action, most recent first.</p></header>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">When</th>
              <th className="text-left px-4 py-2">Action</th>
              <th className="text-left px-4 py-2">Target</th>
              <th className="text-left px-4 py-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2"><Badge variant="outline" className="text-[10px] font-mono">{r.action}</Badge></td>
                <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{r.target_type ? `${r.target_type}:${r.target_id ?? ""}` : "—"}</td>
                <td className="px-4 py-2 text-xs font-mono text-muted-foreground max-w-md truncate">{r.metadata ? JSON.stringify(r.metadata) : ""}</td>
              </tr>
            ))}
            {list.data?.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
