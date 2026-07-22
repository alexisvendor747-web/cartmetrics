import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ mode: z.enum(["signin", "signup", "forgot"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — CartMetrics AI" },
      { name: "description", content: "Sign in or create your CartMetrics AI account to access multi-model AI chat, credits and history." },
      { property: "og:title", content: "Sign in — CartMetrics AI" },
      { property: "og:description", content: "Sign in or create your CartMetrics AI account to access multi-model AI chat, credits and history." },
      { property: "og:url", content: "https://cartmetrics.lovable.app/auth" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Sign in — CartMetrics AI" },
      { name: "twitter:description", content: "Sign in or create your CartMetrics AI account." },
    ],
    links: [{ rel: "canonical", href: "https://cartmetrics.lovable.app/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/chat" }); });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/chat`, data: { display_name: name } },
        });
        if (error) throw error;
        toast.success("Account created! Redirecting...");
        navigate({ to: "/chat" });
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: "/chat" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for a reset link");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-hero grid place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center shadow-glow">
            <Sparkles className="h-4 w-4 text-background" />
          </div>
          <span className="font-display text-xl">CartMetrics <span className="text-gradient-amber">AI</span></span>
        </Link>
        <Card className="p-8 glass">
          <h1 className="font-display text-3xl">
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to continue where you left off." : mode === "signup" ? "100 free credits on us." : "We'll email you a secure reset link."}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div>
                <Label>Display name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Ada Lovelace" />
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} placeholder="you@work.com" />
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="flex justify-between items-center">
                  <Label>Password</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs text-muted-foreground hover:text-foreground">Forgot?</button>
                  )}
                </div>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={100} placeholder="At least 8 characters" />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-background border-0 hover:opacity-90">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-center text-muted-foreground">
            {mode === "signin" ? (
              <>New to CartMetrics? <button onClick={() => setMode("signup")} className="text-foreground underline">Create account</button></>
            ) : mode === "signup" ? (
              <>Already have an account? <button onClick={() => setMode("signin")} className="text-foreground underline">Sign in</button></>
            ) : (
              <button onClick={() => setMode("signin")} className="text-foreground underline">Back to sign in</button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
