import { createFileRoute, Outlet, Link, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminSessionStatus, adminLock } from "@/lib/admin-auth.functions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, CreditCard, Package, Megaphone, HelpCircle, Flag, Settings,
  Mail, LifeBuoy, FileText, ScrollText, LogOut, ShieldCheck, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/admin/login" });
  },
  component: AdminLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/packages", label: "Credit Packages", icon: Package },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/faqs", label: "FAQs", icon: HelpCircle },
  { to: "/admin/flags", label: "Feature Flags", icon: Flag },
  { to: "/admin/broadcast", label: "Broadcast Email", icon: Mail },
  { to: "/admin/support", label: "Support", icon: LifeBuoy },
  { to: "/admin/blog", label: "Blog", icon: FileText },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminLayout() {
  const navigate = useNavigate();
  const statusFn = useServerFn(adminSessionStatus);
  const lockFn = useServerFn(adminLock);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const status = useQuery({
    queryKey: ["admin", "status"],
    queryFn: () => statusFn(),
    refetchInterval: 5 * 60 * 1000,
  });

  if (status.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status.data && !status.data.isSuperAdmin) {
    // Not a super admin → send home
    void supabase.auth.signOut();
    navigate({ to: "/" });
    return null;
  }

  if (status.data && !status.data.unlocked) {
    navigate({ to: "/admin/login" });
    return null;
  }

  async function handleLock() {
    try {
      await lockFn();
      await supabase.auth.signOut();
      toast.success("Signed out");
      navigate({ to: "/admin/login" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign out failed");
    }
  }

  const sidebar = (
      <aside className="w-64 max-w-[82vw] border-r bg-card/95 backdrop-blur flex flex-col shrink-0 h-full">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Admin Console</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CartMetrics AI</div>
          </div>
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setMobileOpen(false)}><X className="h-4 w-4" /></Button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setMobileOpen(false)}
              >
                <Icon className="h-4 w-4" />{item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t space-y-1">
          <Link to={"/chat" as never} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            ← Back to App
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLock} className="w-full justify-start text-muted-foreground">
            <LogOut className="h-4 w-4 mr-2" />Sign out
          </Button>
        </div>
      </aside>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}
      <main className="flex-1 min-w-0">
        <div className="lg:hidden h-12 border-b flex items-center gap-2 px-3">
          <Button size="icon" variant="ghost" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="text-sm font-medium">Admin Console</div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
