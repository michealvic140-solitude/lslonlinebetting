import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Shield, Users, Trophy, Coins, Megaphone, Settings as SettingsIcon, Ticket, AlertTriangle,
  Calendar, Tag, Image as ImageIcon, BarChart3, History, Send, Plus, Trash2, Pencil, ChevronRight, ChevronLeft, Wallet, ListOrdered, Sparkles, ClipboardList, Lock, Pause, Play, Check, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type AppRole } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fetchTeams } from "@/lib/queries";
import { useConfirm } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — LSL" }, { name: "description", content: "League administration dashboard." }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && !isAdmin) nav({ to: "/" }); }, [isAdmin, loading, nav]);
  if (loading) return <Layout><div className="container py-10">Loading…</div></Layout>;
  if (!isAdmin) return null;

  return (
    <Layout>
      <div className="container py-8 space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Shield className="h-6 w-6 text-accent" />
          <h1 className="text-3xl font-bold gradient-emerald-text">Admin Console</h1>
          <Badge variant="outline" className="border-accent/40 text-accent">Restricted</Badge>
        </div>

        <Stats />
        <Tabs defaultValue="analytics">
          <TabsList className="flex flex-wrap h-auto justify-start">
            <TabsTrigger value="analytics"><BarChart3 className="h-3 w-3 mr-1" />Analytics</TabsTrigger>
            <TabsTrigger value="users"><Users className="h-3 w-3 mr-1" />Users</TabsTrigger>
            <TabsTrigger value="matches"><Trophy className="h-3 w-3 mr-1" />Matches</TabsTrigger>
            <TabsTrigger value="events"><Calendar className="h-3 w-3 mr-1" />Events</TabsTrigger>
            <TabsTrigger value="tokens"><Coins className="h-3 w-3 mr-1" />Tokens</TabsTrigger>
            <TabsTrigger value="withdrawals"><Wallet className="h-3 w-3 mr-1" />Withdrawals</TabsTrigger>
            <TabsTrigger value="leaderboard"><ListOrdered className="h-3 w-3 mr-1" />Leaderboard</TabsTrigger>
            <TabsTrigger value="promos"><Tag className="h-3 w-3 mr-1" />Promo Codes</TabsTrigger>
            <TabsTrigger value="content"><Megaphone className="h-3 w-3 mr-1" />Content</TabsTrigger>
            <TabsTrigger value="tickets"><Ticket className="h-3 w-3 mr-1" />Tickets</TabsTrigger>
            <TabsTrigger value="bettracker"><ClipboardList className="h-3 w-3 mr-1" />Bet Tracker</TabsTrigger>
            <TabsTrigger value="promoreqs"><Tag className="h-3 w-3 mr-1" />Promo Requests</TabsTrigger>
            <TabsTrigger value="appeals"><AlertTriangle className="h-3 w-3 mr-1" />Appeals</TabsTrigger>
            <TabsTrigger value="notify"><Send className="h-3 w-3 mr-1" />Notify</TabsTrigger>
            <TabsTrigger value="audit"><History className="h-3 w-3 mr-1" />Audit</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="h-3 w-3 mr-1" />Settings</TabsTrigger>
            <TabsTrigger value="adminai"><Sparkles className="h-3 w-3 mr-1" />Admin AI</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
          <TabsContent value="matches" className="mt-4"><MatchesPanel /></TabsContent>
          <TabsContent value="events" className="mt-4"><EventsPanel /></TabsContent>
          <TabsContent value="tokens" className="mt-4"><TokensPanel /></TabsContent>
          <TabsContent value="withdrawals" className="mt-4"><WithdrawalsPanel /></TabsContent>
          <TabsContent value="leaderboard" className="mt-4"><LeaderboardAdminPanel /></TabsContent>
          <TabsContent value="promos" className="mt-4"><PromoPanel /></TabsContent>
          <TabsContent value="content" className="mt-4"><ContentPanel /></TabsContent>
          <TabsContent value="tickets" className="mt-4"><TicketsPanel /></TabsContent>
          <TabsContent value="bettracker" className="mt-4"><BetTrackerPanel /></TabsContent>
          <TabsContent value="promoreqs" className="mt-4"><PromoRequestsPanel /></TabsContent>
          <TabsContent value="appeals" className="mt-4"><AppealsPanel /></TabsContent>
          <TabsContent value="notify" className="mt-4"><NotifyPanel /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AuditPanel /></TabsContent>
          <TabsContent value="analytics" className="mt-4"><AnalyticsPanel /></TabsContent>
          <TabsContent value="settings" className="mt-4"><SettingsPanel /></TabsContent>
          <TabsContent value="adminai" className="mt-4"><AdminAIPanel /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

async function logAudit(action: string, target_type: string, target_id?: string, metadata?: any) {
  const u = (await supabase.auth.getUser()).data.user;
  if (!u) return;
  await supabase.from("audit_logs").insert({ actor_id: u.id, action, target_type, target_id, metadata: metadata ?? {} });
}

function Stats() {
  const [s, setS] = useState({ users: 0, matches: 0, pending: 0, tokens: 0 });
  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("matches").select("id", { count: "exact", head: true }).neq("status", "ended"),
      supabase.from("token_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("profiles").select("token_balance"),
    ]).then(([u, m, p, t]) => setS({
      users: u.count ?? 0, matches: m.count ?? 0, pending: p.count ?? 0,
      tokens: (t.data ?? []).reduce((acc: number, x: any) => acc + (x.token_balance ?? 0), 0),
    }));
  }, []);
  const items = [
    { icon: Users, label: "Users", value: s.users.toString() },
    { icon: Trophy, label: "Open matches", value: s.matches.toString() },
    { icon: AlertTriangle, label: "Pending requests", value: s.pending.toString() },
    { icon: Coins, label: "Tokens in circulation", value: s.tokens.toLocaleString() },
  ];
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((x) => (
        <Card key={x.label} className="glass p-4">
          <x.icon className="h-5 w-5 text-primary mb-2" />
          <div className="text-2xl font-bold gradient-gold-text">{x.value}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{x.label}</div>
        </Card>
      ))}
    </div>
  );
}

