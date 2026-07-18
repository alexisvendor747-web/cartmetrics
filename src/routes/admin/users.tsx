import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listUsers, adminAdjustCredits, toggleAdmin, setUserStatus, deleteUser, sendPasswordReset } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Shield, ShieldOff, Ban, CheckCircle2, Plus, Minus, KeyRound, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin" }, { name: "robots", content: "noindex" }] }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const creditsFn = useServerFn(adminAdjustCredits);
  const roleFn = useServerFn(toggleAdmin);
  const statusFn = useServerFn(setUserStatus);
  const delFn = useServerFn(deleteUser);
  const resetFn = useServerFn(sendPasswordReset);
  const [search, setSearch] = useState("");
  const [creditsFor, setCreditsFor] = useState<{ id: string; email: string } | null>(null);
  const [creditsDelta, setCreditsDelta] = useState(100);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; email: string } | null>(null);
  const [deleteEmail, setDeleteEmail] = useState("");

  const users = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => listFn({ data: { search: search || undefined } }),
  });

  function invalidate() { qc.invalidateQueries({ queryKey: ["admin", "users"] }); }

  const applyCredits = useMutation({
    mutationFn: (v: { user_id: string; delta: number }) => creditsFn({ data: { ...v, reason: "admin_adjustment" } }),
    onSuccess: () => { toast.success("Credits updated"); invalidate(); setCreditsFor(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Manage accounts, credits, roles, and access.</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </header>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">User</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Credits</th>
              <th className="text-left px-4 py-2">Joined</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</td></tr>}
            {users.data?.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.display_name ?? u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.map((r) => (
                      <Badge key={r} variant={r === "super_admin" ? "default" : r === "admin" ? "secondary" : "outline"} className="text-[10px]">{r}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.status === "suspended"
                    ? <Badge variant="destructive" className="text-[10px]">Suspended</Badge>
                    : <Badge variant="outline" className="text-[10px] text-green-600 border-green-600/40">Active</Badge>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{u.credits.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setCreditsFor({ id: u.id, email: u.email ?? "" }); setCreditsDelta(100); }}>
                        <Plus className="h-4 w-4 mr-2" />Add credits
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setCreditsFor({ id: u.id, email: u.email ?? "" }); setCreditsDelta(-100); }}>
                        <Minus className="h-4 w-4 mr-2" />Remove credits
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={async () => { try { await resetFn({ data: { user_id: u.id } }); toast.success("Password reset email sent"); } catch (e) { toast.error((e as Error).message); } }}>
                        <KeyRound className="h-4 w-4 mr-2" />Send password reset
                      </DropdownMenuItem>
                      {u.roles.includes("admin") ? (
                        <DropdownMenuItem onClick={async () => { try { await roleFn({ data: { user_id: u.id, make_admin: false } }); toast.success("Admin revoked"); invalidate(); } catch (e) { toast.error((e as Error).message); } }}>
                          <ShieldOff className="h-4 w-4 mr-2" />Revoke admin
                        </DropdownMenuItem>
                      ) : !u.roles.includes("super_admin") ? (
                        <DropdownMenuItem onClick={async () => { try { await roleFn({ data: { user_id: u.id, make_admin: true } }); toast.success("Admin granted"); invalidate(); } catch (e) { toast.error((e as Error).message); } }}>
                          <Shield className="h-4 w-4 mr-2" />Grant admin
                        </DropdownMenuItem>
                      ) : null}
                      {u.status === "active" ? (
                        <DropdownMenuItem onClick={async () => { try { await statusFn({ data: { user_id: u.id, status: "suspended" } }); toast.success("User suspended"); invalidate(); } catch (e) { toast.error((e as Error).message); } }}>
                          <Ban className="h-4 w-4 mr-2" />Suspend
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={async () => { try { await statusFn({ data: { user_id: u.id, status: "active" } }); toast.success("User reactivated"); invalidate(); } catch (e) { toast.error((e as Error).message); } }}>
                          <CheckCircle2 className="h-4 w-4 mr-2" />Reactivate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => { setConfirmDelete({ id: u.id, email: u.email ?? "" }); setDeleteEmail(""); }}>
                        <Trash2 className="h-4 w-4 mr-2" />Delete account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Credits dialog */}
      <Dialog open={!!creditsFor} onOpenChange={(o) => { if (!o) setCreditsFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust credits — {creditsFor?.email}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Positive to add, negative to remove.</p>
            <Input type="number" value={creditsDelta} onChange={(e) => setCreditsDelta(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreditsFor(null)}>Cancel</Button>
            <Button onClick={() => creditsFor && applyCredits.mutate({ user_id: creditsFor.id, delta: creditsDelta })} disabled={applyCredits.isPending}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This permanently deletes the account, chats, and data. Type <span className="font-mono text-foreground">{confirmDelete?.email}</span> to confirm.</p>
            <Input value={deleteEmail} onChange={(e) => setDeleteEmail(e.target.value)} placeholder="Type the email" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!confirmDelete || deleteEmail !== confirmDelete.email} onClick={async () => {
              if (!confirmDelete) return;
              try { await delFn({ data: { user_id: confirmDelete.id, confirm_email: deleteEmail } }); toast.success("Deleted"); setConfirmDelete(null); invalidate(); }
              catch (e) { toast.error((e as Error).message); }
            }}>Delete permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
