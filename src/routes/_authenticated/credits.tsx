import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAppSettings, getMyProfile } from "@/lib/chats.functions";
import { createPaymentRequest, listMyPayments, uploadProof } from "@/lib/payments.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Upload, Clock, XCircle, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/credits")({
  head: () => ({ meta: [{ title: "Credits — CartMetrics AI" }] }),
  component: CreditsPage,
});

function CreditsPage() {
  const qc = useQueryClient();
  const settingsFn = useServerFn(getAppSettings);
  const profileFn = useServerFn(getMyProfile);
  const listFn = useServerFn(listMyPayments);
  const createFn = useServerFn(createPaymentRequest);
  const uploadFn = useServerFn(uploadProof);

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => settingsFn() });
  const profile = useQuery({ queryKey: ["me"], queryFn: () => profileFn() });
  const payments = useQuery({ queryKey: ["my-payments"], queryFn: () => listFn() });

  const packs = (settings.data?.find((s) => s.key === "credit_packs")?.value as any[] | undefined) ?? [];
  const [openPack, setOpenPack] = useState<any | null>(null);
  const [bank, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [screenshot, setScreenshot] = useState<{ url: string; path: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3_500_000) return toast.error("Max 3.5MB");
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const result = await uploadFn({ data: { filename: file.name, dataUrl } });
      setScreenshot(result);
      toast.success("Uploaded");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); }
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!openPack) throw new Error("No pack");
      return createFn({ data: {
        credits: openPack.credits,
        amount: Number(amount),
        bank_name: bank,
        reference: ref,
        screenshot_url: screenshot?.url ?? null,
        note: note || null,
      }});
    },
    onSuccess: () => {
      toast.success("Payment submitted — we'll review shortly");
      qc.invalidateQueries({ queryKey: ["my-payments"] });
      setOpenPack(null);
      setBank(""); setAmount(""); setRef(""); setNote(""); setScreenshot(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border h-14 flex items-center px-6">
        <Link to="/chat" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to chat
        </Link>
      </header>
      <div className="max-w-5xl mx-auto py-10 px-6 space-y-8">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-4xl">Buy credits</h1>
            <p className="text-muted-foreground mt-1">Purchase credit packs to keep going.</p>
          </div>
          <Card className="px-6 py-4">
            <div className="text-xs text-muted-foreground">Current balance</div>
            <div className="text-3xl font-display text-gradient-amber">{profile.data?.credits?.toLocaleString() ?? "…"}</div>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {packs.map((p) => (
            <Card key={p.id} className={`p-6 relative ${p.popular ? "border-primary shadow-glow" : ""}`}>
              {p.popular && <div className="absolute -top-3 left-6 text-xs px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-background font-medium">Most popular</div>}
              <div className="font-medium">{p.label}</div>
              <div className="mt-3 font-display text-4xl">${p.price}</div>
              <div className="text-muted-foreground text-sm">{p.credits.toLocaleString()} credits</div>
              <Button onClick={() => { setOpenPack(p); setAmount(String(p.price)); }} className="w-full mt-6">Purchase</Button>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="font-display text-2xl mb-4">Payment history</h2>
          {payments.data && payments.data.length > 0 ? (
            <div className="space-y-2">
              {payments.data.map((p) => (
                <Card key={p.id} className="p-4 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">{p.credits.toLocaleString()} credits · ${p.amount}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Ref {p.reference} · {new Date(p.created_at).toLocaleString()}</div>
                  </div>
                  <StatusBadge status={p.status} />
                  {p.admin_note && <div className="text-xs text-muted-foreground w-full">Admin note: {p.admin_note}</div>}
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">No payments yet.</Card>
          )}
        </div>
      </div>

      <Dialog open={!!openPack} onOpenChange={(o) => !o && setOpenPack(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete your payment</DialogTitle>
            <DialogDescription>
              Transfer <b>${openPack?.price}</b> to unlock <b>{openPack?.credits?.toLocaleString()} credits</b>, then submit your proof below.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-accent p-4 text-sm space-y-1">
            <div><span className="text-muted-foreground">Bank:</span> CartMetrics AI Ltd.</div>
            <div><span className="text-muted-foreground">Account:</span> 0021 4453 8891 0022</div>
            <div><span className="text-muted-foreground">Ref:</span> your account email</div>
          </div>
          <div className="space-y-3">
            <div><Label>Your bank</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} maxLength={120} placeholder="e.g. Chase" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount paid ($)</Label><Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><Label>Payment reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={200} /></div>
            </div>
            <div>
              <Label>Screenshot (PNG/JPG, max 3.5MB)</Label>
              <div className="mt-1 flex items-center gap-2">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="text-sm" />
                {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
                {screenshot && <span className="text-xs text-primary">✓ Attached</span>}
              </div>
            </div>
            <div><Label>Note (optional)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenPack(null)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={!bank || !amount || !ref || submit.isPending} className="bg-gradient-to-r from-amber-400 to-orange-500 text-background border-0">
              {submit.isPending ? "Submitting…" : "I have paid — submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; label: string; cls: string }> = {
    pending: { icon: Clock, label: "Pending", cls: "bg-amber-500/20 text-amber-400 border-amber-400/30" },
    approved: { icon: CheckCircle2, label: "Approved", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-400/30" },
    rejected: { icon: XCircle, label: "Rejected", cls: "bg-destructive/20 text-destructive border-destructive/30" },
    info_requested: { icon: HelpCircle, label: "Info requested", cls: "bg-blue-500/20 text-blue-400 border-blue-400/30" },
  };
  const s = map[status] ?? map.pending;
  const I = s.icon;
  return <Badge variant="outline" className={s.cls}><I className="h-3 w-3 mr-1" /> {s.label}</Badge>;
}
