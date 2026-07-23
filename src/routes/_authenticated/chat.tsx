import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listChats, createChat, renameChat, togglePin, deleteChat, getMyProfile, createSupportTicket, listMySupportTickets, getMyTicketThread, replyToMyTicket } from "@/lib/chats.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Pin, PinOff, MoreHorizontal, Pencil, Trash2, Sparkles, Settings, CreditCard, LogOut, ShieldCheck, Menu, X, LifeBuoy, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatLayout,
});

function ChatLayout() {
  const qc = useQueryClient();
  const listFn = useServerFn(listChats);
  const createFn = useServerFn(createChat);
  const renameFn = useServerFn(renameChat);
  const pinFn = useServerFn(togglePin);
  const delFn = useServerFn(deleteChat);
  const profileFn = useServerFn(getMyProfile);
  const createTicketFn = useServerFn(createSupportTicket);
  const listTicketsFn = useServerFn(listMySupportTickets);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [query, setQuery] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportBody, setSupportBody] = useState("");
  const [lowCreditPrompted, setLowCreditPrompted] = useState(false);

  const chats = useQuery({ queryKey: ["chats"], queryFn: () => listFn() });
  const profile = useQuery({ queryKey: ["me"], queryFn: () => profileFn() });
  const tickets = useQuery({ queryKey: ["my-support-tickets"], queryFn: () => listTicketsFn(), enabled: supportOpen });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: {} }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["chats"] }); navigate({ to: "/chat/$chatId", params: { chatId: c.id } }); setMobileOpen(false); },
  });
  const renameMut = useMutation({
    mutationFn: (v: { id: string; title: string }) => renameFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["chats"] }); toast.success("Renamed"); setRenameId(null); },
  });
  const pinMut = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => pinFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chats"] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      if (pathname.includes(id)) navigate({ to: "/chat" });
      toast.success("Deleted");
    },
  });
  const supportMut = useMutation({
    mutationFn: () => createTicketFn({ data: { subject: supportSubject, body: supportBody, priority: "normal" } }),
    onSuccess: () => {
      toast.success("Message sent to support");
      setSupportSubject("");
      setSupportBody("");
      qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
      setSupportOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unable to send message"),
  });

  const filtered = useMemo(() => {
    if (!chats.data) return [];
    return chats.data.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));
  }, [chats.data, query]);
  const pinned = filtered.filter((c) => c.pinned);
  const unpinned = filtered.filter((c) => !c.pinned);

  useEffect(() => {
    if (!lowCreditPrompted && typeof profile.data?.credits === "number" && profile.data.credits <= 20) {
      toast.warning("Your credits are low. Buy more credits to keep chatting.");
      setLowCreditPrompted(true);
    }
  }, [lowCreditPrompted, profile.data?.credits]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground w-72">
      <div className="p-3 flex items-center justify-between border-b border-sidebar-border">
        <Link to="/chat" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center">
            <Sparkles className="h-3.5 w-3.5 text-background" />
          </div>
          <span className="font-display">CartMetrics</span>
        </Link>
        <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close sidebar"><X className="h-4 w-4" /><span className="sr-only">Close sidebar</span></Button>
      </div>
      <div className="p-3 space-y-2">
        <Button onClick={() => createMut.mutate()} className="w-full justify-start gap-2 bg-gradient-to-r from-amber-400 to-orange-500 text-background border-0 hover:opacity-90">
          <Plus className="h-4 w-4" /> New chat
        </Button>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" className="pl-8 h-9 bg-sidebar-accent border-sidebar-border" />
        </div>
        <Button variant="ghost" onClick={() => setSupportOpen(true)} className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
          <LifeBuoy className="h-4 w-4" /> Support
        </Button>
      </div>
      <ScrollArea className="flex-1 px-2">
        {pinned.length > 0 && <ChatSection label="Pinned" items={pinned} pathname={pathname} onRename={(c) => { setRenameId(c.id); setRenameValue(c.title); }} onPin={(c) => pinMut.mutate({ id: c.id, pinned: !c.pinned })} onDelete={(c) => delMut.mutate(c.id)} onSelect={() => setMobileOpen(false)} />}
        {unpinned.length > 0 && <ChatSection label="Recent" items={unpinned} pathname={pathname} onRename={(c) => { setRenameId(c.id); setRenameValue(c.title); }} onPin={(c) => pinMut.mutate({ id: c.id, pinned: !c.pinned })} onDelete={(c) => delMut.mutate(c.id)} onSelect={() => setMobileOpen(false)} />}
        {chats.data?.length === 0 && <div className="text-center text-xs text-muted-foreground py-8">No chats yet.<br />Click "New chat" to start.</div>}
      </ScrollArea>
      <div className="p-3 border-t border-sidebar-border">
        {(profile.data?.credits ?? 999) <= 20 && (
          <Link to="/credits" className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-200 hover:bg-amber-500/15">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0">Credits are low. Buy more to keep chatting.</span>
          </Link>
        )}
        <div className="text-xs text-muted-foreground px-2 mb-1.5">Credits</div>
        <div className="px-2 py-1.5 rounded-md bg-sidebar-accent flex items-center justify-between">
          <span className="font-medium">{profile.data?.credits?.toLocaleString() ?? "…"}</span>
          <Link to="/credits"><Button size="sm" variant="ghost" className="h-7 text-xs">Top up</Button></Link>
        </div>
        <div className="mt-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition text-left">
                <Avatar className="h-7 w-7"><AvatarFallback className="text-xs bg-primary/20 text-primary">{(profile.data?.display_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                <div className="flex-1 truncate">
                  <div className="text-sm truncate">{profile.data?.display_name ?? "…"}</div>
                  <div className="text-xs text-muted-foreground truncate">{profile.data?.email}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild><Link to="/settings"><Settings className="h-4 w-4 mr-2" /> Settings</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/credits"><CreditCard className="h-4 w-4 mr-2" /> Credits & billing</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSupportOpen(true)}><LifeBuoy className="h-4 w-4 mr-2" /> Contact support</DropdownMenuItem>
              {profile.data?.is_admin && (
                <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck className="h-4 w-4 mr-2" /> Admin</Link></DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex bg-background">
      <aside className="hidden md:block border-r border-border">{sidebar}</aside>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="h-full">{sidebar}</div>
        </div>
      )}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden h-12 border-b border-border flex items-center px-3">
          <Button size="icon" variant="ghost" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></Button>
        </div>
        <Outlet />
      </main>

      <Dialog open={renameId !== null} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename chat</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={200} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameId(null)}>Cancel</Button>
            <Button onClick={() => renameId && renameMut.mutate({ id: renameId, title: renameValue })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contact support</DialogTitle>
            <DialogDescription>Send a message to the CartMetrics AI owner. Replies appear in the admin dashboard.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="support-subject">Subject</Label>
              <Input id="support-subject" value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)} maxLength={160} placeholder="Billing, credits, account help…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-body">Message</Label>
              <Textarea id="support-body" value={supportBody} onChange={(e) => setSupportBody(e.target.value)} rows={5} maxLength={4000} placeholder="Tell us what you need help with." />
            </div>
            {tickets.data && tickets.data.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">Recent messages</div>
                <div className="space-y-2">
                  {tickets.data.slice(0, 3).map((t) => (
                    <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs">
                      <span className="truncate">{t.subject}</span>
                      <span className="rounded-full bg-accent px-2 py-0.5 text-muted-foreground">{t.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSupportOpen(false)}>Cancel</Button>
            <Button onClick={() => supportMut.mutate()} disabled={supportSubject.trim().length < 3 || supportBody.trim().length < 10 || supportMut.isPending}>
              {supportMut.isPending ? "Sending…" : "Send message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatSection({ label, items, pathname, onRename, onPin, onDelete, onSelect }: {
  label: string;
  items: { id: string; title: string; pinned: boolean }[];
  pathname: string;
  onRename: (c: any) => void;
  onPin: (c: any) => void;
  onDelete: (c: any) => void;
  onSelect: () => void;
}) {
  return (
    <div className="mb-4">
      <div className="text-xs text-muted-foreground px-2 py-1.5">{label}</div>
      <div className="space-y-0.5">
        {items.map((c) => {
          const active = pathname.endsWith(c.id);
          return (
            <div key={c.id} className={cn("group flex items-center rounded-md px-2 py-1.5 text-sm transition hover:bg-sidebar-accent", active && "bg-sidebar-accent")}>
              <Link to="/chat/$chatId" params={{ chatId: c.id }} onClick={onSelect} className="flex-1 min-w-0 truncate">{c.title}</Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background/50"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onPin(c)}>
                    {c.pinned ? <><PinOff className="h-4 w-4 mr-2" /> Unpin</> : <><Pin className="h-4 w-4 mr-2" /> Pin</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRename(c)}><Pencil className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(c)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
