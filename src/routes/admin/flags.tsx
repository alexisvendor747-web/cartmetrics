import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listFlags, upsertFlag } from "@/lib/admin.functions";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/admin/flags")({
  head: () => ({ meta: [{ title: "Feature Flags — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "flags"], queryFn: () => useServerFn(listFlags)() });
  const upFn = useServerFn(upsertFlag);
  const [nk, setNk] = useState(""); const [nd, setNd] = useState("");

  async function toggle(key: string, enabled: boolean, description?: string) {
    try { await upFn({ data: { key, enabled, description } }); qc.invalidateQueries({ queryKey: ["admin", "flags"] }); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <header><h1 className="text-2xl font-semibold">Feature Flags</h1><p className="text-sm text-muted-foreground">Enable or disable app features in real time.</p></header>

      <div className="rounded-xl border bg-card divide-y">
        {list.data?.map((f: any) => (
          <div key={f.key} className="flex items-center justify-between p-4">
            <div>
              <div className="font-mono text-sm">{f.key}</div>
              {f.description && <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>}
            </div>
            <Switch checked={f.enabled} onCheckedChange={(v) => toggle(f.key, v, f.description)} />
          </div>
        ))}
        {list.data?.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No flags yet.</div>}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-medium mb-3">Add new flag</h2>
        <div className="flex gap-2">
          <Input placeholder="flag_key" value={nk} onChange={(e) => setNk(e.target.value)} />
          <Input placeholder="Description (optional)" value={nd} onChange={(e) => setNd(e.target.value)} />
          <Button onClick={async () => { if (!nk) return; await toggle(nk, false, nd || undefined); setNk(""); setNd(""); }}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
