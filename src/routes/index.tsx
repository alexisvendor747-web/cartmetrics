import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowRight, Sparkles, Zap, Shield, Layers, Bot, Code2, PenLine, Search, Image as ImageIcon, MessageSquare, Star, CircleCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listApprovedReviews, submitReview } from "@/lib/reviews.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CartMetrics AI — Think faster, build sharper" },
      { name: "description", content: "One premium AI workspace for chat, research, code, marketing and everything in between. GPT-5, Gemini, Claude and more." },
    ],
  }),
  beforeLoad: async () => {
    // If signed in, send to chat
    if (typeof window !== "undefined") {
      const { data } = await supabase.auth.getSession();
      if (data.session) throw redirect({ to: "/chat" });
    }
  },
  component: Landing,
});

const models = [
  { name: "GPT-5", provider: "OpenAI" },
  { name: "GPT-5.4", provider: "OpenAI" },
  { name: "Gemini 2.5 Pro", provider: "Google" },
  { name: "Gemini 3.5 Flash", provider: "Google" },
  { name: "Claude Opus", provider: "Anthropic" },
  { name: "DeepSeek V3", provider: "DeepSeek" },
  { name: "Mistral Large", provider: "Mistral" },
  { name: "Nano Banana", provider: "Google" },
];

const tools = [
  { icon: MessageSquare, title: "General AI Chat", desc: "Ask anything. Get thoughtful answers with sources." },
  { icon: Search, title: "Deep Research", desc: "Multi-step research that synthesizes across the web." },
  { icon: Code2, title: "Coding Assistant", desc: "Write, debug, explain and refactor across languages." },
  { icon: PenLine, title: "Writing & Marketing", desc: "Emails, essays, ad copy, briefs — with your voice." },
  { icon: ImageIcon, title: "Image Generation", desc: "Create logos, product shots and hero visuals." },
  { icon: Bot, title: "Custom Agents", desc: "Build assistants that live inside your workflow." },
];

