import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminStats } from "@/lib/admin.functions";
import { Users, MessageSquare, CreditCard, DollarSign, Zap, AlertTriangle, TrendingUp, Activity } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Stat({ icon: Icon, label, value, hint, tone = "default" }: { icon: typeof Users; label: string; value: string | number; hint?: string; tone?: "default" | "warn" | "good" }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`rounded-lg p-2 ${tone === "warn" ? "bg-yellow-500/10 text-yellow-600" : tone === "good" ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const statsFn = useServerFn(adminStats);
  const q = useQuery({ queryKey: ["admin", "stats"], queryFn: () => statsFn(), refetchInterval: 30_000 });
  const s = q.data;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time platform health and usage.</p>
      </header>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {q.error && <div className="text-sm text-destructive">{(q.error as Error).message}</div>}

      {s && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={Users} label="Total users" value={s.totalUsers} hint={`+${s.newUsers24h} in 24h`} />
            <Stat icon={MessageSquare} label="Messages sent" value={s.totalMessages.toLocaleString()} hint={`${s.messages24h} in 24h`} />
            <Stat icon={CreditCard} label="Pending payments" value={s.pendingPayments} hint={`$${s.pendingCreditsTotal.toFixed(2)} value`} tone={s.pendingPayments > 0 ? "warn" : "default"} />
            <Stat icon={DollarSign} label="Total revenue" value={`$${s.totalRevenue.toFixed(2)}`} tone="good" />
            <Stat icon={Zap} label="Credits spent" value={s.totalCreditsSpent.toLocaleString()} />
            <Stat icon={Activity} label="Credits in circulation" value={s.creditsInCirculation.toLocaleString()} />
            <Stat icon={AlertTriangle} label="Suspended accounts" value={s.suspendedUsers} tone={s.suspendedUsers > 0 ? "warn" : "default"} />
            <Stat icon={TrendingUp} label="Chats total" value={s.totalChats.toLocaleString()} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-medium mb-3">Messages · last 7 days</h2>
              <MiniBars data={s.dailyMessages} />
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-medium mb-3">New signups · last 7 days</h2>
              <MiniBars data={s.dailyUsers} />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-medium mb-3">Most-used AI models</h2>
            <div className="space-y-2">
              {s.modelUsage.length === 0 && <div className="text-xs text-muted-foreground">No usage yet.</div>}
              {s.modelUsage.slice(0, 8).map((m) => {
                const max = s.modelUsage[0]?.count || 1;
                return (
                  <div key={m.model} className="flex items-center gap-3">
                    <div className="w-56 truncate text-xs font-mono">{m.model}</div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${(m.count / max) * 100}%` }} />
                    </div>
                    <div className="w-16 text-right text-xs tabular-nums">{m.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MiniBars({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full bg-primary/70 rounded-t" style={{ height: `${(d.count / max) * 100}%`, minHeight: 2 }} />
          <div className="text-[10px] text-muted-foreground">{d.date}</div>
        </div>
      ))}
    </div>
  );
}
