import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminUnlock, adminSessionStatus } from "@/lib/admin-auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";

const OWNER_EMAIL = "apraisesamuel@gmail.com";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin Sign-in — CartMetrics AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const unlockFn = useServerFn(adminUnlock);
  const statusFn = useServerFn(adminSessionStatus);
  const [phase, setPhase] = useState<"credentials" | "passkey">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passkey, setPasskey] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already signed in as super admin AND unlocked → skip
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        try {
          const s = await statusFn();
          if (s.isSuperAdmin && s.unlocked) navigate({ to: "/admin" });
          else if (s.isSuperAdmin) setPhase("passkey");
        } catch { /* ignore */ }
      }
    })();
  }, [navigate, statusFn]);

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail !== OWNER_EMAIL) throw new Error("This email is not authorized for admin access.");
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) throw error;
      // check super admin
      const s = await statusFn();
      if (!s.isSuperAdmin) {
        await supabase.auth.signOut();
        throw new Error("This account does not have admin access.");
      }
      setPhase("passkey");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitPasskey(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await unlockFn({ data: { passkey } });
      toast.success("Admin session unlocked");
      navigate({ to: "/admin" });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Invalid passkey");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-semibold">Admin Console</h1>
            <p className="text-xs text-muted-foreground">Restricted access — super admin only</p>
          </div>
        </div>

        {phase === "credentials" ? (
          <form onSubmit={submitCreds} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={submitPasskey} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="passkey">Admin Passkey</Label>
              <Input id="passkey" type="password" required value={passkey} onChange={(e) => setPasskey(e.target.value)} autoComplete="off" placeholder="Second-factor passkey" autoFocus />
              <p className="text-xs text-muted-foreground">Required as a second factor for admin access.</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Unlock Admin Console
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back to app</Link>
        </div>
      </div>
    </div>
  );
}