const testimonials = [
  { quote: "Replaced four subscriptions with one workspace. My team ships twice as fast.", who: "Priya S. — Head of Growth" },
  { quote: "The best model routing I've used. It just picks the right brain for the job.", who: "Marcus K. — Senior Engineer" },
  { quote: "Finally an AI product that doesn't feel like a chatbot bolted onto a landing page.", who: "Amelia R. — Founder" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 backdrop-blur-xl bg-background/70">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center shadow-glow">
              <Sparkles className="h-4 w-4 text-background" />
            </div>
            <span className="font-display text-lg">CartMetrics <span className="text-gradient-amber">AI</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition">Features</a>
            <a href="#models" className="hover:text-foreground transition">Models</a>
            <a href="#pricing" className="hover:text-foreground transition">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth" search={{ mode: "signup" }}><Button size="sm" className="bg-gradient-to-r from-amber-400 to-orange-500 text-background hover:opacity-90 border-0">Get started</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-hero overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: "40px 40px", maskImage: "var(--grid-fade)" }} />
        <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-4 py-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            New — Gemini 3.5 Flash and GPT-5.4 available today
          </div>
          <h1 className="mt-8 font-display text-6xl md:text-8xl leading-[0.95] max-w-4xl mx-auto">
            Every AI you love,<br /><span className="text-gradient-amber italic">in one workspace.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            CartMetrics AI is a premium chat, research, and creation studio powered by the world's best models. Built for students, developers, marketers, agencies and enterprise teams.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button size="lg" className="bg-gradient-to-r from-amber-400 to-orange-500 text-background hover:opacity-90 border-0 px-8">
                Start free — 100 credits <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="px-8">See what it can do</Button>
            </a>
          </div>

          {/* Dashboard preview */}
          <div className="mt-20 mx-auto max-w-5xl">
            <div className="glass rounded-2xl p-3 shadow-glow">
              <div className="rounded-xl bg-card overflow-hidden border border-border">
                <div className="flex items-center gap-2 px-4 h-9 border-b border-border">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
                  <span className="mx-auto text-xs text-muted-foreground">cartmetrics.ai / chat</span>
                </div>
                <div className="grid grid-cols-[220px_1fr] min-h-[400px]">
                  <div className="border-r border-border p-3 space-y-2 bg-sidebar">
                    <div className="text-xs text-muted-foreground px-2 py-1.5">Today</div>
                    {["Q3 marketing plan", "Refactor auth flow", "Landing hero copy"].map((t, i) => (
                      <div key={t} className={`px-2 py-2 text-sm rounded-md ${i===0 ? "bg-accent" : "text-muted-foreground"}`}>{t}</div>
                    ))}
                  </div>
                  <div className="p-6 space-y-4 text-left">
                    <div className="text-sm text-muted-foreground">You</div>
                    <div className="text-sm">Draft a launch email for our Q3 rollout — friendly, confident, under 120 words.</div>
                    <div className="text-sm text-primary">CartMetrics AI · GPT-5</div>
                    <div className="glass rounded-lg p-4 text-sm animate-shimmer">
                      Hey team, big news — Q3 is here and we're rolling out the most anticipated release of the year...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <div className="text-sm text-primary">FEATURES</div>
            <h2 className="mt-3 font-display text-5xl">One workspace, every kind of thinking.</h2>
            <p className="mt-4 text-muted-foreground">Chat, research, code, write, generate images. Switch models mid-conversation. Save everything.</p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tools.map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="p-6 bg-card border-border hover:border-primary/40 transition group">
                <div className="h-11 w-11 rounded-lg bg-accent grid place-items-center group-hover:bg-primary/20 transition">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-5 text-lg font-medium">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Models */}
      <section id="models" className="py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-sm text-primary">MODELS</div>
            <h2 className="mt-3 font-display text-5xl">Every frontier model. One bill.</h2>
            <p className="mt-4 text-muted-foreground">Automatic routing picks the best brain for the task. You can always override.</p>
          </div>
          <div className="mt-14 flex flex-wrap justify-center gap-3">
            {models.map((m) => (
              <div key={m.name} className="glass rounded-full px-5 py-2.5 text-sm">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground ml-2">· {m.provider}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-sm text-primary">HOW IT WORKS</div>
          <h2 className="mt-3 font-display text-5xl">Set up in 30 seconds.</h2>
          <div className="mt-14 grid md:grid-cols-3 gap-8">
            {[
              { n: "01", t: "Create an account", d: "Every new user gets 100 free credits to explore." },
              { n: "02", t: "Pick a model or let us decide", d: "Chat, code, research, generate — one interface." },
              { n: "03", t: "Ship your work", d: "Export, share, or export as markdown / PDF." },
            ].map((s) => (
              <div key={s.n}>
                <div className="font-display text-5xl text-gradient-amber">{s.n}</div>
                <div className="mt-4 text-lg font-medium">{s.t}</div>
                <div className="mt-2 text-sm text-muted-foreground">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-sm text-primary">PRICING</div>
            <h2 className="mt-3 font-display text-5xl">Pay only for what you use.</h2>
            <p className="mt-4 text-muted-foreground">No subscription lock-in. Buy credits, use them across every AI tool.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-4">
            {[
              { name: "Starter", credits: 1000, price: 10 },
              { name: "Pro", credits: 2000, price: 18, popular: true },
              { name: "Business", credits: 5000, price: 40 },
              { name: "Enterprise", credits: 10000, price: 75 },
            ].map((p) => (
              <Card key={p.name} className={`p-6 relative ${p.popular ? "border-primary shadow-glow" : "border-border"}`}>
                {p.popular && <div className="absolute -top-3 left-6 text-xs px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-background font-medium">Most popular</div>}
                <div className="font-medium">{p.name}</div>
                <div className="mt-4 font-display text-4xl">${p.price}</div>
                <div className="text-sm text-muted-foreground">{p.credits.toLocaleString()} credits</div>
                <ul className="mt-6 space-y-2 text-sm">
                  {["All AI models","All AI tools","Chat history","Export & share"].map((f) => (
                    <li key={f} className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-primary" /> {f}</li>
                  ))}
                </ul>
                <Link to="/auth" search={{ mode: "signup" }} className="mt-6 block">
                  <Button className="w-full" variant={p.popular ? "default" : "outline"}>Get started</Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials + Review submission */}
      <section id="reviews" className="py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-sm text-primary">LOVED BY TEAMS</div>
          <h2 className="mt-3 font-display text-5xl">The AI upgrade you actually feel.</h2>
          <ReviewsBlock fallback={testimonials} />
        </div>
      </section>

      {/* Security */}
      <section className="py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-sm text-primary">SECURITY</div>
            <h2 className="mt-3 font-display text-5xl">Enterprise-grade by default.</h2>
            <p className="mt-4 text-muted-foreground">Encrypted at rest and in transit. Row-level access control. Never trained on your data.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { i: Shield, t: "SOC 2 aligned" },
              { i: Layers, t: "Encrypted storage" },
              { i: Zap, t: "Streaming responses" },
              { i: Bot, t: "No model training" },
            ].map(({ i: I, t }) => (
              <Card key={t} className="p-5"><I className="h-5 w-5 text-primary" /><div className="mt-3 font-medium">{t}</div></Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 border-t border-border">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-sm text-primary">FAQ</div>
          <h2 className="mt-3 font-display text-5xl">Questions, answered.</h2>
          <Accordion type="single" collapsible className="mt-10">
            {[
              { q: "How do credits work?", a: "Every AI request costs a small number of credits depending on the model. Simpler models cost less, frontier models cost more. You get 100 free credits when you sign up." },
              { q: "Which models do you support?", a: "GPT-5 family, Gemini 2.5 & 3.5, Claude, DeepSeek, Mistral, and more image models. Admins can enable or disable individual models." },
              { q: "Is my data private?", a: "Yes. Your chats are stored under strict row-level access. We never share data with model providers for training." },
              { q: "How do payments work?", a: "Purchase credit packs via manual bank transfer. Uploads are reviewed and credits are added the same business day." },
              { q: "Can I use it on mobile?", a: "Yes — CartMetrics AI is fully responsive on desktop, tablet, and mobile." },
            ].map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 border-t border-border">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="font-display text-6xl">Ready to think faster?</h2>
          <p className="mt-4 text-lg text-muted-foreground">Start with 100 free credits. No card required.</p>
          <Link to="/auth" search={{ mode: "signup" }} className="mt-8 inline-block">
            <Button size="lg" className="bg-gradient-to-r from-amber-400 to-orange-500 text-background hover:opacity-90 border-0 px-10">
              Get started <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-amber-400 to-orange-600" />
            <span>CartMetrics AI © {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ReviewsBlock({ fallback }: { fallback: { quote: string; who: string }[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listApprovedReviews);
  const submitFn = useServerFn(submitReview);
  const reviewsQuery = useQuery({ queryKey: ["public-reviews"], queryFn: () => listFn() });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const mut = useMutation({
    mutationFn: (payload: { author_name: string; author_email?: string; rating: number; comment: string }) =>
      submitFn({ data: payload }),
    onSuccess: () => {
      toast.success("Thanks! Your review will appear after a quick review.");
      setName(""); setEmail(""); setRating(5); setComment("");
      qc.invalidateQueries({ queryKey: ["public-reviews"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not submit review"),
  });
  const reviews = reviewsQuery.data ?? [];
  const items = reviews.length > 0
    ? reviews.map((r) => ({ quote: r.comment, who: r.author_name, rating: r.rating }))
    : fallback.map((t) => ({ quote: t.quote, who: t.who, rating: 5 }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || comment.trim().length < 3) return;
    mut.mutate({ author_name: name.trim(), author_email: email.trim() || undefined, rating, comment: comment.trim() });
  }

  return (
    <>
      <div className="mt-14 grid md:grid-cols-3 gap-6">
        {items.slice(0, 9).map((t, i) => (
          <Card key={`${t.who}-${i}`} className="p-6 bg-card">
            <div className="flex text-amber-400 gap-0.5">
              {[...Array(5)].map((_, j) => (
                <Star key={j} className={`h-4 w-4 ${j < t.rating ? "fill-current" : "opacity-30"}`} />
              ))}
            </div>
            <p className="mt-4 text-lg font-display italic">"{t.quote}"</p>
            <div className="mt-4 text-sm text-muted-foreground">{t.who}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-14 p-6 md:p-8 bg-card">
        <div className="max-w-2xl">
          <h3 className="font-display text-2xl">Leave a review</h3>
          <p className="mt-1 text-sm text-muted-foreground">Tell us how CartMetrics AI is working for you. Approved reviews appear here.</p>
        </div>
        <form onSubmit={onSubmit} className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rv-name">Your name</Label>
            <Input id="rv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rv-email">Email (optional)</Label>
            <Input id="rv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Rating</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className="p-1"
                >
                  <Star className={`h-6 w-6 ${n <= rating ? "text-amber-400 fill-current" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="rv-comment">Your review</Label>
            <Textarea id="rv-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={2000} required minLength={3} />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={mut.isPending} className="bg-gradient-to-r from-amber-400 to-orange-500 text-background border-0">
              {mut.isPending ? "Submitting…" : "Submit review"}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
