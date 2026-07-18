import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listSettings, updateSettings } from "@/lib/admin.functions";
import { adminRotatePasskey } from "@/lib/admin-auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "settings"], queryFn: () => useServerFn(listSettings)() });
  const upFn = useServerFn(updateSettings);
  const rotFn = useServerFn(adminRotatePasskey);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [oldPk, setOldPk] = useState(""); const [newPk, setNewPk] = useState("");

  const save = useMutation({
    mutationFn: (v: { key: string; value: unknown }) => upFn({ data: v }),
    onSuccess: () => { toast.success("Setting updated"); qc.invalidateQueries({ queryKey: ["admin", "settings"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <header><h1 className="text-2xl font-semibold">System Settings</h1><p className="text-sm text-muted-foreground">Global configuration values.</p></header>

      <div className="space-y-3">
        {list.data?.map((s: any) => {
          const cur = drafts[s.key] ?? JSON.stringify(s.value, null, 2);
          return (
            <div key={s.key} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-sm">{s.key}</Label>
                <span className="text-xs text-muted-foreground">Updated {new Date(s.updated_at).toLocaleString()}</span>
              </div>
              <Textarea rows={6} value={cur} onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })} className="font-mono text-xs" />
              <div className="flex justify-end mt-2">
                <Button size="sm" onClick={() => {
                  try { const parsed = JSON.parse(cur); save.mutate({ key: s.key, value: parsed }); }
                  catch { toast.error("Invalid JSON"); }
                }}>Save</Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h2 className="font-medium">Rotate Admin Passkey</h2></div>
        <p className="text-xs text-muted-foreground">Second-factor passkey required when signing into the admin console.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1"><Label>Current passkey</Label><Input type="password" value={oldPk} onChange={(e) => setOldPk(e.target.value)} /></div>
          <div className="grid gap-1"><Label>New passkey (min 12 chars)</Label><Input type="password" value={newPk} onChange={(e) => setNewPk(e.target.value)} /></div>
        </div>
        <div className="flex justify-end">
          <Button onClick={async () => { try { await rotFn({ data: { old_passkey: oldPk, new_passkey: newPk } }); toast.success("Passkey rotated"); setOldPk(""); setNewPk(""); } catch (e) { toast.error((e as Error).message); } }}>Rotate</Button>
        </div>
      </div>
    </div>
  );
}
