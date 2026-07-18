import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateProfile, getAppSettings } from "@/lib/chats.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — CartMetrics AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const profileFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateProfile);
  const settingsFn = useServerFn(getAppSettings);
  const profile = useQuery({ queryKey: ["me"], queryFn: () => profileFn() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => settingsFn() });
  const enabledModels = (settings.data?.find((s) => s.key === "enabled_models")?.value as any[] | undefined)?.filter((m) => m.enabled) ?? [];

  const [displayName, setDisplayName] = useState("");
  const [preferredModel, setPreferredModel] = useState("");
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name ?? "");
      setPreferredModel(profile.data.preferred_model ?? "");
      setInstructions(profile.data.custom_instructions ?? "");
    }
  }, [profile.data]);

  const mut = useMutation({
    mutationFn: () => updateFn({ data: { display_name: displayName, preferred_model: preferredModel, custom_instructions: instructions || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me"] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border h-14 flex items-center px-6">
        <Link to="/chat" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to chat
        </Link>
      </header>
      <div className="max-w-3xl mx-auto py-10 px-6 space-y-6">
        <div>
          <h1 className="font-display text-4xl">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your profile and AI preferences.</p>
        </div>

        <Card className="p-6 space-y-5">
          <div>
            <h2 className="font-medium mb-1">Profile</h2>
            <p className="text-sm text-muted-foreground">This is how you appear inside CartMetrics AI.</p>
          </div>
          <div>
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={profile.data?.email ?? ""} disabled />
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <div>
            <h2 className="font-medium mb-1">AI preferences</h2>
            <p className="text-sm text-muted-foreground">Set your default model and custom instructions.</p>
          </div>
          <div>
            <Label>Default model</Label>
            <Select value={preferredModel} onValueChange={setPreferredModel}>
              <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
              <SelectContent>
                {enabledModels.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.name} · {m.provider} · {m.cost} credits/message</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Custom instructions</Label>
            <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} maxLength={2000} placeholder="e.g. Prefer concise answers. I'm a senior developer." />
            <div className="text-xs text-muted-foreground mt-1">{instructions.length} / 2000</div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-medium mb-1">Usage</h2>
          <p className="text-sm text-muted-foreground">Current credit balance</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-5xl text-gradient-amber">{profile.data?.credits?.toLocaleString() ?? "…"}</span>
            <span className="text-muted-foreground">credits</span>
          </div>
          <Link to="/credits" className="inline-block mt-4"><Button variant="outline">Buy more credits</Button></Link>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="bg-gradient-to-r from-amber-400 to-orange-500 text-background border-0">
            {mut.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