/* ============================ USERS ============================ */
function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");
  const [edit, setEdit] = useState<any | null>(null);

  async function load() {
    const { data: u } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
    setUsers(u ?? []);
    const { data: r } = await supabase.from("user_roles").select("user_id,role").in("user_id", (u ?? []).map((x: any) => x.id));
    const m: Record<string, string[]> = {};
    (r ?? []).forEach((x: any) => { (m[x.user_id] ??= []).push(x.role); });
    setRolesByUser(m);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let out = users.filter((u) => !q || u.full_name?.toLowerCase().includes(q.toLowerCase()) || u.email?.toLowerCase().includes(q.toLowerCase()) || u.gang_name?.toLowerCase().includes(q.toLowerCase()));
    if (filterRole !== "all") out = out.filter((u) => (rolesByUser[u.id] ?? []).includes(filterRole));
    if (filterStatus === "banned") out = out.filter((u) => u.is_banned);
    if (filterStatus === "muted") out = out.filter((u) => u.is_muted);
    if (filterStatus === "restricted") out = out.filter((u) => u.is_restricted);
    if (filterStatus === "active") out = out.filter((u) => !u.is_banned);
    if (sort === "newest") out = [...out].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    if (sort === "oldest") out = [...out].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    if (sort === "alpha") out = [...out].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
    if (sort === "tokens") out = [...out].sort((a, b) => (b.token_balance ?? 0) - (a.token_balance ?? 0));
    return out;
  }, [users, q, filterRole, filterStatus, sort, rolesByUser]);

  return (
    <div className="space-y-3">
      <Card className="glass-strong p-3 grid md:grid-cols-4 gap-2">
        <Input placeholder="Search name, email, gang…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {(["viewer", "shooter", "gang_leader", "registered", "moderator", "admin"] as AppRole[]).map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
            <SelectItem value="muted">Muted</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="alpha">A → Z</SelectItem>
            <SelectItem value="tokens">Most tokens</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="text-xs text-muted-foreground">{filtered.length} user(s)</div>

      {filtered.map((u) => (
        <Card key={u.id} className="glass p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="font-bold">{u.full_name} {u.is_banned && <Badge variant="destructive" className="ml-1 text-[10px]">BANNED</Badge>}{u.is_muted && <Badge variant="outline" className="ml-1 text-[10px] border-yellow-500/50 text-yellow-400">MUTED</Badge>}{u.is_restricted && <Badge variant="outline" className="ml-1 text-[10px] border-orange-500/50 text-orange-400">RESTRICTED</Badge>}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
              <div className="text-xs text-muted-foreground">{u.gang_name ?? "Independent"}{u.gang_type && ` · ${u.gang_type}`}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {(rolesByUser[u.id] ?? []).map((r) => (
                  <Badge key={r} variant="outline" className="text-[10px]">{ROLE_LABELS[r as AppRole]}</Badge>
                ))}
              </div>
              <div className="text-xs mt-1">Tokens: <span className="font-bold text-primary">{(u.token_balance ?? 0).toLocaleString()}</span></div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEdit(u)}><Pencil className="h-3 w-3 mr-1" />Manage</Button>
          </div>
        </Card>
      ))}

      {edit && <UserEditDialog user={edit} roles={rolesByUser[edit.id] ?? []} onClose={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function UserEditDialog({ user, roles, onClose }: { user: any; roles: string[]; onClose: () => void }) {
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState({ ...user });
  const [tokenDelta, setTokenDelta] = useState(0);
  const [tokenReason, setTokenReason] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [bets, setBets] = useState<any[]>([]);
  const [tx, setTx] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("bets").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20).then(({ data }) => setBets(data ?? []));
    supabase.from("token_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20).then(({ data }) => setTx(data ?? []));
  }, [user.id]);

  async function saveProfile() {
    const { error } = await supabase.from("profiles").update({
      full_name: form.full_name, phone: form.phone, discord_username: form.discord_username,
      country: form.country, gang_name: form.gang_name, gang_type: form.gang_type,
    }).eq("id", user.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); logAudit("update_profile", "user", user.id); }
  }
  async function applyTokens() {
    if (!tokenDelta || !tokenReason) { toast.error("Amount and reason required"); return; }
    const newBal = (user.token_balance ?? 0) + tokenDelta;
    if (newBal < 0) { toast.error("Balance cannot go negative"); return; }
    const { error } = await supabase.from("profiles").update({ token_balance: newBal }).eq("id", user.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("notifications").insert({ user_id: user.id, title: tokenDelta > 0 ? "Tokens credited" : "Tokens debited", body: `${tokenDelta > 0 ? "+" : ""}${tokenDelta} tokens — ${tokenReason}` });
    await logAudit(tokenDelta > 0 ? "grant_tokens" : "revoke_tokens", "user", user.id, { amount: tokenDelta, reason: tokenReason });
    toast.success("Applied"); setTokenDelta(0); setTokenReason("");
  }
  async function flagAction(field: "is_banned" | "is_muted" | "is_restricted", val: boolean, reasonField: string) {
    if (val && !actionReason) { toast.error("Reason is required"); return; }
    const patch: any = { [field]: val, [reasonField]: val ? actionReason : null };
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) toast.error(error.message);
    else {
      await supabase.from("notifications").insert({ user_id: user.id, title: val ? `You were ${field.replace("is_", "")}` : `You were un-${field.replace("is_", "")}`, body: val ? actionReason : "Restriction lifted." });
      await logAudit(val ? `apply_${field}` : `lift_${field}`, "user", user.id, { reason: actionReason });
      toast.success("Updated"); setActionReason(""); onClose();
    }
  }
  async function addRole(role: AppRole) {
    const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role });
    if (error) toast.error(error.message); else { logAudit("add_role", "user", user.id, { role }); toast.success(`+ ${role}`); onClose(); }
  }
  async function removeRole(role: string) {
    await supabase.from("user_roles").delete().eq("user_id", user.id).eq("role", role as AppRole);
    logAudit("remove_role", "user", user.id, { role });
    toast.success(`− ${role}`); onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage {user.full_name}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="space-y-2 mt-3">
            <Input placeholder="Full name" value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input placeholder="Phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Discord" value={form.discord_username ?? ""} onChange={(e) => setForm({ ...form, discord_username: e.target.value })} />
            <Input placeholder="Country" value={form.country ?? ""} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            <Input placeholder="Gang name" value={form.gang_name ?? ""} onChange={(e) => setForm({ ...form, gang_name: e.target.value })} />
            <Button className="btn-luxury" onClick={saveProfile}>Save profile</Button>
          </TabsContent>
          <TabsContent value="tokens" className="space-y-3 mt-3">
            <div className="text-sm">Current balance: <span className="font-bold text-primary">{(user.token_balance ?? 0).toLocaleString()}</span></div>
            <Input type="number" placeholder="Delta (use negative to remove)" value={tokenDelta || ""} onChange={(e) => setTokenDelta(Number(e.target.value))} />
            <Input placeholder="Reason (required)" value={tokenReason} onChange={(e) => setTokenReason(e.target.value)} />
            <Button className="btn-luxury" onClick={applyTokens}>Apply</Button>
          </TabsContent>
          <TabsContent value="roles" className="space-y-3 mt-3">
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <Badge key={r} variant="outline">{ROLE_LABELS[r as AppRole]} <button onClick={() => removeRole(r)} className="ml-1 text-destructive">×</button></Badge>
              ))}
            </div>
            <Select onValueChange={(v) => addRole(v as AppRole)}>
              <SelectTrigger><SelectValue placeholder="Add role…" /></SelectTrigger>
            <SelectContent>{(["viewer", "shooter", "gang_leader", "registered", "sponsor", "moderator", "admin"] as AppRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </TabsContent>
          <TabsContent value="actions" className="space-y-3 mt-3">
            <Textarea placeholder="Reason (required for restrictive actions)" value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant={user.is_banned ? "outline" : "destructive"} onClick={() => flagAction("is_banned", !user.is_banned, "ban_reason")}>{user.is_banned ? "Unban" : "Ban"}</Button>
              <Button variant={user.is_muted ? "outline" : "destructive"} onClick={() => flagAction("is_muted", !user.is_muted, "mute_reason")}>{user.is_muted ? "Unmute chat" : "Mute chat"}</Button>
              <Button variant={user.is_restricted ? "outline" : "destructive"} onClick={() => flagAction("is_restricted", !user.is_restricted, "restrict_reason")}>{user.is_restricted ? "Allow betting" : "Restrict betting"}</Button>
            </div>
          </TabsContent>
          <TabsContent value="history" className="space-y-3 mt-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Recent bets</div>
              {bets.length === 0 && <div className="text-xs text-muted-foreground">None.</div>}
              {bets.map((b) => (
                <div key={b.id} className="flex justify-between text-xs py-1 border-b border-border/50">
                  <span>{b.tracking_id} · {b.status}</span>
                  <span>{b.stake} → {b.potential_payout}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Token transactions</div>
              {tx.length === 0 && <div className="text-xs text-muted-foreground">None.</div>}
              {tx.map((t) => (
                <div key={t.id} className="flex justify-between text-xs py-1 border-b border-border/50">
                  <span>{t.kind} · {t.description}</span>
                  <span className={t.amount > 0 ? "text-primary" : "text-destructive"}>{t.amount > 0 ? "+" : ""}{t.amount}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ MATCH WIZARD ============================ */
function MatchesPanel() {
  const confirm = useConfirm();
  const [matches, setMatches] = useState<any[]>([]);
  const [wizard, setWizard] = useState(false);

  async function load() {
    const { data } = await supabase.from("matches").select("*, home_team:home_team_id(name,logo_url), away_team:away_team_id(name,logo_url)").order("start_time", { ascending: false });
    setMatches(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    await supabase.from("matches").update({ status: status as any }).eq("id", id);
    await logAudit(`match_${status}`, "match", id);
    load();
  }
  async function settle(m: any) {
    const home = prompt(`Final score for ${m.home_team?.name}?`); if (home === null) return;
    const away = prompt(`Final score for ${m.away_team?.name}?`); if (away === null) return;
    const hs = Number(home), as = Number(away);
    let winnerId = null;
    if (hs > as) winnerId = m.home_team_id;
    else if (as > hs) winnerId = m.away_team_id;
    await supabase.from("matches").update({ home_score: hs, away_score: as, status: "ended", winner_team_id: winnerId }).eq("id", m.id);
    await supabase.from("markets").update({ is_open: false }).eq("match_id", m.id);
    await settleBetsForMatch(m.id, winnerId);
    await logAudit("match_settled", "match", m.id, { home_score: hs, away_score: as, winner_team_id: winnerId });
    toast.success("Match settled — bets paid out"); load();
  }
  async function deleteMatch(id: string) {
    if (!await confirm({ title: "Delete this match?", description: "This cannot be undone.", tone: "danger", confirmText: "Delete" })) return;
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) toast.error(error.message); else { logAudit("match_deleted", "match", id); load(); }
  }

  async function updateLiveScore(m: any, hs: number, as: number) {
    await supabase.from("matches").update({ home_score: hs, away_score: as }).eq("id", m.id);
    await logAudit("match_live_score", "match", m.id, { home_score: hs, away_score: as });
    load();
  }

  return (
    <div className="space-y-4">
      <Button className="btn-luxury" onClick={() => setWizard(true)}><Plus className="h-4 w-4 mr-1" />New Match (Wizard)</Button>
      {wizard && <MatchWizard onClose={() => { setWizard(false); load(); }} />}

      <div className="space-y-2">
        {matches.map((m: any) => (
          <Card key={m.id} className="glass p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex items-center gap-2">
              {m.home_team?.logo_url && <img src={m.home_team.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />}
              <div>
                <div className="font-bold truncate">{m.home_team?.name} vs {m.away_team?.name} {m.status === "ended" && <span className="text-xs text-muted-foreground">({m.home_score}–{m.away_score})</span>}</div>
                <div className="text-xs text-muted-foreground">{m.name} · {m.start_time ? new Date(m.start_time).toLocaleString() : ""}</div>
              </div>
            </div>
            <div className="flex gap-1 items-center flex-wrap">
              <Badge variant="outline" className="capitalize">{m.status}</Badge>
              {m.status === "live" && (
                <LiveScoreEditor m={m} onSave={(hs, as) => updateLiveScore(m, hs, as)} />
              )}
              {m.status === "scheduled" && <Button size="sm" onClick={() => setStatus(m.id, "live")}>Start Live</Button>}
              {m.status === "live" && <Button size="sm" onClick={() => settle(m)}>End Match</Button>}
              {m.status !== "cancelled" && m.status !== "ended" && <Button size="sm" variant="outline" onClick={() => setStatus(m.id, "cancelled")}>Cancel</Button>}
              <Button size="sm" variant="destructive" onClick={() => deleteMatch(m.id)} title="Delete match"><Trash2 className="h-3 w-3" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

async function settleBetsForMatch(matchId: string, winnerTeamId: string | null) {
  // Get all bet selections for this match
  const { data: sels } = await supabase.from("bet_selections").select("*, markets:market_id(name), odds:odd_id(label)").eq("match_id", matchId);
  if (!sels || sels.length === 0) return;
  // Get team names for label comparison
  const { data: match } = await supabase.from("matches").select("home_team:home_team_id(name), away_team:away_team_id(name)").eq("id", matchId).single() as any;
  const winnerLabel = winnerTeamId === null ? "Draw" : (match?.home_team?.name && winnerTeamId === (await supabase.from("matches").select("home_team_id").eq("id", matchId).single()).data?.home_team_id ? match.home_team.name : match?.away_team?.name);
  for (const s of sels) {
    const result = (s as any).odds?.label === winnerLabel ? "won" : "lost";
    await supabase.from("bet_selections").update({ result }).eq("id", s.id);
  }
  // Settle bets that have all selections resolved
  const betIds = Array.from(new Set(sels.map((s: any) => s.bet_id)));
  for (const bid of betIds) {
    const { data: betSels } = await supabase.from("bet_selections").select("result").eq("bet_id", bid);
    if (!betSels || betSels.some((s: any) => !s.result)) continue;
    const allWon = betSels.every((s: any) => s.result === "won");
    const { data: bet } = await supabase.from("bets").select("*").eq("id", bid).single();
    if (!bet) continue;
    const status = allWon ? "won" : "lost";
    await supabase.from("bets").update({ status, settled_at: new Date().toISOString() }).eq("id", bid);
    if (allWon) {
      const { data: prof } = await supabase.from("profiles").select("token_balance").eq("id", bet.user_id).single();
      if (prof) await supabase.from("profiles").update({ token_balance: (prof.token_balance ?? 0) + bet.potential_payout }).eq("id", bet.user_id);
      await supabase.from("notifications").insert({ user_id: bet.user_id, title: "Bet won! 🎉", body: `+${bet.potential_payout} tokens credited.`, link: `/ticket/${bid}` });
    } else {
      await supabase.from("notifications").insert({ user_id: bet.user_id, title: "Bet lost", body: `Your ticket ${bet.tracking_id} did not win.`, link: `/ticket/${bid}` });
    }
  }
}

function MatchWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [teams, setTeams] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [teamA, setTeamA] = useState({ id: "", name: "", logoFile: null as File | null, mainPlayers: "", subPlayers: "" });
  const [teamB, setTeamB] = useState({ id: "", name: "", logoFile: null as File | null, mainPlayers: "", subPlayers: "" });
  const [details, setDetails] = useState({ homeIs: "A" as "A" | "B", oddsA: 2.0, draw: 3.5, oddsB: 2.0, name: "", start_time: "", location: "", category_id: "", featured: false });

  useEffect(() => {
    fetchTeams().then(setTeams);
    supabase.from("categories").select("*").then(({ data }) => setCats(data ?? []));
  }, []);

  async function uploadLogo(file: File): Promise<string | null> {
    const ext = file.name.split(".").pop();
    const path = `team-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("team-logos").upload(path, file);
    if (error) { toast.error(error.message); return null; }
    return supabase.storage.from("team-logos").getPublicUrl(path).data.publicUrl;
  }

  async function ensureTeam(t: typeof teamA): Promise<string | null> {
    if (t.id) return t.id;
    if (!t.name.trim()) { toast.error("Team name required"); return null; }
    let logo_url: string | null = null;
    if (t.logoFile) logo_url = await uploadLogo(t.logoFile);
    const { data, error } = await supabase.from("teams").insert({ name: t.name.trim(), logo_url }).select().single();
    if (error) { toast.error(error.message); return null; }
    const players = [
      ...t.mainPlayers.split(",").map((n) => n.trim()).filter(Boolean).map((name) => ({ team_id: data.id, name, is_substitute: false })),
      ...t.subPlayers.split(",").map((n) => n.trim()).filter(Boolean).map((name) => ({ team_id: data.id, name, is_substitute: true })),
    ];
    if (players.length) await supabase.from("players").insert(players);
    return data.id;
  }

  async function finalCreate() {
    const aId = await ensureTeam(teamA); if (!aId) return;
    const bId = await ensureTeam(teamB); if (!bId) return;
    const home_team_id = details.homeIs === "A" ? aId : bId;
    const away_team_id = details.homeIs === "A" ? bId : aId;
    const homeName = (details.homeIs === "A" ? teamA.name : teamB.name) || teams.find((t) => t.id === home_team_id)?.name;
    const awayName = (details.homeIs === "A" ? teamB.name : teamA.name) || teams.find((t) => t.id === away_team_id)?.name;
    const homeOdds = details.homeIs === "A" ? details.oddsA : details.oddsB;
    const awayOdds = details.homeIs === "A" ? details.oddsB : details.oddsA;
    const { data: m, error } = await supabase.from("matches").insert({
      name: details.name || `${homeName} vs ${awayName}`,
      home_team_id, away_team_id,
      start_time: details.start_time ? new Date(details.start_time).toISOString() : new Date().toISOString(),
      location: details.location, status: "scheduled",
      category_id: details.category_id || null, is_featured: details.featured,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    const { data: market } = await supabase.from("markets").insert({ match_id: m.id, name: "Match Winner" }).select().single();
    if (market) {
      await supabase.from("odds").insert([
        { market_id: market.id, label: homeName, value: homeOdds },
        { market_id: market.id, label: "Draw", value: details.draw },
        { market_id: market.id, label: awayName, value: awayOdds },
      ]);
    }
    await supabase.from("notifications").insert({ user_id: null as any, title: "New match scheduled", body: `${homeName} vs ${awayName} — get your picks ready.`, link: `/matches/${m.id}` }).then(() => {});
    await logAudit("match_created", "match", m.id);
    toast.success("Match created!");
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Match Wizard — Step {step} of 4</DialogTitle>
        </DialogHeader>

        {step === 1 && <TeamStep label="Team A" team={teamA} setTeam={setTeamA} teams={teams} />}
        {step === 2 && <TeamStep label="Team B" team={teamB} setTeam={setTeamB} teams={teams} />}
        {step === 3 && (
          <div className="space-y-3">
            <div className="text-sm font-bold">Match Details & Odds</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Home / Away</label>
                <Select value={details.homeIs} onValueChange={(v) => setDetails({ ...details, homeIs: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Team A is Home</SelectItem>
                    <SelectItem value="B">Team B is Home</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Select value={details.category_id} onValueChange={(v) => setDetails({ ...details, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-xs">Team A win odds</label><Input type="number" step="0.01" value={details.oddsA} onChange={(e) => setDetails({ ...details, oddsA: Number(e.target.value) })} /></div>
              <div><label className="text-xs">Draw odds</label><Input type="number" step="0.01" value={details.draw} onChange={(e) => setDetails({ ...details, draw: Number(e.target.value) })} /></div>
              <div><label className="text-xs">Team B win odds</label><Input type="number" step="0.01" value={details.oddsB} onChange={(e) => setDetails({ ...details, oddsB: Number(e.target.value) })} /></div>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            <div className="text-sm font-bold">Final Settings</div>
            <Input placeholder="Match name (e.g. Round 14 · Night Hunt)" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
            <div>
              <label className="text-xs text-muted-foreground">Countdown / Start time</label>
              <Input type="datetime-local" value={details.start_time} onChange={(e) => setDetails({ ...details, start_time: e.target.value })} />
            </div>
            <Input placeholder="Location / Venue" value={details.location} onChange={(e) => setDetails({ ...details, location: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><Switch checked={details.featured} onCheckedChange={(v) => setDetails({ ...details, featured: v })} /> Publish on homepage as Featured</label>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <Button variant="outline" disabled={step === 1} onClick={() => setStep(step - 1)}><ChevronLeft className="h-4 w-4" />Back</Button>
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
          ) : (
            <Button className="btn-luxury" onClick={finalCreate}>Create Match</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamStep({ label, team, setTeam, teams }: { label: string; team: any; setTeam: (t: any) => void; teams: any[] }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-bold">{label}</div>
      <div>
        <label className="text-xs text-muted-foreground">Pick existing team (optional)</label>
        <Select value={team.id} onValueChange={(v) => setTeam({ ...team, id: v })}>
          <SelectTrigger><SelectValue placeholder="— or create new below —" /></SelectTrigger>
          <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {!team.id && (
        <>
          <Input placeholder={`${label} name`} value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} />
          <div>
            <label className="text-xs text-muted-foreground">Team logo</label>
            <Input type="file" accept="image/*" onChange={(e) => setTeam({ ...team, logoFile: e.target.files?.[0] ?? null })} />
          </div>
          <Input placeholder="Main players (comma separated)" value={team.mainPlayers} onChange={(e) => setTeam({ ...team, mainPlayers: e.target.value })} />
          <Input placeholder="Substitute players (comma separated)" value={team.subPlayers} onChange={(e) => setTeam({ ...team, subPlayers: e.target.value })} />
        </>
      )}
    </div>
  );
}

/* ============================ EVENTS ============================ */
function EventsPanel() {
  const [events, setEvents] = useState<any[]>([]);
  const [draft, setDraft] = useState({ title: "", description: "", ends_at: "", banner: null as File | null });

  async function load() {
    const { data } = await supabase.from("events").select("*").order("ends_at", { ascending: true });
    setEvents(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!draft.title || !draft.ends_at) { toast.error("Title and end time required"); return; }
    let banner_url: string | null = null;
    if (draft.banner) {
      const path = `event-${crypto.randomUUID()}.${draft.banner.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("announcements").upload(path, draft.banner);
      if (error) { toast.error(error.message); return; }
      banner_url = supabase.storage.from("announcements").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("events").insert({ title: draft.title, description: draft.description, banner_url, ends_at: new Date(draft.ends_at).toISOString() });
    if (error) toast.error(error.message);
    else { setDraft({ title: "", description: "", ends_at: "", banner: null }); load(); logAudit("event_created", "event"); toast.success("Event posted"); }
  }
  async function del(id: string) {
    await supabase.from("events").delete().eq("id", id);
    logAudit("event_deleted", "event", id);
    load();
  }
  async function toggle(id: string, val: boolean) {
    await supabase.from("events").update({ is_active: val }).eq("id", id);
    load();
  }

  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 space-y-2">
        <div className="font-bold">Create event (bold countdown banner)</div>
        <Input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <Textarea placeholder="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <div>
          <label className="text-xs text-muted-foreground">Banner image (long advertisement)</label>
          <Input type="file" accept="image/*" onChange={(e) => setDraft({ ...draft, banner: e.target.files?.[0] ?? null })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Countdown ends at</label>
          <Input type="datetime-local" value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} />
        </div>
        <Button className="btn-luxury" onClick={create}>Post Event</Button>
      </Card>

      <div className="space-y-2">
        {events.map((e) => (
          <Card key={e.id} className="glass p-3 flex items-center gap-3 flex-wrap">
            {e.banner_url && <img src={e.banner_url} alt="" className="h-12 w-20 rounded object-cover" />}
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{e.title}</div>
              <div className="text-xs text-muted-foreground">Ends {new Date(e.ends_at).toLocaleString()}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => toggle(e.id, !e.is_active)}>{e.is_active ? "Hide" : "Show"}</Button>
            <Button size="sm" variant="destructive" onClick={() => del(e.id)}><Trash2 className="h-3 w-3" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================ TOKENS ============================ */
function TokensPanel() {
  const [reqs, setReqs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  async function load() {
    const { data } = await supabase.from("token_requests").select("*").order("created_at", { ascending: false }).limit(100);
    setReqs(data ?? []);
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id,full_name,email,token_balance").in("id", ids);
      const m: Record<string, any> = {}; (p ?? []).forEach((x: any) => { m[x.id] = x; }); setProfiles(m);
    }
  }
  useEffect(() => { load(); }, []);

  async function approve(r: any) {
    const prof = profiles[r.user_id]; if (!prof) return;
    const newBal = (prof.token_balance ?? 0) + r.amount;
    const { error } = await supabase.from("profiles").update({ token_balance: newBal }).eq("id", r.user_id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("token_requests").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", r.id);
    await supabase.from("notifications").insert({ user_id: r.user_id, title: "Tokens credited", body: `${r.amount} tokens added to your account.` });
    await logAudit("token_request_approved", "token_request", r.id, { amount: r.amount });
    toast.success("Approved"); load();
  }
  async function reject(r: any) {
    const reason = prompt("Reason for denial?"); if (reason === null) return;
    await supabase.from("token_requests").update({ status: "denied", review_note: reason, reviewed_at: new Date().toISOString() }).eq("id", r.id);
    await supabase.from("notifications").insert({ user_id: r.user_id, title: "Token request denied", body: `Reason: ${reason || "—"}` });
    await logAudit("token_request_denied", "token_request", r.id, { reason });
    load();
  }

  return (
    <div className="space-y-2">
      {reqs.length === 0 && <p className="text-muted-foreground text-sm">No requests.</p>}
      {reqs.map((r) => (
        <Card key={r.id} className="glass p-3 flex items-start gap-3 flex-wrap">
          {r.proof_image_url && <a href={r.proof_image_url} target="_blank" rel="noreferrer"><img src={r.proof_image_url} alt="" className="h-20 w-20 object-cover rounded border border-border" /></a>}
          <div className="flex-1 min-w-0">
            <div className="font-bold">{r.amount.toLocaleString()} tokens · <span className="text-muted-foreground text-sm">{profiles[r.user_id]?.full_name ?? "Unknown"}</span></div>
            <div className="text-xs text-muted-foreground">{r.note || "No note"}</div>
            <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
          </div>
          <Badge variant="outline" className="capitalize">{r.status}</Badge>
          {r.status === "pending" && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => reject(r)}>Deny</Button>
              <Button size="sm" className="btn-luxury" onClick={() => approve(r)}>Approve</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ============================ PROMO CODES ============================ */
function PromoPanel() {
  const [codes, setCodes] = useState<any[]>([]);
  const [draft, setDraft] = useState({ code: "", amount: 100, usage_limit: 1, expires_at: "" });

  async function load() {
    const { data } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
    setCodes(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!draft.code || !draft.amount) { toast.error("Code and amount required"); return; }
    const { error } = await supabase.from("promo_codes").insert({
      code: draft.code.toUpperCase(), amount: draft.amount, usage_limit: draft.usage_limit,
      expires_at: draft.expires_at ? new Date(draft.expires_at).toISOString() : null,
    });
    if (error) toast.error(error.message);
    else { setDraft({ code: "", amount: 100, usage_limit: 1, expires_at: "" }); load(); toast.success("Promo created"); logAudit("promo_created", "promo"); }
  }
  async function toggle(id: string, val: boolean) { await supabase.from("promo_codes").update({ is_active: val }).eq("id", id); load(); }

  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 space-y-2">
        <div className="font-bold">Generate promo code</div>
        <div className="grid md:grid-cols-4 gap-2">
          <Input placeholder="CODE" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
          <Input type="number" placeholder="Tokens" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
          <Input type="number" placeholder="Per-user usage limit" value={draft.usage_limit} onChange={(e) => setDraft({ ...draft, usage_limit: Number(e.target.value) })} />
          <Input type="datetime-local" value={draft.expires_at} onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })} />
        </div>
        <Button className="btn-luxury" onClick={create}>Create</Button>
      </Card>
      <div className="space-y-2">
        {codes.map((c) => (
          <Card key={c.id} className="glass p-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-mono font-bold">{c.code}</div>
              <div className="text-xs text-muted-foreground">{c.amount} tokens · used {c.used_count}/{c.usage_limit ?? "∞"} · {c.expires_at ? `expires ${new Date(c.expires_at).toLocaleDateString()}` : "no expiry"}</div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={c.is_active} onCheckedChange={(v) => toggle(c.id, v)} />
              <Badge variant="outline">{c.is_active ? "Active" : "Off"}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================ CONTENT ============================ */
function ContentPanel() {
  return (
    <Tabs defaultValue="announcements">
      <TabsList>
        <TabsTrigger value="announcements">Announcements</TabsTrigger>
        <TabsTrigger value="highlights">Highlights</TabsTrigger>
        <TabsTrigger value="ads">Advertisements</TabsTrigger>
        <TabsTrigger value="cats">Categories</TabsTrigger>
      </TabsList>
      <TabsContent value="announcements" className="mt-3"><AnnouncementsPanel /></TabsContent>
      <TabsContent value="highlights" className="mt-3"><HighlightsPanel /></TabsContent>
      <TabsContent value="ads" className="mt-3"><AdsPanel /></TabsContent>
      <TabsContent value="cats" className="mt-3"><CategoriesPanel /></TabsContent>
    </Tabs>
  );
}

function AnnouncementsPanel() {
  const [list, setList] = useState<any[]>([]);
  const [draft, setDraft] = useState({ title: "", body: "", file: null as File | null });
  async function load() { setList((await supabase.from("announcements").select("*").order("created_at", { ascending: false })).data ?? []); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!draft.title) return;
    let image_url: string | null = null;
    if (draft.file) {
      const path = `ann-${crypto.randomUUID()}.${draft.file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("announcements").upload(path, draft.file);
      if (error) { toast.error(error.message); return; }
      image_url = supabase.storage.from("announcements").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("announcements").insert({ title: draft.title, body: draft.body, image_url });
    if (error) toast.error(error.message); else { setDraft({ title: "", body: "", file: null }); load(); logAudit("announcement_created", "announcement"); }
  }
  async function toggle(id: string, val: boolean) { await supabase.from("announcements").update({ is_active: val }).eq("id", id); load(); }
  async function del(id: string) { await supabase.from("announcements").delete().eq("id", id); load(); }
  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 space-y-2">
        <div className="font-bold">New announcement</div>
        <Input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <Textarea placeholder="Body" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        <Input type="file" accept="image/*" onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] ?? null })} />
        <Button className="btn-luxury" onClick={add}>Publish</Button>
      </Card>
      {list.map((a) => (
        <Card key={a.id} className="glass p-3 flex items-center justify-between gap-3">
          {a.image_url && <img src={a.image_url} alt="" className="h-10 w-10 rounded object-cover" />}
          <div className="min-w-0 flex-1"><div className="font-bold truncate">{a.title}</div><div className="text-xs text-muted-foreground truncate">{a.body}</div></div>
          <Button size="sm" variant="outline" onClick={() => toggle(a.id, !a.is_active)}>{a.is_active ? "Hide" : "Show"}</Button>
          <Button size="sm" variant="destructive" onClick={() => del(a.id)}><Trash2 className="h-3 w-3" /></Button>
        </Card>
      ))}
    </div>
  );
}

function HighlightsPanel() {
  const [list, setList] = useState<any[]>([]);
  const [draft, setDraft] = useState({ title: "", file: null as File | null });
  async function load() { setList((await supabase.from("highlights").select("*").order("created_at", { ascending: false })).data ?? []); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!draft.title || !draft.file) { toast.error("Title and media required"); return; }
    const path = `hl-${crypto.randomUUID()}.${draft.file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("highlights").upload(path, draft.file);
    if (error) { toast.error(error.message); return; }
    const url = supabase.storage.from("highlights").getPublicUrl(path).data.publicUrl;
    const media_type = draft.file.type.startsWith("video") ? "video" : "image";
    await supabase.from("highlights").insert({ title: draft.title, media_url: url, media_type });
    setDraft({ title: "", file: null }); load();
  }
  async function del(id: string) { await supabase.from("highlights").delete().eq("id", id); load(); }
  async function toggle(id: string, v: boolean) { await supabase.from("highlights").update({ is_active: v }).eq("id", id); load(); }
  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 space-y-2">
        <Input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <Input type="file" accept="image/*,video/*" onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] ?? null })} />
        <Button className="btn-luxury" onClick={add}><ImageIcon className="h-4 w-4 mr-1" />Upload highlight</Button>
      </Card>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
        {list.map((h) => (
          <Card key={h.id} className="glass p-2">
            {h.media_type === "video" ? <video src={h.media_url} className="w-full h-32 object-cover rounded" controls /> : <img src={h.media_url} className="w-full h-32 object-cover rounded" alt="" />}
            <div className="font-bold text-sm mt-1 truncate">{h.title}</div>
            <div className="flex gap-1 mt-1">
              <Button size="sm" variant="outline" onClick={() => toggle(h.id, !h.is_active)}>{h.is_active ? "Hide" : "Show"}</Button>
              <Button size="sm" variant="destructive" onClick={() => del(h.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AdsPanel() {
  const [list, setList] = useState<any[]>([]);
  const [draft, setDraft] = useState({ title: "", link_url: "", file: null as File | null });
  async function load() { setList((await supabase.from("advertisements").select("*").order("created_at", { ascending: false })).data ?? []); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!draft.file) { toast.error("Image required"); return; }
    const path = `ad-${crypto.randomUUID()}.${draft.file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("ads").upload(path, draft.file);
    if (error) { toast.error(error.message); return; }
    const url = supabase.storage.from("ads").getPublicUrl(path).data.publicUrl;
    await supabase.from("advertisements").insert({ title: draft.title, image_url: url, link_url: draft.link_url || null });
    setDraft({ title: "", link_url: "", file: null }); load();
  }
  async function del(id: string) { await supabase.from("advertisements").delete().eq("id", id); load(); }
  async function toggle(id: string, v: boolean) { await supabase.from("advertisements").update({ is_active: v }).eq("id", id); load(); }
  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 space-y-2">
        <Input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <Input placeholder="Link URL (optional)" value={draft.link_url} onChange={(e) => setDraft({ ...draft, link_url: e.target.value })} />
        <Input type="file" accept="image/*" onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] ?? null })} />
        <Button className="btn-luxury" onClick={add}>Add advertisement</Button>
      </Card>
      <div className="grid sm:grid-cols-2 gap-2">
        {list.map((a) => (
          <Card key={a.id} className="glass p-2">
            <img src={a.image_url} className="w-full h-32 object-cover rounded" alt="" />
            <div className="font-bold text-sm mt-1 truncate">{a.title}</div>
            <div className="flex gap-1 mt-1">
              <Button size="sm" variant="outline" onClick={() => toggle(a.id, !a.is_active)}>{a.is_active ? "Hide" : "Show"}</Button>
              <Button size="sm" variant="destructive" onClick={() => del(a.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CategoriesPanel() {
  const [list, setList] = useState<any[]>([]);
  const [draft, setDraft] = useState({ name: "", icon: "" });
  async function load() { setList((await supabase.from("categories").select("*").order("name", { ascending: true })).data ?? []); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!draft.name) return;
    await supabase.from("categories").insert(draft);
    setDraft({ name: "", icon: "" }); load();
  }
  async function del(id: string) { await supabase.from("categories").delete().eq("id", id); load(); }
  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 flex gap-2 flex-wrap">
        <Input placeholder="Category name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="flex-1 min-w-[200px]" />
        <Input placeholder="Icon (emoji or name)" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} className="w-40" />
        <Button className="btn-luxury" onClick={add}><Plus className="h-4 w-4" /></Button>
      </Card>
      <div className="flex flex-wrap gap-2">
        {list.map((c) => (
          <Badge key={c.id} variant="outline" className="text-sm py-1 px-3">{c.icon} {c.name}<button onClick={() => del(c.id)} className="ml-2 text-destructive">×</button></Badge>
        ))}
      </div>
    </div>
  );
}

/* ============================ TICKETS ============================ */
function TicketsPanel() {
  const [tickets, setTickets] = useState<any[]>([]);
  const confirm = useConfirm();
  async function load() {
    const { data } = await supabase.from("support_tickets").select("*, profiles:user_id(full_name,email)").order("created_at", { ascending: false }).limit(200);
    setTickets(data ?? []);
  }
  useEffect(() => {
    load();
    const ch = supabase.channel("admin-tk").on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  async function setStatus(id: string, status: string) {
    await supabase.from("support_tickets").update({ status: status as any }).eq("id", id);
    setTickets((t) => t.map((x) => x.id === id ? { ...x, status } : x));
  }
  async function del(id: string) {
    if (!await confirm({ title: "Delete ticket?", tone: "danger", confirmText: "Delete" })) return;
    await supabase.from("support_tickets").delete().eq("id", id);
    setTickets((t) => t.filter((x) => x.id !== id));
  }
  return (
    <div className="space-y-2">
      {tickets.length === 0 && <p className="text-muted-foreground text-sm">No tickets.</p>}
      {tickets.map((t) => (
        <Card key={t.id} className="glass p-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{t.subject}</div>
            <div className="text-xs text-muted-foreground">{t.profiles?.full_name} · {new Date(t.created_at).toLocaleString()}</div>
          </div>
          <Badge variant="outline" className="capitalize">{t.status}</Badge>
          <Select value={t.status} onValueChange={(v) => setStatus(t.id, v)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{["open", "in_progress", "resolved", "closed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" asChild><a href={`/ticket/${t.id}`}>Open</a></Button>
          <Button size="sm" variant="destructive" onClick={() => del(t.id)}><Trash2 className="h-3 w-3" /></Button>
        </Card>
      ))}
    </div>
  );
}

/* ============================ APPEALS ============================ */
function AppealsPanel() {
  const [list, setList] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  async function load() {
    const { data } = await supabase.from("ban_appeals").select("*").order("created_at", { ascending: false });
    setList(data ?? []);
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id,full_name,email,is_banned").in("id", ids);
      const m: Record<string, any> = {}; (p ?? []).forEach((x: any) => { m[x.id] = x; }); setProfiles(m);
    }
  }
  useEffect(() => { load(); }, []);
  async function respond(a: any, status: "approved" | "denied") {
    const note = prompt("Response to user?") ?? "";
    await supabase.from("ban_appeals").update({ status, admin_response: note, reviewed_at: new Date().toISOString() }).eq("id", a.id);
    if (status === "approved") {
      await supabase.from("profiles").update({ is_banned: false, ban_reason: null }).eq("id", a.user_id);
      await supabase.from("notifications").insert({ user_id: a.user_id, title: "Appeal approved", body: `You've been unbanned. ${note}` });
    } else {
      await supabase.from("notifications").insert({ user_id: a.user_id, title: "Appeal denied", body: note });
    }
    logAudit(`appeal_${status}`, "user", a.user_id, { note });
    load();
  }
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-sm text-muted-foreground">No appeals.</p>}
      {list.map((a) => (
        <Card key={a.id} className="glass p-3">
          <div className="flex justify-between items-start gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{profiles[a.user_id]?.full_name ?? "Unknown"} <span className="text-xs text-muted-foreground">{profiles[a.user_id]?.email}</span></div>
              <div className="text-sm mt-1">{a.message}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{new Date(a.created_at).toLocaleString()}</div>
            </div>
            <Badge variant="outline" className="capitalize">{a.status}</Badge>
            {a.status === "pending" && (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => respond(a, "denied")}>Deny</Button>
                <Button size="sm" className="btn-luxury" onClick={() => respond(a, "approved")}>Approve & Unban</Button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ============================ NOTIFY ============================ */
function NotifyPanel() {
  const [target, setTarget] = useState<"all" | "role" | "user">("all");
  const [role, setRole] = useState<AppRole>("viewer");
  const [userQ, setUserQ] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [draft, setDraft] = useState({ title: "", body: "", link: "" });

  useEffect(() => {
    if (target !== "user" || userQ.length < 2) { setUserResults([]); return; }
    supabase.from("profiles").select("id,full_name,email").or(`full_name.ilike.%${userQ}%,email.ilike.%${userQ}%`).limit(10).then(({ data }) => setUserResults(data ?? []));
  }, [userQ, target]);

  async function send() {
    if (!draft.title) { toast.error("Title required"); return; }
    let targets: string[] = [];
    if (target === "all") {
      const { data } = await supabase.from("profiles").select("id");
      targets = (data ?? []).map((x: any) => x.id);
    } else if (target === "role") {
      const { data } = await supabase.from("user_roles").select("user_id").eq("role", role);
      targets = (data ?? []).map((x: any) => x.user_id);
    } else {
      if (!userId) { toast.error("Pick a user"); return; }
      targets = [userId];
    }
    if (targets.length === 0) { toast.error("No recipients"); return; }
    const rows = targets.map((uid) => ({ user_id: uid, title: draft.title, body: draft.body || null, link: draft.link || null }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) toast.error(error.message);
    else { toast.success(`Sent to ${targets.length} user(s)`); logAudit("notify_sent", "broadcast", undefined, { count: targets.length, target }); setDraft({ title: "", body: "", link: "" }); }
  }

  return (
    <Card className="glass-strong p-4 space-y-3 max-w-2xl">
      <div className="font-bold">Send notification</div>
      <Select value={target} onValueChange={(v) => setTarget(v as any)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All users</SelectItem>
          <SelectItem value="role">By role</SelectItem>
          <SelectItem value="user">Single user</SelectItem>
        </SelectContent>
      </Select>
      {target === "role" && (
        <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{(["viewer", "shooter", "gang_leader", "registered", "sponsor", "moderator", "admin"] as AppRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {target === "user" && (
        <div>
          <Input placeholder="Search user…" value={userQ} onChange={(e) => setUserQ(e.target.value)} />
          {userResults.length > 0 && (
            <div className="border border-border rounded mt-1 max-h-40 overflow-y-auto">
              {userResults.map((u) => (
                <button key={u.id} onClick={() => { setUserId(u.id); setUserQ(u.full_name); setUserResults([]); }} className="block w-full text-left px-2 py-1 text-sm hover:bg-muted">{u.full_name} <span className="text-xs text-muted-foreground">{u.email}</span></button>
              ))}
            </div>
          )}
        </div>
      )}
      <Input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      <Textarea placeholder="Body" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
      <Input placeholder="Link (optional, e.g. /matches)" value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
      <Button className="btn-luxury" onClick={send}><Send className="h-4 w-4 mr-1" />Send</Button>
    </Card>
  );
}

/* ============================ AUDIT ============================ */
function AuditPanel() {
  const [logs, setLogs] = useState<any[]>([]);
  const [actors, setActors] = useState<Record<string, any>>({});
  useEffect(() => {
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200).then(async ({ data }) => {
      setLogs(data ?? []);
      const ids = Array.from(new Set((data ?? []).map((x: any) => x.actor_id).filter(Boolean)));
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id,full_name").in("id", ids);
        const m: Record<string, any> = {}; (p ?? []).forEach((x: any) => { m[x.id] = x; }); setActors(m);
      }
    });
  }, []);
  return (
    <div className="space-y-1">
      {logs.length === 0 && <p className="text-sm text-muted-foreground">No audit entries.</p>}
      {logs.map((l) => (
        <Card key={l.id} className="glass p-3 text-sm flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="font-bold">
              <span className="text-primary">{actors[l.actor_id]?.full_name ?? "System"}</span>{" "}
              <span className="text-muted-foreground">{humanize(l.action)}</span>{" "}
              <span className="text-muted-foreground">on</span> <span>{l.target_type}</span>
            </div>
            {l.metadata && Object.keys(l.metadata).length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                {Object.entries(l.metadata).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</div>
        </Card>
      ))}
    </div>
  );
}
function humanize(action: string) { return action.replace(/_/g, " "); }

/* ============================ ANALYTICS ============================ */
function AnalyticsPanel() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const [u, b, t, r] = await Promise.all([
        supabase.from("profiles").select("created_at, token_balance, is_banned"),
        supabase.from("bets").select("status, stake, potential_payout, created_at"),
        supabase.from("token_transactions").select("amount, kind, created_at"),
        supabase.from("token_requests").select("status, amount"),
      ]);
      const users = u.data ?? [];
      const bets = b.data ?? [];
      const txs = t.data ?? [];
      const reqs = r.data ?? [];
      const totalStaked = bets.reduce((a, x: any) => a + (x.stake ?? 0), 0);
      const totalPaid = bets.filter((x: any) => x.status === "won").reduce((a, x: any) => a + (x.potential_payout ?? 0), 0);
      setStats({
        totalUsers: users.length,
        bannedUsers: users.filter((x: any) => x.is_banned).length,
        circulating: users.reduce((a, x: any) => a + (x.token_balance ?? 0), 0),
        totalBets: bets.length,
        wonBets: bets.filter((x: any) => x.status === "won").length,
        lostBets: bets.filter((x: any) => x.status === "lost").length,
        openBets: bets.filter((x: any) => x.status === "open").length,
        totalStaked, totalPaid, houseEdge: totalStaked - totalPaid,
        approvedRequests: reqs.filter((x: any) => x.status === "approved").reduce((a, x: any) => a + (x.amount ?? 0), 0),
        debits: txs.filter((x: any) => x.amount < 0).reduce((a, x: any) => a + Math.abs(x.amount), 0),
        credits: txs.filter((x: any) => x.amount > 0).reduce((a, x: any) => a + x.amount, 0),
      });
    })();
  }, []);
  if (!stats) return <div>Loading…</div>;
  const items = [
    { label: "Total users", value: stats.totalUsers },
    { label: "Banned users", value: stats.bannedUsers },
    { label: "Tokens circulating", value: stats.circulating.toLocaleString() },
    { label: "Total bets", value: stats.totalBets },
    { label: "Won bets", value: stats.wonBets },
    { label: "Lost bets", value: stats.lostBets },
    { label: "Open bets", value: stats.openBets },
    { label: "Total staked", value: stats.totalStaked.toLocaleString() },
    { label: "Total paid out", value: stats.totalPaid.toLocaleString() },
    { label: "Net (house)", value: stats.houseEdge.toLocaleString() },
    { label: "Tokens approved", value: stats.approvedRequests.toLocaleString() },
    { label: "Token credits", value: stats.credits.toLocaleString() },
    { label: "Token debits", value: stats.debits.toLocaleString() },
  ];
  return (
    <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((x) => (
        <Card key={x.label} className="glass p-4">
          <div className="text-2xl font-bold gradient-gold-text">{x.value}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{x.label}</div>
        </Card>
      ))}
    </div>
  );
}

/* ============================ SETTINGS ============================ */
function SettingsPanel() {
  const [s, setS] = useState<any>(null);
  const confirm = useConfirm();
  useEffect(() => { supabase.from("app_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => setS(data ?? { id: 1 })); }, []);
  if (!s) return null;
  async function save() {
    const { error } = await supabase.from("app_settings").upsert(s);
    if (error) toast.error(error.message); else { toast.success("Saved"); logAudit("settings_updated", "settings"); }
  }
  async function wipe() {
    if (!await confirm({ title: "EMERGENCY: Wipe ALL user tokens?", description: "This sets every user's balance to 0 and cannot be undone.", tone: "danger", confirmText: "Wipe everything" })) return;
    const { error } = await supabase.rpc("wipe_all_tokens");
    if (error) toast.error(error.message); else toast.success("All tokens cleared");
  }
  async function uploadPopup(f: File) {
    const path = `popup-${Date.now()}-${f.name}`;
    const { error } = await supabase.storage.from("ads").upload(path, f, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const url = supabase.storage.from("ads").getPublicUrl(path).data.publicUrl;
    setS({ ...s, popup_ad_image: url });
  }
  return (
    <Card className="glass-strong p-4 space-y-3 max-w-2xl">
      <div className="flex items-center justify-between">
        <div><div className="font-bold">Maintenance mode</div><div className="text-xs text-muted-foreground">Blocks all non-admin pages.</div></div>
        <Switch checked={!!s.maintenance_mode} onCheckedChange={(v) => setS({ ...s, maintenance_mode: v })} />
      </div>
      <Textarea placeholder="Maintenance message" value={s.maintenance_message ?? ""} onChange={(e) => setS({ ...s, maintenance_message: e.target.value })} />
      <div>
        <label className="text-xs text-muted-foreground">Hero tagline (top of home page)</label>
        <Input placeholder="Season 4 · Live" value={s.hero_tagline ?? ""} onChange={(e) => setS({ ...s, hero_tagline: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Minimum bet stake</label>
        <Input type="number" placeholder="2000000" value={s.min_stake ?? 2000000} onChange={(e) => setS({ ...s, min_stake: Number(e.target.value) })} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Maximum payout (cash-out cap)</label>
        <Input type="number" placeholder="100000000" value={s.max_payout ?? 100000000} onChange={(e) => setS({ ...s, max_payout: Number(e.target.value) })} />
        <p className="text-[10px] text-muted-foreground mt-1">Any bet whose potential payout exceeds this is automatically capped at this amount.</p>
      </div>
      <Input placeholder="Contact email" value={s.contact_email ?? ""} onChange={(e) => setS({ ...s, contact_email: e.target.value })} />
      <Input placeholder="Contact phone" value={s.contact_phone ?? ""} onChange={(e) => setS({ ...s, contact_phone: e.target.value })} />
      <Input placeholder="Contact WhatsApp" value={s.contact_whatsapp ?? ""} onChange={(e) => setS({ ...s, contact_whatsapp: e.target.value })} />
      <Textarea placeholder="About us" rows={3} value={s.about_us ?? ""} onChange={(e) => setS({ ...s, about_us: e.target.value })} />
      <Textarea placeholder="Why trust us" rows={3} value={s.why_trust_us ?? ""} onChange={(e) => setS({ ...s, why_trust_us: e.target.value })} />
      <Textarea placeholder="Terms & Conditions" rows={5} value={s.terms_content ?? ""} onChange={(e) => setS({ ...s, terms_content: e.target.value })} />

      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-bold">Pop-up Ad</div>
          <Switch checked={!!s.popup_ad_active} onCheckedChange={(v) => setS({ ...s, popup_ad_active: v })} />
        </div>
        <Select value={s.popup_ad_size ?? "large"} onValueChange={(v) => setS({ ...s, popup_ad_size: v })}>
          <SelectTrigger><SelectValue placeholder="Size" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="large">Large</SelectItem>
            <SelectItem value="xl">Extra Large</SelectItem>
          </SelectContent>
        </Select>
        <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadPopup(e.target.files[0])} />
        {s.popup_ad_image && <img src={s.popup_ad_image} alt="" className="w-full max-h-48 object-contain rounded border border-border" />}
        <Textarea placeholder="Popup text/HTML" rows={3} value={s.popup_ad_text ?? ""} onChange={(e) => setS({ ...s, popup_ad_text: e.target.value })} />
        <Input placeholder="Popup link (optional)" value={s.popup_ad_link ?? ""} onChange={(e) => setS({ ...s, popup_ad_link: e.target.value })} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button className="btn-luxury" onClick={save}>Save settings</Button>
        <Button variant="destructive" onClick={wipe}><AlertTriangle className="h-4 w-4 mr-1" />Emergency: wipe all tokens</Button>
      </div>
    </Card>
  );
}

/* ============================ WITHDRAWALS ============================ */
function WithdrawalsPanel() {
  const [list, setList] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const confirm = useConfirm();
  async function load() {
    const { data } = await supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false });
    setList(data ?? []);
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id,full_name,email,token_balance").in("id", ids);
      const m: Record<string, any> = {}; (p ?? []).forEach((x: any) => { m[x.id] = x; }); setProfiles(m);
    }
  }
  useEffect(() => {
    load();
    const ch = supabase.channel("admin-wd").on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function decide(r: any, approve: boolean) {
    const ok = await confirm({
      title: approve ? "Approve withdrawal?" : "Decline withdrawal?",
      description: approve ? "Tokens stay deducted; user will be notified." : "Tokens will be refunded to the user.",
      tone: approve ? "default" : "danger",
      confirmText: approve ? "Approve" : "Decline & refund",
    });
    if (!ok) return;
    const note = window.prompt(approve ? "Instructions for user (optional)" : "Reason for declining (optional)") ?? "";
    const { error } = await supabase.rpc("review_withdrawal_request", { _id: r.id, _approve: approve, _note: note || undefined });
    if (error) toast.error(error.message); else { toast.success("Done"); logAudit(`withdrawal_${approve ? "approved" : "declined"}`, "withdrawal", r.id); load(); }
  }

  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-sm text-muted-foreground">No withdrawal requests.</p>}
      {list.map((r) => (
        <Card key={r.id} className="glass p-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="font-bold">{r.amount.toLocaleString()} tokens · <span className="text-primary">{r.ingame_name}</span> <span className="text-xs text-muted-foreground">({r.gang_name})</span></div>
            <div className="text-xs text-muted-foreground">{profiles[r.user_id]?.full_name} · {profiles[r.user_id]?.email}</div>
            {r.ticket_ref && <div className="text-xs">Ticket: <span className="font-mono">{r.ticket_ref}</span></div>}
            <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
            {r.admin_note && <div className="text-xs italic mt-1">"{r.admin_note}"</div>}
          </div>
          <Badge variant="outline" className="capitalize">{r.status}</Badge>
          {r.status === "pending" && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => decide(r, false)}>Decline</Button>
              <Button size="sm" className="btn-luxury" onClick={() => decide(r, true)}>Approve</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ============================ LEADERBOARD ADMIN ============================ */
function LeaderboardAdminPanel() {
  const [list, setList] = useState<any[]>([]);
  const [draft, setDraft] = useState({ kind: "gang", name: "", top_player: "", wins: 0, losses: 0, draws: 0, played: 0, points: 0, manual_rank: "" });
  async function load() { setList((await supabase.from("leaderboard_overrides").select("*").order("kind").order("manual_rank", { ascending: true, nullsFirst: false })).data ?? []); }
  useEffect(() => { load(); }, []);
  async function save() {
    if (!draft.name) { toast.error("Name required"); return; }
    const payload: any = { ...draft, manual_rank: draft.manual_rank ? Number(draft.manual_rank) : null };
    await supabase.from("leaderboard_overrides").upsert(payload);
    setDraft({ kind: "gang", name: "", top_player: "", wins: 0, losses: 0, draws: 0, played: 0, points: 0, manual_rank: "" });
    load();
  }
  async function del(id: string) { await supabase.from("leaderboard_overrides").delete().eq("id", id); load(); }
  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 space-y-2">
        <div className="font-bold">Manual override (auto-stats are computed from match results)</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="gang">Gang/Faction</SelectItem><SelectItem value="shooter">Shooter</SelectItem></SelectContent>
          </Select>
          <Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input placeholder="Top player (gang only)" value={draft.top_player} onChange={(e) => setDraft({ ...draft, top_player: e.target.value })} />
          <Input placeholder="Manual rank #" value={draft.manual_rank} onChange={(e) => setDraft({ ...draft, manual_rank: e.target.value })} />
          <Input type="number" placeholder="W" value={draft.wins} onChange={(e) => setDraft({ ...draft, wins: Number(e.target.value) })} />
          <Input type="number" placeholder="L" value={draft.losses} onChange={(e) => setDraft({ ...draft, losses: Number(e.target.value) })} />
          <Input type="number" placeholder="D" value={draft.draws} onChange={(e) => setDraft({ ...draft, draws: Number(e.target.value) })} />
          <Input type="number" placeholder="Played" value={draft.played} onChange={(e) => setDraft({ ...draft, played: Number(e.target.value) })} />
          <Input type="number" placeholder="Points" value={draft.points} onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })} />
        </div>
        <Button className="btn-luxury" onClick={save}><Plus className="h-4 w-4 mr-1" />Save override</Button>
      </Card>
      <div className="space-y-1">
        {list.map((o) => (
          <Card key={o.id} className="glass p-2 flex items-center gap-2 flex-wrap text-sm">
            <Badge variant="outline" className="capitalize">{o.kind}</Badge>
            <div className="font-bold flex-1 min-w-0 truncate">{o.name} {o.top_player && <span className="text-xs text-muted-foreground">· top: {o.top_player}</span>}</div>
            <span className="text-xs text-muted-foreground">W {o.wins} · L {o.losses} · D {o.draws} · PTS {o.points}{o.manual_rank ? ` · #${o.manual_rank}` : ""}</span>
            <Button size="sm" variant="destructive" onClick={() => del(o.id)}><Trash2 className="h-3 w-3" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================ LIVE SCORE EDITOR ============================ */
function LiveScoreEditor({ m, onSave }: { m: any; onSave: (hs: number, as: number) => void }) {
  const [hs, setHs] = useState<number>(m.home_score ?? 0);
  const [as_, setAs] = useState<number>(m.away_score ?? 0);
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30">
      <span className="text-[10px] uppercase tracking-widest text-emerald-300 mr-1">LIVE</span>
      <Input type="number" value={hs} onChange={(e) => setHs(Number(e.target.value))} className="h-7 w-12 text-center text-xs" />
      <span className="text-xs text-muted-foreground">–</span>
      <Input type="number" value={as_} onChange={(e) => setAs(Number(e.target.value))} className="h-7 w-12 text-center text-xs" />
      <Button size="sm" className="h-7" onClick={() => onSave(hs, as_)}><Check className="h-3 w-3" /></Button>
    </div>
  );
}

/* ============================ BET TRACKER ============================ */
function BetTrackerPanel() {
  const confirm = useConfirm();
  const [bets, setBets] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  async function load() {
    let qb = supabase.from("bets")
      .select("*, profiles:user_id(full_name,email,ingame_name), bet_selections(*, matches:match_id(name))")
      .order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") qb = qb.eq("status", filter as any);
    const { data } = await qb;
    setBets(data ?? []);
  }
  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    const ch = supabase.channel("admin-bettracker").on("postgres_changes", { event: "*", schema: "public", table: "bets" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function suspend(b: any) {
    const reason = window.prompt("Reason for suspending this ticket?") ?? undefined;
    const ok = await confirm({ title: "Suspend ticket?", description: `Tracking ${b.tracking_id} will be suspended. User will be notified.`, tone: "danger", confirmText: "Suspend" });
    if (!ok) return;
    const { error } = await supabase.rpc("admin_suspend_bet", { _bet_id: b.id, _reason: reason });
    if (error) toast.error(error.message); else { toast.success("Ticket suspended"); load(); }
  }
  async function unsuspend(b: any) {
    const { error } = await supabase.rpc("admin_unsuspend_bet", { _bet_id: b.id });
    if (error) toast.error(error.message); else { toast.success("Ticket reactivated"); load(); }
  }
  async function del(b: any) {
    const ok = await confirm({ title: "Delete ticket?", description: `Tracking ${b.tracking_id}. Refund stake to user?`, tone: "danger", confirmText: "Delete (no refund)", cancelText: "Cancel" });
    if (!ok) return;
    const refund = window.confirm("Also REFUND the stake to the user?");
    const { error } = await supabase.rpc("admin_delete_bet", { _bet_id: b.id, _refund: refund, _reason: undefined as any });
    if (error) toast.error(error.message); else { toast.success(refund ? "Ticket deleted & refunded" : "Ticket deleted"); load(); }
  }

  const filtered = bets.filter((b) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return b.tracking_id?.toLowerCase().includes(s) || b.booking_code?.toLowerCase().includes(s) || b.profiles?.email?.toLowerCase().includes(s) || b.profiles?.full_name?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-3">
      <Card className="glass p-3 flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <div className="font-bold text-sm">Bet Ticket Tracker</div>
        <div className="flex-1" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tracking, code, user…" className="max-w-xs" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all","open","won","lost","suspended","cashed_out","void"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No tickets match.</p>}
        {filtered.map((b) => (
          <Card key={b.id} className="glass p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-primary font-bold">{b.tracking_id}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">· {b.booking_code}</span>
                  <Badge variant="outline" className={
                    b.status === 'won' ? 'border-emerald-500/50 text-emerald-300' :
                    b.status === 'lost' ? 'border-destructive/50 text-destructive' :
                    b.status === 'suspended' ? 'border-amber-500/50 text-amber-300' :
                    'border-primary/50 text-primary'
                  }>{b.status}</Badge>
                </div>
                <div className="text-xs mt-1">
                  <span className="font-bold">{b.profiles?.full_name || b.profiles?.email}</span>
                  {b.profiles?.ingame_name && <span className="text-muted-foreground"> · {b.profiles.ingame_name}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Stake {Number(b.stake).toLocaleString()} · Odds {Number(b.total_odds).toFixed(2)} · Payout {Number(b.potential_payout).toLocaleString()} · {new Date(b.created_at).toLocaleString()}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 truncate">
                  {(b.bet_selections ?? []).map((s: any) => `${s.matches?.name ?? "Match"}: ${s.selection_label} @${Number(s.locked_odds).toFixed(2)}`).join(" · ")}
                </div>
              </div>
              <div className="flex gap-1 items-center">
                <Button asChild size="sm" variant="outline"><a href={`/ticket/${b.id}`}>View</a></Button>
                {b.status === "open" && <Button size="sm" variant="outline" onClick={() => suspend(b)}><Pause className="h-3 w-3" /></Button>}
                {b.status === "suspended" && <Button size="sm" variant="outline" onClick={() => unsuspend(b)}><Play className="h-3 w-3" /></Button>}
                <Button size="sm" variant="destructive" onClick={() => del(b)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================ PROMO CODE REQUESTS ============================ */
function PromoRequestsPanel() {
  const confirm = useConfirm();
  const [reqs, setReqs] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  async function load() {
    let qb = supabase.from("promo_code_requests")
      .select("*, profiles:user_id(full_name,email)")
      .order("created_at", { ascending: false });
    if (filter !== "all") qb = qb.eq("status", filter);
    const { data } = await qb;
    setReqs(data ?? []);
  }
  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    const ch = supabase.channel("admin-promo-reqs").on("postgres_changes", { event: "*", schema: "public", table: "promo_code_requests" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function approve(r: any) {
    const note = window.prompt("Optional note to sponsor?") ?? undefined;
    const ok = await confirm({ title: "Approve & generate code?", description: `Will create a ${Number(r.amount).toLocaleString()}-token promo code with ${r.usage_limit} uses.`, confirmText: "Approve" });
    if (!ok) return;
    const { error } = await supabase.rpc("approve_promo_request", { _id: r.id, _note: note });
    if (error) toast.error(error.message); else { toast.success("Promo code approved & generated"); load(); }
  }
  async function decline(r: any) {
    const note = window.prompt("Reason for decline?") ?? undefined;
    const ok = await confirm({ title: "Decline request?", tone: "danger", confirmText: "Decline" });
    if (!ok) return;
    const { error } = await supabase.rpc("decline_promo_request", { _id: r.id, _note: note });
    if (error) toast.error(error.message); else { toast.success("Request declined"); load(); }
  }

  return (
    <div className="space-y-3">
      <Card className="glass p-3 flex items-center gap-3">
        <Tag className="h-4 w-4 text-amber-300" />
        <div className="font-bold text-sm">Promo Code Requests (Sponsors)</div>
        <div className="flex-1" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{["pending","approved","declined","all"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </Card>
      <div className="space-y-2">
        {reqs.length === 0 && <p className="text-sm text-muted-foreground">No requests.</p>}
        {reqs.map((r) => (
          <Card key={r.id} className="glass p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm">{r.profiles?.full_name || r.profiles?.email}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {Number(r.amount).toLocaleString()} tokens × {r.usage_limit} uses · {new Date(r.created_at).toLocaleString()}
                </div>
                {r.reason && <div className="text-xs mt-1">"{r.reason}"</div>}
                {r.generated_code && <div className="text-xs font-mono mt-1 text-emerald-300">Code: {r.generated_code}</div>}
                {r.admin_note && <div className="text-xs text-muted-foreground mt-1">Admin: {r.admin_note}</div>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className={
                  r.status === "approved" ? "border-emerald-500/50 text-emerald-300" :
                  r.status === "declined" ? "border-destructive/50 text-destructive" :
                  "border-amber-500/50 text-amber-300"
                }>{r.status}</Badge>
                {r.status === "pending" && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => approve(r)}><Check className="h-3 w-3 mr-1" />Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => decline(r)}><X className="h-3 w-3 mr-1" />Decline</Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================ ADMIN AI (COMING SOON) ============================ */
function AdminAIPanel() {
  return (
    <Card className="relative overflow-hidden glass-strong border-primary/30 p-10 text-center">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
      <div className="relative z-10 max-w-md mx-auto">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 grid place-items-center mx-auto mb-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-extrabold gradient-gold-text mb-2">Admin AI</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Smart copilot for moderation, analytics summaries, fraud detection, and one-tap actions across the entire platform.
        </p>
        <Badge variant="outline" className="border-primary/50 text-primary"><Lock className="h-3 w-3 mr-1" />Coming Soon</Badge>
      </div>
    </Card>
  );
}
