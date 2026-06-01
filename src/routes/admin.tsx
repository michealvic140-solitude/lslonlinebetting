import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RiskPanel, PnLPanel, ReferralsAdminPanel, EmblemModerationPanel, VipAdminPanel, StreakAndPushPanel, TokenRulesPanel, BroadcastPanel, ActivityPanel, ReportsPanel, AdminAILivePanel } from "@/components/admin/AdminExtensions";
import { VirtualAdminPanel } from "@/components/admin/VirtualAdminPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Shield, Users, Trophy, Coins, Megaphone, Settings as SettingsIcon, Ticket, AlertTriangle,
  Calendar, Tag, Image as ImageIcon, BarChart3, History, Send, Plus, Trash2, Pencil, ChevronRight, ChevronLeft, Wallet, ListOrdered, Sparkles, ClipboardList, Lock, Pause, Play, Check, X, MessageSquare, Eye, RotateCw, Copy, Globe, MapPin, Smartphone, Clock, Filter,
  Dice5, LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import lslLogo from "@/assets/lsl-logo.png";
import tileVirtual from "@/assets/tile-virtual.jpg";
import tileVip from "@/assets/tile-vip.jpg";
import tileChallenges from "@/assets/tile-challenges.jpg";
import tileReferrals from "@/assets/tile-referrals.jpg";
import tileHousewallet from "@/assets/tile-housewallet.jpg";
import { Countdown } from "@/components/Countdown";
import { useAuth, ROLE_LABELS, type AppRole } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fetchTeams } from "@/lib/queries";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from "recharts";
import { useConfirm } from "@/components/ConfirmDialog";
import { SpotlightsAdminPanel } from "@/components/Spotlight";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — LSL" }, { name: "description", content: "League administration dashboard." }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, isMod, loading } = useAuth();
  const nav = useNavigate();
  const [alerts, setAlerts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState(isAdmin ? "analytics" : "tickets");
  useEffect(() => { if (!loading && !isAdmin && !isMod) nav({ to: "/" }); }, [isAdmin, isMod, loading, nav]);
  useEffect(() => {
    if (!isAdmin) return;
    const loadAlerts = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [users, tokens, withdrawals, tickets, bets, promos, appeals, chat] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("token_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "closed"),
        supabase.from("bets").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("promo_code_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("ban_appeals").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("chat_messages").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);
      setAlerts({ users: users.count ?? 0, tokens: tokens.count ?? 0, withdrawals: withdrawals.count ?? 0, tickets: tickets.count ?? 0, bettracker: bets.count ?? 0, promoreqs: promos.count ?? 0, appeals: appeals.count ?? 0, chat: chat.count ?? 0 });
    };
    loadAlerts();
    const ch = supabase.channel("admin-alert-indicators")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "token_requests" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_messages" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_code_requests" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "ban_appeals" }, loadAlerts)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, loadAlerts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin]);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string") setActiveTab(detail);
    };
    window.addEventListener("admin:set-tab", handler);
    return () => window.removeEventListener("admin:set-tab", handler);
  }, []);
  if (loading) return <Layout><div className="container py-10">Loading…</div></Layout>;
  if (!isAdmin && !isMod) return null;

  return (
    <Layout>
      <main className="w-full min-h-[calc(100vh-3.5rem)]">
        <div className={`mx-auto w-full ${activeTab === "analytics" ? "max-w-[1600px]" : "max-w-[1080px]"} px-3 sm:px-4 py-4 sm:py-6 space-y-4`}>
          <div className="relative overflow-hidden rounded-2xl p-4 border border-primary/30 shadow-luxury bg-gradient-to-br from-card/90 via-card/70 to-primary/10 backdrop-blur-xl">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-gold" />
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
            <div className="relative flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab("analytics")}
                className="h-12 w-12 rounded-2xl bg-gradient-gold text-primary-foreground grid place-items-center shadow-gold overflow-hidden ring-2 ring-primary/40 shrink-0 hover:ring-primary/70 transition"
                title="Open analytics"
              >
                <img src={lslLogo} alt="LSL" className="h-10 w-10 object-contain" />
              </button>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Command center</p>
                <h1 className="text-2xl sm:text-3xl font-bold gradient-gold-text">Admin Console</h1>
              </div>
              <Badge variant="outline" className={`ml-auto ${isAdmin ? "border-accent/50 text-accent" : "border-primary/50 text-primary"}`}>
                {isAdmin ? "Admin" : "Moderator"}
              </Badge>
              {isAdmin && (
                <div className="flex items-center gap-1 w-full sm:w-auto sm:ml-2">
                  <Button size="sm" variant="outline" className="text-[11px]" onClick={() => { if (typeof window !== "undefined") window.location.reload(); }} title="Reload this admin page">⟳ Reload</Button>
                  <Button size="sm" variant="outline" className="text-[11px]" onClick={async () => {
                    try {
                      if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
                      if (typeof caches !== "undefined") { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
                    } catch {}
                    if (typeof window !== "undefined") window.location.reload();
                  }} title="Clear caches & service workers, then reload">⚡ Hard refresh</Button>
                  <Button size="sm" variant="destructive" className="text-[11px]" onClick={async () => {
                    const { error } = await (supabase as any).from("app_settings").update({ force_reload_at: new Date().toISOString() }).eq("id", 1);
                    if (error) { (await import("sonner")).toast.error(error.message); return; }
                    (await import("sonner")).toast.success("Reload broadcast sent to every active browser.");
                  }} title="Force every logged-in browser to reload right now">📣 Broadcast reload</Button>
                </div>
              )}
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
            <TabsContent value="bannedusers" className="mt-4"><BannedUsersPanel /></TabsContent>
            <TabsContent value="virtual" className="mt-4"><VirtualAdminPanel /></TabsContent>
            <TabsContent value="matches" className="mt-4"><MatchesPanel /></TabsContent>
            <TabsContent value="events" className="mt-4"><EventsPanel /></TabsContent>
            <TabsContent value="tokens" className="mt-4"><TokensPanel /></TabsContent>
            <TabsContent value="tokenmovement" className="mt-4"><TokenMovementPanel /></TabsContent>
            <TabsContent value="wonbets" className="mt-4"><BetsByStatusPanel status="won" /></TabsContent>
            <TabsContent value="lostbets" className="mt-4"><BetsByStatusPanel status="lost" /></TabsContent>
            <TabsContent value="withdrawals" className="mt-4"><WithdrawalsPanel /></TabsContent>
            <TabsContent value="housewallet" className="mt-4"><HouseWalletPanel /></TabsContent>
            <TabsContent value="leaderboard" className="mt-4"><LeaderboardAdminPanel /></TabsContent>
            <TabsContent value="promos" className="mt-4"><PromoPanel /></TabsContent>
            <TabsContent value="content" className="mt-4"><ContentPanel /></TabsContent>
            <TabsContent value="tickets" className="mt-4"><TicketsPanel /></TabsContent>
            <TabsContent value="tasks" className="mt-4"><TasksAchievementsPanel /></TabsContent>
            <TabsContent value="challenges" className="mt-4"><ChallengesAdminPanel /></TabsContent>
            <TabsContent value="seasons" className="mt-4"><SeasonsAdminPanel /></TabsContent>
            <TabsContent value="bettracker" className="mt-4"><BetTrackerPanel /></TabsContent>
            <TabsContent value="promoreqs" className="mt-4"><PromoRequestsPanel /></TabsContent>
            <TabsContent value="appeals" className="mt-4"><AppealsPanel /></TabsContent>
            <TabsContent value="chat" className="mt-4"><ChatMonitorPanel /></TabsContent>
            <TabsContent value="notify" className="mt-4"><NotifyPanel /></TabsContent>
            <TabsContent value="audit" className="mt-4"><AuditPanel /></TabsContent>
            <TabsContent value="analytics" className="mt-4"><AnalyticsPanel /></TabsContent>
            <TabsContent value="settings" className="mt-4"><SettingsPanel /></TabsContent>
            <TabsContent value="adminai" className="mt-4"><AdminAILivePanel /></TabsContent>
            <TabsContent value="risk" className="mt-4"><RiskPanel /></TabsContent>
            <TabsContent value="pnl" className="mt-4"><PnLPanel /></TabsContent>
            <TabsContent value="reports" className="mt-4"><ReportsPanel /></TabsContent>
            <TabsContent value="tokenrules" className="mt-4"><TokenRulesPanel /></TabsContent>
            <TabsContent value="broadcast" className="mt-4"><BroadcastPanel /></TabsContent>
            <TabsContent value="activity" className="mt-4"><ActivityPanel /></TabsContent>
            <TabsContent value="streakpush" className="mt-4"><StreakAndPushPanel /></TabsContent>
            <TabsContent value="referrals" className="mt-4"><ReferralsAdminPanel /></TabsContent>
            <TabsContent value="emblems" className="mt-4"><EmblemModerationPanel /></TabsContent>
            <TabsContent value="vip" className="mt-4"><VipAdminPanel /></TabsContent>
            <TabsContent value="spotlights" className="mt-4"><SpotlightsAdminPanel /></TabsContent>
          </Tabs>
        </div>
      </main>
    </Layout>
  );
}

async function logAudit(action: string, target_type: string, target_id?: string, metadata?: any) {
  const u = (await supabase.auth.getUser()).data.user;
  if (!u) return;
  const enriched: any = {
    ...(metadata ?? {}),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    route: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
    origin: typeof window !== "undefined" ? window.location.origin : null,
    locale: typeof navigator !== "undefined" ? navigator.language : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    source: "admin_panel",
  };
  if (target_type === "user" && target_id) enriched.target_user_id = target_id;
  const { error } = await (supabase as any).rpc("admin_log_action", {
    _action: action,
    _target_type: target_type,
    _target_id: target_id ?? null,
    _metadata: enriched,
  });
  if (error) console.warn("audit log failed", error.message);
}

function AdminTab({ icon: Icon, label, count = 0 }: { icon: any; label: string; count?: number }) {
  return (
    <span className="relative inline-flex items-center gap-1">
      <Icon className="h-3 w-3" />{label}
      {count > 0 && <span className="ml-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" title={`${count} new/pending`} />}
    </span>
  );
}

function AdminSectionRail({ alerts, onOpen }: { alerts: Record<string, number>; onOpen: (tab: string) => void }) {
  const { isAdmin } = useAuth();
  const all = [
    { tab: "tickets", icon: Ticket, label: "Open reports", count: alerts.tickets ?? 0, mod: true },
    { tab: "bettracker", icon: ClipboardList, label: "Booked tickets", count: alerts.bettracker ?? 0, mod: false },
    { tab: "tokens", icon: Coins, label: "Token requests", count: alerts.tokens ?? 0, mod: false },
    { tab: "withdrawals", icon: Wallet, label: "Withdrawals", count: alerts.withdrawals ?? 0, mod: false },
    { tab: "promoreqs", icon: Tag, label: "Promo requests", count: alerts.promoreqs ?? 0, mod: false },
    { tab: "appeals", icon: AlertTriangle, label: "Ban appeals", count: alerts.appeals ?? 0, mod: true },
  ];
  const items = isAdmin ? all : all.filter((i) => i.mod);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {items.map((item) => (
        <button key={item.tab} onClick={() => onOpen(item.tab)} className="group relative overflow-hidden rounded-xl border border-primary/20 bg-card/70 p-3 text-left shadow-luxury transition hover:-translate-y-0.5 hover:border-primary/50">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-gold" />
          <item.icon className="h-4 w-4 text-primary mb-2" />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</div>
          <div className="mt-1 text-2xl font-black gradient-gold-text">{item.count}</div>
          {item.count > 0 && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />}
        </button>
      ))}
    </div>
  );
}

function ChatMonitorPanel() {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  async function load() {
    const { data } = await supabase.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(120);
    setMsgs(data ?? []);
    const ids = Array.from(new Set((data ?? []).map((m: any) => m.user_id).filter(Boolean)));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id,full_name,email,gang_name,is_muted,is_banned").in("id", ids);
      const map: Record<string, any> = {}; (p ?? []).forEach((x: any) => { map[x.id] = x; }); setProfiles(map);
    }
  }
  useEffect(() => {
    load();
    const ch = supabase.channel("admin-chat-monitor").on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  async function del(id: string) { await supabase.from("chat_messages").delete().eq("id", id); load(); }
  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 flex items-center gap-3">
        <MessageSquare className="h-5 w-5 text-primary" />
        <div><div className="font-bold">Live Chat Monitor</div><div className="text-xs text-muted-foreground">Newest messages across all rooms with quick moderation access.</div></div>
      </Card>
      {msgs.map((m) => {
        const p = profiles[m.user_id];
        return (
          <Card key={m.id} className="glass p-3 flex items-start gap-3 flex-wrap">
            <Badge variant="outline" className="capitalize border-primary/40 text-primary">{m.room}</Badge>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{p?.full_name ?? "Unknown"} <span className="text-xs text-muted-foreground">{p?.email}</span></div>
              {m.content && <div className="text-sm mt-1 break-words">{m.content}</div>}
              {m.image_url && <a href={m.image_url} target="_blank" rel="noreferrer"><img src={m.image_url} alt="Chat upload" className="mt-2 max-h-28 rounded-lg border border-border" /></a>}
              <div className="text-[10px] text-muted-foreground mt-1">{p?.gang_name ?? "Independent"} · {new Date(m.created_at).toLocaleString()}</div>
            </div>
            <Button size="sm" variant="destructive" onClick={() => del(m.id)}><Trash2 className="h-3 w-3" /></Button>
          </Card>
        );
      })}
    </div>
  );
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

  const stats = useMemo(() => {
    const total = users.length;
    const banned = users.filter((u) => u.is_banned).length;
    const muted = users.filter((u) => u.is_muted).length;
    const restricted = users.filter((u) => u.is_restricted).length;
    const active = total - banned;
    const tokens = users.reduce((a, u) => a + (u.token_balance ?? 0), 0);
    const vip = users.filter((u) => (u.vip_tier ?? 0) > 0).length;
    return { total, banned, muted, restricted, active, tokens, vip };
  }, [users]);

  return (
    <div className="space-y-4">
      {/* Luxury header */}
      <div className="relative overflow-hidden rounded-2xl admin-user-bg admin-user-frame p-5">
        <div className="absolute inset-0 " />
        <div className="relative flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl grid place-items-center bg-gradient-gold shadow-gold">
              <Users className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-primary/80">Member Registry</div>
              <div className="text-xl font-display admin-user-foil">Users Panel</div>
            </div>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { l: "Total", v: stats.total },
              { l: "Active", v: stats.active },
              { l: "VIP", v: stats.vip },
              { l: "Banned", v: stats.banned },
              { l: "Muted", v: stats.muted },
              { l: "Tokens", v: stats.tokens.toLocaleString() },
            ].map((s) => (
              <div key={s.l} className="admin-user-inner rounded-xl px-3 py-2 text-center min-w-[64px]">
                <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{s.l}</div>
                <div className="text-sm font-black admin-user-foil leading-tight">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="admin-user-inner border-0 p-3 grid md:grid-cols-4 gap-2">
        <div className="relative md:col-span-1">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/70" />
          <Input
            placeholder="Search name, email, gang…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 bg-background/40 border-primary/25 focus-visible:ring-primary/60"
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="bg-background/40 border-primary/25"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {(["viewer", "shooter", "gang_leader", "registered", "sponsor", "moderator", "admin"] as AppRole[]).map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="bg-background/40 border-primary/25"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
            <SelectItem value="muted">Muted</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="bg-background/40 border-primary/25"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="alpha">A → Z</SelectItem>
            <SelectItem value="tokens">Most tokens</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-primary/70">
        <span>{filtered.length} member{filtered.length === 1 ? "" : "s"}</span>
        <span className="h-px flex-1 mx-3 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((u) => {
          const initials = (u.full_name ?? u.email ?? "U").split(/\s|@/).filter(Boolean).map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
          const userRoles = rolesByUser[u.id] ?? [];
          const isStaff = userRoles.includes("admin") || userRoles.includes("moderator");
          const vipTier = u.vip_tier ?? 0;
          const joined = u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
          return (
            <div
              key={u.id}
              className="group relative admin-user-bg admin-user-frame rounded-2xl p-4 overflow-hidden transition-transform hover:-translate-y-0.5"
            >
              <div className="absolute inset-0 admin-user-inner-noise pointer-events-none opacity-0" />
              {/* Status accent stripe */}
              <div className={`absolute top-0 left-0 right-0 h-[3px] ${u.is_banned ? "bg-gradient-to-r from-transparent via-destructive to-transparent" : isStaff ? "bg-gradient-to-r from-transparent via-accent to-transparent" : "bg-gradient-to-r from-transparent via-primary to-transparent"}`} />

              <div className="relative flex items-start gap-3">
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="absolute inset-[-4px] rounded-2xl blur-md bg-[radial-gradient(circle,oklch(0.82_0.17_90/0.55),transparent_70%)]" />
                  <div className="relative h-14 w-14 rounded-2xl border-2 border-primary/70 bg-card grid place-items-center overflow-hidden shadow-gold">
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                      : <span className="font-display text-lg admin-user-foil">{initials}</span>}
                  </div>
                  {vipTier > 0 && (
                    <div className="absolute -bottom-1 -right-1 h-5 px-1.5 rounded-full bg-gradient-gold text-primary-foreground text-[9px] font-black grid place-items-center shadow-gold">
                      VIP {vipTier}
                    </div>
                  )}
                </div>

                {/* Identity */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="font-bold text-sm admin-user-foil truncate">{u.full_name || "Unnamed"}</div>
                    {u.is_banned && <span className="badge-lost text-[9px] px-1.5 py-0.5 rounded-full font-bold">BANNED</span>}
                    {u.is_muted && <span className="badge-pending text-[9px] px-1.5 py-0.5 rounded-full font-bold">MUTED</span>}
                    {u.is_restricted && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border border-orange-400/60 text-orange-300 bg-orange-500/10">RESTRICTED</span>}
                    {!u.is_banned && !u.is_muted && !u.is_restricted && <span className="badge-won text-[9px] px-1.5 py-0.5 rounded-full font-bold">ACTIVE</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                    <Shield className="h-3 w-3 text-primary/70" />
                    <span className="truncate">{u.gang_name ?? "Independent"}{u.gang_type && ` · ${u.gang_type}`}</span>
                  </div>
                  {userRoles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {userRoles.map((r) => (
                        <span
                          key={r}
                          className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider ${
                            r === "admin" ? "border-destructive/60 text-destructive bg-destructive/10"
                            : r === "moderator" ? "border-accent/60 text-accent bg-accent/10"
                            : "border-primary/40 text-primary/90 bg-primary/5"
                          }`}
                        >
                          {ROLE_LABELS[r as AppRole]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats footer */}
              <div className="relative mt-3 pt-3 border-t border-primary/15 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Tokens</div>
                  <div className="text-sm font-black admin-user-foil flex items-center justify-center gap-1">
                    <Coins className="h-3 w-3 text-primary" />
                    {(u.token_balance ?? 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">XP</div>
                  <div className="text-sm font-black text-primary/90">{(u.xp ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Joined</div>
                  <div className="text-[11px] font-semibold text-foreground/80">{joined}</div>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => setEdit(u)}
                className="btn-luxury w-full mt-3 h-9 font-bold tracking-wide"
              >
                <Pencil className="h-3 w-3 mr-1" />Manage Member
              </Button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="admin-user-inner rounded-2xl p-10 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 text-primary/40" />
          No members match your filters.
        </div>
      )}

      {edit && <UserEditDialog user={edit} roles={rolesByUser[edit.id] ?? []} onClose={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function UserEditDialog({ user, roles, onClose }: { user: any; roles: string[]; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState({ ...user });
  const [tokenDelta, setTokenDelta] = useState(0);
  const [tokenReason, setTokenReason] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [bets, setBets] = useState<any[]>([]);
  const [tx, setTx] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [actorMap, setActorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [bRes, tRes, aRes, aByRes, aMetaRes, wRes, rRes] = await Promise.all([
        supabase.from("bets").select("*, bet_selections(id, selection_label, locked_odds, result, matches!match_id(name, status, home_score, away_score), markets!market_id(name))").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40),
        supabase.from("token_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80),
        supabase.from("audit_logs").select("*").eq("target_type", "user").eq("target_id", user.id).order("created_at", { ascending: false }).limit(80),
        supabase.from("audit_logs").select("*").eq("actor_id", user.id).order("created_at", { ascending: false }).limit(40),
        supabase.from("audit_logs").select("*").contains("metadata", { target_user_id: user.id } as any).order("created_at", { ascending: false }).limit(60),
        supabase.from("withdrawal_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("promo_redemptions").select("*, promo_codes:promo_id(code)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      ]);
      // Merge audit log sources and de-duplicate by id, newest first
      const auditMap = new Map<string, any>();
      for (const row of [...(aRes.data ?? []), ...(aByRes.data ?? []), ...(aMetaRes.data ?? [])]) {
        if (row?.id) auditMap.set(row.id, row);
      }
      const mergedAudits = Array.from(auditMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setBets(bRes.data ?? []);
      setTx(tRes.data ?? []);
      setAudits(mergedAudits);
      setWithdrawals(wRes.data ?? []);
      setRedemptions(rRes.data ?? []);

      const actorIds = Array.from(new Set([
        ...mergedAudits.map((a: any) => a.actor_id).filter(Boolean),
        ...(wRes.data ?? []).map((w: any) => w.reviewed_by).filter(Boolean),
      ]));
      if (actorIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name ?? p.id; });
        setActorMap(map);
      }
    })();
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
    await logAudit(tokenDelta > 0 ? "grant_tokens" : "revoke_tokens", "user", user.id, {
      amount: tokenDelta, reason: tokenReason,
      balance_from: user.token_balance ?? 0, balance_to: newBal,
      target_user_email: user.email, target_user_name: user.full_name,
    });
    toast.success("Applied"); setTokenDelta(0); setTokenReason("");
  }
  async function kickUser() {
    if (!isAdmin) return;
    if (!actionReason.trim()) { toast.error("Reason is required to kick a user."); return; }
    const { error } = await (supabase as any).rpc("admin_kick_user", { _user_id: user.id, _reason: actionReason.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("User kicked — their active browser will sign out.");
    setActionReason("");
    onClose();
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
    if (error) toast.error(error.message); else { logAudit("add_role", "user", user.id, { role, target_user_email: user.email, target_user_name: user.full_name }); toast.success(`+ ${role}`); onClose(); }
  }
  async function removeRole(role: string) {
    await supabase.from("user_roles").delete().eq("user_id", user.id).eq("role", role as AppRole);
    logAudit("remove_role", "user", user.id, { role, target_user_email: user.email, target_user_name: user.full_name });
    toast.success(`− ${role}`); onClose();
  }

  const wonCount = bets.filter((b: any) => b.status === "won").length;
  const initials = (user.full_name ?? "U").split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
  const userIdShort = String(user.id).replace(/-/g, "").slice(0, 9);
  function copyId() { navigator.clipboard.writeText(user.id); toast.success("User ID copied"); }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 border-0 admin-user-bg admin-user-frame">
        <div className="relative px-6 pt-10 pb-6">
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] voucher-circuit" />
          {/* Avatar with golden glow */}
          <div className="relative mx-auto h-24 w-24 -mt-4">
            <div className="absolute inset-[-10px] rounded-3xl blur-2xl bg-[radial-gradient(circle,oklch(0.82_0.17_90/0.55),transparent_70%)]" />
            <div className="relative h-24 w-24 rounded-3xl border-2 border-primary/70 bg-card grid place-items-center shadow-[0_0_30px_-4px_oklch(0.82_0.17_90/0.7)]">
              {user.avatar_url
                ? <img src={user.avatar_url} alt="" className="h-full w-full rounded-3xl object-cover" />
                : <UserSilhouette />}
            </div>
          </div>

          <div className="mt-3 flex justify-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border ${user.is_banned ? "border-destructive/40 text-destructive bg-destructive/10" : "border-emerald-400/40 text-emerald-300 bg-emerald-500/10"}`}>
              {user.is_banned ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              {user.is_banned ? "Banned" : "Active"}
            </span>
            <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-primary/40 text-primary bg-primary/10">
              <Trophy className="h-3 w-3" />{wonCount} Matches Won
            </span>
          </div>

          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-display tracking-wider admin-user-foil">Manage {user.full_name}</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList className="bg-transparent w-full justify-start gap-4 border-b border-border rounded-none p-0 h-auto">
              {[
                ["profile", "Profile"],
                ["tokens", "Tokens"],
                ["roles", "Roles"],
                ["actions", "Actions"],
                ["history", "History"],
              ].map(([v, l]) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="relative px-1 pb-2 rounded-none bg-transparent text-muted-foreground data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-gradient-gold"
                >{l}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="profile" className="space-y-4 mt-5">
              <FieldLuxe label="Display Name">
                <Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </FieldLuxe>
              <FieldLuxe label="User ID">
                <div className="flex gap-2">
                  <Input readOnly value={userIdShort} className="font-mono" />
                  <Button onClick={copyId} className="btn-luxury shrink-0"><Copy className="h-4 w-4 mr-1" />Copy</Button>
                </div>
              </FieldLuxe>
              <FieldLuxe label="Email / Login">
                <Input value={form.email ?? ""} readOnly className="bg-muted/40" />
              </FieldLuxe>
              <FieldLuxe label="Phone">
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </FieldLuxe>
              <FieldLuxe label="Discord">
                <Input value={form.discord_username ?? ""} onChange={(e) => setForm({ ...form, discord_username: e.target.value })} />
              </FieldLuxe>
              <FieldLuxe label="Country">
                <Input value={form.country ?? ""} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </FieldLuxe>
              <FieldLuxe label="Gang Name">
                <Input value={form.gang_name ?? ""} onChange={(e) => setForm({ ...form, gang_name: e.target.value })} />
              </FieldLuxe>
              <Button className="btn-luxury w-full h-12 text-base font-bold" onClick={saveProfile}>Save Profile</Button>
            </TabsContent>

            <TabsContent value="tokens" className="space-y-4 mt-5">
              <Card className="glass p-4 text-center">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Current Balance</div>
                <div className="text-3xl font-black gradient-gold-text mt-1">{(user.token_balance ?? 0).toLocaleString()}</div>
              </Card>
              <FieldLuxe label="Delta (negative to revoke)">
                <Input type="number" value={tokenDelta || ""} onChange={(e) => setTokenDelta(Number(e.target.value))} />
              </FieldLuxe>
              <FieldLuxe label="Reason (required)">
                <Input value={tokenReason} onChange={(e) => setTokenReason(e.target.value)} />
              </FieldLuxe>
              <Button className="btn-luxury w-full h-11" onClick={applyTokens}>Apply</Button>
            </TabsContent>

            <TabsContent value="roles" className="space-y-4 mt-5">
              <div className="flex flex-wrap gap-2 min-h-[40px]">
                {roles.length === 0 && <div className="text-xs text-muted-foreground">No roles assigned.</div>}
                {roles.map((r) => (
                  <Badge key={r} variant="outline" className="border-primary/40 text-primary bg-primary/10 px-3 py-1">
                    {ROLE_LABELS[r as AppRole]}
                    <button onClick={() => removeRole(r)} className="ml-2 text-destructive hover:scale-110">×</button>
                  </Badge>
                ))}
              </div>
              <FieldLuxe label="Add role">
                <Select onValueChange={(v) => addRole(v as AppRole)}>
                  <SelectTrigger><SelectValue placeholder="Add role…" /></SelectTrigger>
                  <SelectContent>
                    {(["viewer", "shooter", "gang_leader", "registered", "sponsor", "moderator", "admin"] as AppRole[]).map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldLuxe>
            </TabsContent>

            <TabsContent value="actions" className="space-y-4 mt-5">
              <FieldLuxe label="Reason (required for restrictive actions)">
                <Textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} rows={3} />
              </FieldLuxe>
              <div className="grid grid-cols-1 gap-2">
                {isAdmin ? (
                  <Button variant={user.is_banned ? "outline" : "destructive"} className="h-11 justify-start" onClick={() => flagAction("is_banned", !user.is_banned, "ban_reason")}>
                    <Lock className="h-4 w-4 mr-2" />{user.is_banned ? "Unban user" : "Ban user from platform"}
                  </Button>
                ) : (
                  <Button variant="outline" disabled className="h-11 justify-start opacity-60">
                    <Lock className="h-4 w-4 mr-2" />Ban (admin only)
                  </Button>
                )}
                <Button variant={user.is_muted ? "outline" : "destructive"} className="h-11 justify-start" onClick={() => flagAction("is_muted", !user.is_muted, "mute_reason")}>
                  <MessageSquare className="h-4 w-4 mr-2" />{user.is_muted ? "Unmute chat" : "Mute in chat"}
                </Button>
                <Button variant={user.is_restricted ? "outline" : "destructive"} className="h-11 justify-start" onClick={() => flagAction("is_restricted", !user.is_restricted, "restrict_reason")}>
                  <AlertTriangle className="h-4 w-4 mr-2" />{user.is_restricted ? "Allow betting" : "Restrict betting"}
                </Button>
                {isAdmin && (
                  <Button variant="destructive" className="h-11 justify-start" onClick={kickUser}>
                    <LogOut className="h-4 w-4 mr-2" />Kick user session
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-6 mt-5">
              {/* BETS */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Bet history ({bets.length})</div>
                  <div className="text-[10px] text-muted-foreground">Stake → Potential</div>
                </div>
                {bets.length === 0 && <div className="text-xs text-muted-foreground">No bets placed.</div>}
                <div className="space-y-2">
                  {bets.map((b: any) => {
                    const sels = b.bet_selections ?? [];
                    const statusCls = b.status === "won" ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/10"
                      : b.status === "lost" ? "text-destructive border-destructive/40 bg-destructive/10"
                      : b.status === "cashed_out" ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
                      : b.status === "refunded" ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
                      : b.status === "void" ? "text-muted-foreground border-muted-foreground/40 bg-muted/30"
                      : "text-muted-foreground border-border bg-muted/20";
                    return (
                      <div key={b.id} className="glass rounded-lg p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold truncate">{b.tracking_id}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="font-mono text-muted-foreground truncate">{b.booking_code}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusCls}`}>{b.status}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-muted-foreground">
                          <span><Clock className="h-3 w-3 inline mr-1" />{new Date(b.created_at).toLocaleString()}</span>
                          <span className="font-bold text-foreground">{Number(b.stake).toLocaleString()} → <span className="text-primary">{Number(b.potential_payout).toLocaleString()}</span> @ {Number(b.total_odds).toFixed(2)}</span>
                        </div>
                        {b.settled_at && <div className="text-[10px] text-muted-foreground">Settled {new Date(b.settled_at).toLocaleString()}</div>}
                        {b.cashed_out_at && <div className="text-[10px] text-amber-300">Cashed out {new Date(b.cashed_out_at).toLocaleString()} · {Number(b.cashout_amount ?? 0).toLocaleString()}</div>}
                        {sels.length > 0 && (
                          <div className="border-t border-border/50 pt-2 space-y-1">
                            {sels.map((s: any) => (
                              <div key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="truncate"><span className="text-muted-foreground">{s.markets?.name}:</span> <span className="font-bold">{s.selection_label}</span> <span className="text-muted-foreground">on</span> {s.matches?.name}</span>
                                <span className={`shrink-0 font-mono ${s.result === "won" ? "text-emerald-300" : s.result === "lost" ? "text-destructive" : "text-muted-foreground"}`}>{Number(s.locked_odds).toFixed(2)} · {s.result ?? "pending"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* TOKEN TRANSACTIONS */}
              <section>
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Token transactions ({tx.length})</div>
                {tx.length === 0 && <div className="text-xs text-muted-foreground">None.</div>}
                <div className="space-y-2">
                  {tx.map((t: any) => {
                    const m = (t.metadata ?? {}) as Record<string, any>;
                    const isIn = Number(t.amount) > 0;
                    const balBefore = Number(t.balance_after) - Number(t.amount);
                    // Try to associate an admin audit log within ±10s (for grant/revoke)
                    const ts = new Date(t.created_at).getTime();
                    const nearAudit = audits.find((a: any) =>
                      Math.abs(new Date(a.created_at).getTime() - ts) < 10_000 &&
                      /token|grant|revoke|credit|debit|refund|payout/i.test(String(a.action ?? "")),
                    );
                    const actorName = nearAudit?.actor_id ? (actorMap[nearAudit.actor_id] ?? nearAudit.actor_id) : (m.actor_name ?? m.by ?? null);
                    const reason = m.reason ?? nearAudit?.metadata?.reason ?? null;
                    const refId = m.ref ?? m.reference ?? m.bet_id ?? m.match_id ?? m.withdrawal_id ?? m.promo_code ?? null;
                    const fromLabel = m.from ?? m.source ?? (isIn ? prettySource(t.kind, "in") : "User balance");
                    const toLabel = m.to ?? m.destination ?? (isIn ? "User balance" : prettySource(t.kind, "out"));
                    const purpose = m.purpose ?? m.for ?? t.description ?? humanizeKind(t.kind);
                    return (
                      <div
                        key={t.id}
                        className="rounded-xl p-3 text-[11px] space-y-2"
                        style={{
                          background:
                            "linear-gradient(135deg, oklch(0.22 0.05 65 / 0.7), oklch(0.16 0.04 60 / 0.85))",
                          border: "1px solid oklch(0.72 0.13 78 / 0.35)",
                          boxShadow:
                            "inset 0 1px 0 oklch(0.95 0.08 92 / 0.08), 0 6px 18px -8px oklch(0.45 0.14 70 / 0.5)",
                        }}
                      >
                        {/* Header row */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold"
                              style={{
                                background: isIn
                                  ? "oklch(0.32 0.12 158 / 0.4)"
                                  : "oklch(0.32 0.14 25 / 0.4)",
                                color: isIn ? "oklch(0.88 0.22 152)" : "oklch(0.85 0.22 25)",
                                border: `1px solid ${isIn ? "oklch(0.78 0.18 152 / 0.6)" : "oklch(0.78 0.22 25 / 0.6)"}`,
                              }}
                            >
                              {isIn ? "Credit" : "Debit"}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-primary/40 text-primary bg-primary/10">
                              {humanizeKind(t.kind)}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className={`font-bold text-sm ${isIn ? "text-emerald-300" : "text-destructive"}`}>
                              {isIn ? "+" : ""}{Number(t.amount).toLocaleString()}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {balBefore.toLocaleString()} → {Number(t.balance_after).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* Flow row */}
                        <div className="flex items-center gap-2 text-[11px]">
                          <div className="flex-1 min-w-0">
                            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">From</div>
                            <div className="truncate font-medium text-foreground/90">{fromLabel}</div>
                          </div>
                          <span className="text-primary/70">→</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">To</div>
                            <div className="truncate font-medium text-foreground/90">{toLabel}</div>
                          </div>
                        </div>

                        {/* Detail grid */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t border-border/40">
                          <DetailRow label="Purpose" value={purpose} />
                          <DetailRow label="By" value={actorName ?? (t.kind === "daily_login" ? "System (auto)" : t.kind === "bet_settled" || t.kind === "payout" ? "House (auto-settle)" : "System")} />
                          {reason && <DetailRow label="Reason" value={String(reason)} />}
                          {refId && <DetailRow label="Ref" value={<span className="font-mono">{String(refId).slice(0, 18)}</span>} />}
                          <DetailRow label="When" value={new Date(t.created_at).toLocaleString()} />
                          <DetailRow label="Tx ID" value={<span className="font-mono">{String(t.id).slice(0, 8)}</span>} />
                        </div>

                        {/* Raw metadata fallback (extra keys not yet shown) */}
                        {(() => {
                          const shown = new Set(["from", "to", "source", "destination", "reason", "ref", "reference", "bet_id", "match_id", "withdrawal_id", "promo_code", "purpose", "for", "actor_name", "by"]);
                          const extras = Object.entries(m).filter(([k]) => !shown.has(k));
                          if (!extras.length) return null;
                          return (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {extras.map(([k, v]) => (
                                <span key={k} className="px-1.5 py-0.5 rounded bg-background/40 border border-border/40 text-[10px] text-muted-foreground">
                                  <span className="text-foreground/70">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* WITHDRAWALS */}
              <section>
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Withdrawal requests ({withdrawals.length})</div>
                {withdrawals.length === 0 && <div className="text-xs text-muted-foreground">None.</div>}
                <div className="space-y-1">
                  {withdrawals.map((w: any) => (
                    <div key={w.id} className="glass rounded-lg p-2 text-[11px] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{Number(w.amount).toLocaleString()} tokens</span>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase ${w.status === "approved" ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/10" : w.status === "rejected" ? "text-destructive border-destructive/40 bg-destructive/10" : "text-muted-foreground border-border"}`}>{w.status}</span>
                      </div>
                      <div className="text-muted-foreground">To <span className="font-bold text-foreground">{w.ingame_name}</span> ({w.gang_name}){w.ticket_ref && <> · ref <span className="font-mono">{w.ticket_ref}</span></>}</div>
                      <div className="text-muted-foreground flex items-center justify-between flex-wrap gap-1">
                        <span>Requested {new Date(w.created_at).toLocaleString()}</span>
                        {w.reviewed_at && <span>Reviewed {new Date(w.reviewed_at).toLocaleString()} by {actorMap[w.reviewed_by] ?? "—"}</span>}
                      </div>
                      {w.admin_note && <div className="text-muted-foreground italic">"{w.admin_note}"</div>}
                    </div>
                  ))}
                </div>
              </section>

              {/* PROMO REDEMPTIONS */}
              <section>
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Promo redemptions ({redemptions.length})</div>
                {redemptions.length === 0 && <div className="text-xs text-muted-foreground">None.</div>}
                <div className="space-y-1">
                  {redemptions.map((r: any) => (
                    <div key={r.id} className="glass rounded-lg p-2 text-[11px] flex items-center gap-2">
                      <span className="font-mono font-bold flex-1 truncate">{r.promo_codes?.code ?? "—"}</span>
                      <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                      <span className="font-bold text-emerald-300 w-24 text-right">+{Number(r.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ADMIN AUDIT TIMELINE */}
              <section>
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Admin actions on this user ({audits.length})</div>
                {audits.length === 0 && <div className="text-xs text-muted-foreground">No admin actions recorded.</div>}
                <div className="relative pl-4 space-y-3 border-l border-border/60">
                  {audits.map((a: any) => {
                    const meta = a.metadata ?? {};
                    return (
                      <div key={a.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-gradient-gold border-2 border-background" />
                        <div className="text-[11px]">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold capitalize">{String(a.action).replace(/_/g, " ")}</span>
                            <span className="text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />{new Date(a.created_at).toLocaleString()}</span>
                          </div>
                          <div className="text-muted-foreground">By <span className="font-bold text-foreground">{actorMap[a.actor_id] ?? a.actor_id?.slice(0, 8) ?? "system"}</span></div>
                          {Object.keys(meta).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(meta).map(([k, v]) => (
                                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 border border-border/60">
                                  <span className="text-muted-foreground">{k}:</span> <span className="font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter className="px-6 pb-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldLuxe({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

function UserSilhouette() {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12 text-muted-foreground/70" fill="currentColor" aria-hidden>
      <circle cx="32" cy="22" r="11" />
      <path d="M10 56c0-12 10-20 22-20s22 8 22 20v4H10z" />
    </svg>
  );
}

/* ============================ MATCH WIZARD ============================ */
function MatchesPanel() {
  const confirm = useConfirm();
  const [matches, setMatches] = useState<any[]>([]);
  const [wizard, setWizard] = useState(false);

  async function load() {
    const { data } = await supabase.from("matches").select("*, home_team:teams!home_team_id(name,logo_url), away_team:teams!away_team_id(name,logo_url)").eq("is_archived", false).order("start_time", { ascending: false });
    setMatches(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    await supabase.from("matches").update({ status: status as any }).eq("id", id);
    await logAudit(`match_${status}`, "match", id);
    load();
  }
  async function settle(m: any) {
    const ok = await confirm({ title: "End match and settle bets?", description: `Final score will be ${m.home_team?.name} ${m.home_score}–${m.away_score} ${m.away_team?.name}. Suspended/refunded tickets will not be credited.`, confirmText: "Settle match" });
    if (!ok) return;
    const hs = Number(m.home_score ?? 0), as = Number(m.away_score ?? 0);
    let winnerId = null;
    if (hs > as) winnerId = m.home_team_id;
    else if (as > hs) winnerId = m.away_team_id;
    await supabase.from("matches").update({ home_score: hs, away_score: as, status: "ended", winner_team_id: winnerId }).eq("id", m.id);
    await supabase.from("markets").update({ is_open: false }).eq("match_id", m.id);
    await settleBetsForMatch(m.id, winnerId, hs, as);
    await logAudit("match_settled", "match", m.id, { home_score: hs, away_score: as, winner_team_id: winnerId });
    toast.success("Match settled — bets paid out"); load();
  }
  async function deleteMatch(id: string) {
    if (!await confirm({ title: "Remove this match from the panel?", description: "The match will be hidden from the matches list but kept in the database so existing bet vouchers keep showing team and stake info.", tone: "danger", confirmText: "Remove" })) return;
    const { error } = await supabase.from("matches").update({ is_archived: true }).eq("id", id);
    if (error) toast.error(error.message); else { logAudit("match_archived", "match", id); load(); toast.success("Match archived"); }
  }

  async function clearEnded() {
    const endedCount = matches.filter((m) => m.status === "ended").length;
    if (endedCount === 0) { toast.info("No ended matches to clear."); return; }
    if (!await confirm({
      title: `Clear ${endedCount} ended match${endedCount === 1 ? "" : "es"}?`,
      description: "All matches with status 'ended' will be archived from the panel so you can create new ones. User bet vouchers and history stay intact — only the match listing here is cleared.",
      tone: "danger", confirmText: "Clear ended matches",
    })) return;
    const { data: archived, error } = await supabase
      .from("matches").update({ is_archived: true }).eq("is_archived", false).eq("status", "ended").select("id");
    if (error) { toast.error(error.message); return; }
    await logAudit("matches_bulk_archive_ended", "matches", undefined, { count: archived?.length ?? 0, match_ids: (archived ?? []).map((m: any) => m.id) });
    toast.success(`Archived ${archived?.length ?? 0} ended match${archived?.length === 1 ? "" : "es"}`);
    load();
  }

  async function updateLiveScore(m: any, hs: number, as: number) {
    await supabase.from("matches").update({ home_score: hs, away_score: as }).eq("id", m.id);
    await logAudit("match_live_score", "match", m.id, { home_score: hs, away_score: as });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="btn-luxury" onClick={() => setWizard(true)}><Plus className="h-4 w-4 mr-1" />New Match (Wizard)</Button>
        <Button variant="destructive" onClick={clearEnded}>
          <Trash2 className="h-4 w-4 mr-1" />Clear Ended Matches
        </Button>
        <Badge variant="outline" className="ml-auto text-[10px]">Bet history is preserved — only the panel list is cleared.</Badge>
      </div>
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
              <CorrectScoreManagerButton match={m} onSaved={load} />
              {m.status !== "cancelled" && m.status !== "ended" && <Button size="sm" variant="outline" onClick={() => setStatus(m.id, "cancelled")}>Cancel</Button>}
              <Button size="sm" variant="destructive" onClick={() => deleteMatch(m.id)} title="Delete match"><Trash2 className="h-3 w-3" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

async function settleBetsForMatch(matchId: string, winnerTeamId: string | null, homeScore?: number, awayScore?: number) {
  // Get all bet selections for this match
  const { data: sels } = await supabase.from("bet_selections").select("*, markets!market_id(name), odds!odd_id(label)").eq("match_id", matchId);
  if (!sels || sels.length === 0) return;
  // Get team names for label comparison
  const { data: match } = await supabase.from("matches").select("home_team_id, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name), home_score, away_score").eq("id", matchId).single() as any;
  const hs = homeScore ?? Number(match?.home_score ?? 0);
  const as_ = awayScore ?? Number(match?.away_score ?? 0);
  const scoreLabel = `${hs}-${as_}`;
  const winnerLabel = winnerTeamId === null ? "Draw" : (winnerTeamId === match?.home_team_id ? match?.home_team?.name : match?.away_team?.name);
  for (const s of sels) {
    const marketName = (s as any).markets?.name ?? "";
    const oddLabel = (s as any).odds?.label ?? "";
    let result: "won" | "lost";
    if (/correct\s*score/i.test(marketName)) {
      // Normalize: accept "2-1", "2:1", "2 - 1"
      const norm = (v: string) => v.replace(/[^0-9]/g, "-").replace(/-+/g, "-");
      result = norm(oddLabel) === norm(scoreLabel) ? "won" : "lost";
    } else {
      result = oddLabel === winnerLabel ? "won" : "lost";
    }
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
    if (["suspended", "refunded", "void", "cashed_out"].includes(bet.status)) continue;
    if (allWon) {
      const { error: payErr } = await supabase.rpc("settle_pay_winning_bet", { _bet_id: bid });
      if (payErr) {
        toast.error(`Could not credit winnings for ${bet.tracking_id}: ${payErr.message}`);
      }
    } else {
      await supabase.from("bets").update({ status: "lost", settled_at: new Date().toISOString() }).eq("id", bid);
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
  const [csEnabled, setCsEnabled] = useState(true);
  const [csRows, setCsRows] = useState<Array<{ label: string; value: number }>>(
    POPULAR_SCORES.map(([h, a]) => {
      const label = `${h}-${a}`;
      return { label, value: DEFAULT_ODDS_BY_SCORE[label] ?? 15 };
    })
  );
  const [csCustomH, setCsCustomH] = useState(0);
  const [csCustomA, setCsCustomA] = useState(0);
  const [csCustomOdds, setCsCustomOdds] = useState(10);

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
    if (csEnabled && csRows.length > 0) {
      const { data: csMarket } = await supabase.from("markets").insert({ match_id: m.id, name: "Correct Score", is_open: true }).select().single();
      if (csMarket) {
        await supabase.from("odds").insert(csRows.map((r) => ({ market_id: csMarket.id, label: r.label, value: r.value })));
      }
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
          <DialogTitle>Match Wizard — Step {step} of 5</DialogTitle>
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
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" />Correct Score Market</div>
              <label className="flex items-center gap-2 text-xs"><Switch checked={csEnabled} onCheckedChange={setCsEnabled} /> Enable</label>
            </div>
            {csEnabled && (
              <>
                <div className="text-[11px] text-muted-foreground">Pre-filled with popular scorelines. Edit odds, remove, or add custom scores. Users can pick exactly one scoreline per match.</div>
                <Card className="glass p-3 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Add custom score</div>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div><label className="text-[10px] text-muted-foreground">Home</label><Input type="number" min={0} value={csCustomH} onChange={(e) => setCsCustomH(Number(e.target.value))} className="w-16" /></div>
                    <span className="pb-2">-</span>
                    <div><label className="text-[10px] text-muted-foreground">Away</label><Input type="number" min={0} value={csCustomA} onChange={(e) => setCsCustomA(Number(e.target.value))} className="w-16" /></div>
                    <div><label className="text-[10px] text-muted-foreground">Odds</label><Input type="number" step="0.01" min={1.01} value={csCustomOdds} onChange={(e) => setCsCustomOdds(Number(e.target.value))} className="w-20" /></div>
                    <Button size="sm" onClick={() => {
                      const label = `${csCustomH}-${csCustomA}`;
                      if (csRows.some((r) => r.label === label)) { toast.info(`${label} already added`); return; }
                      setCsRows([...csRows, { label, value: csCustomOdds }]);
                    }}><Plus className="h-3 w-3 mr-1" />Add</Button>
                  </div>
                </Card>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {csRows.map((r, i) => (
                    <div key={r.label} className="rounded-lg border border-border bg-background/40 p-2 flex items-center gap-2">
                      <div className="font-mono font-bold text-sm shrink-0 w-12">{r.label}</div>
                      <Input type="number" step="0.01" min={1.01} value={r.value} onChange={(e) => {
                        const v = Number(e.target.value);
                        setCsRows(csRows.map((row, idx) => idx === i ? { ...row, value: v } : row));
                      }} className="h-8 text-xs" />
                      <button className="text-destructive shrink-0" onClick={() => setCsRows(csRows.filter((_, idx) => idx !== i))} title="Remove"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {step === 5 && (
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
          {step < 5 ? (
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
  const confirm = useConfirm();

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
    const res = await confirm({ title: "Deny token request?", description: `Reject ${Number(r.amount).toLocaleString()} tokens for ${profiles[r.user_id]?.full_name ?? "this user"}.`, tone: "danger", confirmText: "Deny request", inputLabel: "Reason", inputPlaceholder: "Explain why this request is denied…" });
    if (!res || typeof res !== "object") return;
    const reason = res.value;
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
  const [draft, setDraft] = useState<{ code: string; amount: number; usage_limit: number; expires_at: string; max_uses: string; target_mode: "all" | "specific"; target_user_ids: string[] }>({ code: "", amount: 100, usage_limit: 1, expires_at: "", max_uses: "", target_mode: "all", target_user_ids: [] });
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [usageOpen, setUsageOpen] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, any[]>>({});

  async function load() {
    const { data } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
    setCodes(data ?? []);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!userQuery.trim()) { setUserResults([]); return; }
    const t = setTimeout(async () => {
      const q = userQuery.trim();
      const { data } = await supabase.from("profiles").select("id,full_name,ingame_name,email")
        .or(`full_name.ilike.%${q}%,ingame_name.ilike.%${q}%,email.ilike.%${q}%`).limit(8);
      setUserResults(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [userQuery]);

  async function loadUsage(promoId: string) {
    const { data } = await supabase.from("promo_code_usage_v2" as any).select("*").eq("promo_id", promoId).order("redeemed_at", { ascending: false });
    setUsage((u) => ({ ...u, [promoId]: data ?? [] }));
  }

  async function create() {
    if (!draft.code || !draft.amount) { toast.error("Code and amount required"); return; }
    const payload: any = {
      code: draft.code.toUpperCase(),
      amount: draft.amount,
      usage_limit: draft.usage_limit,
      expires_at: draft.expires_at ? new Date(draft.expires_at).toISOString() : null,
      max_uses: draft.max_uses ? Number(draft.max_uses) : null,
      target_user_ids: draft.target_mode === "specific" && draft.target_user_ids.length > 0 ? draft.target_user_ids : null,
    };
    const { error } = await supabase.from("promo_codes").insert(payload);
    if (error) toast.error(error.message);
    else {
      setDraft({ code: "", amount: 100, usage_limit: 1, expires_at: "", max_uses: "", target_mode: "all", target_user_ids: [] });
      setUserQuery(""); setUserResults([]);
      load(); toast.success("Promo created"); logAudit("promo_created", "promo");
    }
  }
  async function toggle(id: string, val: boolean) { await supabase.from("promo_codes").update({ is_active: val }).eq("id", id); load(); }

  const targetCount = draft.target_mode === "all" ? "All users" : `${draft.target_user_ids.length} user(s)`;

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
        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Total max redemptions (blank = unlimited)</div>
            <Input type="number" placeholder="e.g. 100" value={draft.max_uses} onChange={(e) => setDraft({ ...draft, max_uses: e.target.value })} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Audience: {targetCount}</div>
            <div className="flex gap-2">
              <Button size="sm" variant={draft.target_mode === "all" ? "default" : "outline"} onClick={() => setDraft({ ...draft, target_mode: "all", target_user_ids: [] })}>All users</Button>
              <Button size="sm" variant={draft.target_mode === "specific" ? "default" : "outline"} onClick={() => setDraft({ ...draft, target_mode: "specific" })}>Specific user(s)</Button>
            </div>
          </div>
        </div>
        {draft.target_mode === "specific" && (
          <div className="space-y-2 rounded-lg border border-border p-2">
            <Input placeholder="Search users by name, in-game name, or email" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
            {userResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {userResults.map((u) => {
                  const picked = draft.target_user_ids.includes(u.id);
                  return (
                    <button key={u.id} type="button" onClick={() => setDraft({ ...draft, target_user_ids: picked ? draft.target_user_ids.filter((x) => x !== u.id) : [...draft.target_user_ids, u.id] })}
                      className={`w-full text-left text-xs px-2 py-1 rounded border ${picked ? "border-primary bg-primary/10" : "border-border"}`}>
                      {u.full_name} <span className="text-muted-foreground">· {u.ingame_name ?? "—"} · {u.email}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {draft.target_user_ids.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {draft.target_user_ids.map((id) => (
                  <Badge key={id} variant="outline" className="cursor-pointer" onClick={() => setDraft({ ...draft, target_user_ids: draft.target_user_ids.filter((x) => x !== id) })}>{id.slice(0, 6)} ×</Badge>
                ))}
              </div>
            )}
          </div>
        )}
        <Button className="btn-luxury" onClick={create}>Create</Button>
      </Card>
      <div className="space-y-2">
        {codes.map((c) => {
          const isOpen = usageOpen === c.id;
          const audienceLabel = c.target_user_ids && c.target_user_ids.length > 0 ? `${c.target_user_ids.length} targeted user(s)` : "All users";
          return (
            <Card key={c.id} className="glass p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-mono font-bold">{c.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.amount} tokens · {c.used_count}/{c.max_uses ?? "∞"} total redemptions · {c.usage_limit ?? 1}/user · {audienceLabel} · {c.expires_at ? `expires ${new Date(c.expires_at).toLocaleString()}` : "no expiry"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => { const next = isOpen ? null : c.id; setUsageOpen(next); if (next) loadUsage(c.id); }}>
                    {isOpen ? "Hide usage" : "View usage"}
                  </Button>
                  <Switch checked={c.is_active} onCheckedChange={(v) => toggle(c.id, v)} />
                  <Badge variant="outline">{c.is_active ? "Active" : "Off"}</Badge>
                </div>
              </div>
              {isOpen && (
                <div className="rounded-lg border border-border bg-background/40 p-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Redemptions ({usage[c.id]?.length ?? 0})</div>
                  {!usage[c.id] && <div className="text-xs text-muted-foreground">Loading…</div>}
                  {usage[c.id]?.length === 0 && <div className="text-xs text-muted-foreground">No redemptions yet.</div>}
                  {(() => {
                    const rows = usage[c.id] ?? [];
                    const byUser: Record<string, { name: string; ingame: string; email: string; count: number; last: string; first: string; total: number }> = {};
                    rows.forEach((r: any) => {
                      const k = r.user_id;
                      if (!byUser[k]) byUser[k] = { name: r.full_name ?? "Unknown", ingame: r.ingame_name ?? "—", email: r.email ?? "", count: 0, last: r.redeemed_at, first: r.redeemed_at, total: 0 };
                      byUser[k].count++;
                      byUser[k].total += Number(r.redeemed_amount) || 0;
                      if (r.redeemed_at > byUser[k].last) byUser[k].last = r.redeemed_at;
                      if (r.redeemed_at < byUser[k].first) byUser[k].first = r.redeemed_at;
                    });
                    const list = Object.values(byUser);
                    return (
                      <div className="space-y-2">
                        <div className="text-[11px] text-muted-foreground">{list.length} unique member(s) · {rows.length} total redemptions</div>
                        {list.map((u, i) => (
                          <div key={i} className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 pb-1 last:border-0">
                            <span className="font-bold">{u.name}</span>
                            <span className="text-muted-foreground">In-game: <span className="text-foreground">{u.ingame}</span></span>
                            <span className="text-muted-foreground">Used: <span className="text-primary font-bold">{u.count}×</span></span>
                            <span className="text-muted-foreground">+{u.total.toLocaleString()} tokens</span>
                            <span className="text-muted-foreground">Last: {new Date(u.last).toLocaleString()}</span>
                          </div>
                        ))}
                        <details className="text-[10px] text-muted-foreground">
                          <summary className="cursor-pointer">All timestamps</summary>
                          <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                            {rows.map((r: any) => (
                              <div key={r.redemption_id}>{new Date(r.redeemed_at).toLocaleString()} — {r.full_name ?? r.user_id} ({r.ingame_name ?? "—"})</div>
                            ))}
                          </div>
                        </details>
                      </div>
                    );
                  })()}
                </div>
              )}
            </Card>
          );
        })}
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
  const [active, setActive] = useState<any | null>(null);
  const confirm = useConfirm();
  async function load() {
    const { data } = await supabase.from("support_tickets").select("*, profiles!user_id(full_name,email)").order("created_at", { ascending: false }).limit(200);
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
      <Card className="glass-strong p-4 flex items-center gap-3">
        <Ticket className="h-5 w-5 text-primary" />
        <div><div className="font-bold">Support Ticket Reports</div><div className="text-xs text-muted-foreground">Open, reply, attach images, close/reopen, or delete user reports directly.</div></div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={load}><RotateCw className="h-3 w-3 mr-1" />Refresh</Button>
      </Card>
      {tickets.length === 0 && <p className="text-muted-foreground text-sm">No tickets.</p>}
      {tickets.map((t) => (
        <Card key={t.id} className="glass p-3 flex items-center gap-3 flex-wrap hover:border-primary/50 transition">
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{t.subject}</div>
            <div className="text-xs text-muted-foreground">{t.profiles?.full_name} · {new Date(t.created_at).toLocaleString()}</div>
          </div>
          <Badge variant="outline" className="capitalize">{t.status}</Badge>
          <Select value={t.status} onValueChange={(v) => setStatus(t.id, v)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{["open", "in_progress", "resolved", "closed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setActive(t)}><Eye className="h-3 w-3 mr-1" />Reply</Button>
          <Button size="sm" variant="destructive" onClick={() => del(t.id)}><Trash2 className="h-3 w-3" /></Button>
        </Card>
      ))}
      {active && <AdminTicketDialog ticket={active} onClose={() => { setActive(null); load(); }} />}
    </div>
  );
}

function AdminTicketDialog({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  async function load() {
    const { data } = await supabase.from("ticket_messages").select("*, profiles!user_id(full_name,email)").eq("ticket_id", ticket.id).order("created_at", { ascending: true });
    setMsgs(data ?? []);
  }
  useEffect(() => {
    load();
    const ch = supabase.channel(`admin-ticket-${ticket.id}`).on("postgres_changes", { event: "*", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticket.id]);
  async function send(imageUrl?: string) {
    if (!user || (!text.trim() && !imageUrl)) return;
    setSending(true);
    const content = text.trim(); setText("");
    const { error } = await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, user_id: user.id, content: content || null, image_url: imageUrl ?? null });
    if (error) toast.error(error.message); else await supabase.from("support_tickets").update({ status: "in_progress" as any, updated_at: new Date().toISOString() }).eq("id", ticket.id);
    setSending(false); load();
  }
  async function upload(file: File) {
    const path = `${ticket.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("ticket-uploads").upload(path, file);
    if (error) { toast.error(error.message); return; }
    await send(supabase.storage.from("ticket-uploads").getPublicUrl(path).data.publicUrl);
  }
  async function updateStatus(status: string) { await supabase.from("support_tickets").update({ status: status as any }).eq("id", ticket.id); toast.success("Ticket updated"); onClose(); }
  async function deleteTicket() {
    if (!await confirm({ title: "Delete this support ticket?", description: "All replies and uploaded references on this report will be removed.", tone: "danger", confirmText: "Delete forever" })) return;
    await supabase.from("ticket_messages").delete().eq("ticket_id", ticket.id);
    await supabase.from("support_tickets").delete().eq("id", ticket.id);
    toast.success("Ticket deleted"); onClose();
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-strong max-w-3xl max-h-[88vh] overflow-hidden border-primary/30 p-0">
        <DialogHeader className="p-5 border-b border-border">
          <DialogTitle className="flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" />{ticket.subject}</DialogTitle>
          <div className="text-xs text-muted-foreground">{ticket.profiles?.full_name} · {ticket.profiles?.email}</div>
        </DialogHeader>
        <div className="max-h-[52vh] overflow-y-auto p-5 space-y-3">
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.user_id === user?.id ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] rounded-xl p-3 text-sm border ${m.user_id === user?.id ? "bg-primary/15 border-primary/35" : "bg-secondary/60 border-border"}`}>
                <div className="text-[10px] text-muted-foreground mb-1">{m.profiles?.full_name ?? (m.is_ai ? "AI Assistant" : "User")} · {new Date(m.created_at).toLocaleString()}</div>
                {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                {m.image_url && <a href={m.image_url} target="_blank" rel="noreferrer"><img src={m.image_url} alt="Ticket upload" className="mt-2 max-h-52 rounded-lg border border-border" /></a>}
              </div>
            </div>
          ))}
        </div>
        <div className="p-5 border-t border-border space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to this user report…" />
          <div className="flex gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><ImageIcon className="h-4 w-4 mr-1" />Image</Button>
            <Button className="btn-luxury" disabled={sending || !text.trim()} onClick={() => send()}><Send className="h-4 w-4 mr-1" />Reply</Button>
            <Button variant="outline" onClick={() => updateStatus(ticket.status === "closed" ? "open" : "closed")}>{ticket.status === "closed" ? "Reopen" : "Close"}</Button>
            <Button variant="destructive" onClick={deleteTicket}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ APPEALS ============================ */
function AppealsPanel() {
  const [list, setList] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const confirm = useConfirm();
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
    const res = await confirm({ title: status === "approved" ? "Approve appeal and unban?" : "Deny appeal?", description: "Write the response the user will see.", tone: status === "denied" ? "danger" : "default", confirmText: status === "approved" ? "Approve" : "Deny", inputLabel: "Admin response", inputPlaceholder: "Response to user…" });
    if (!res || typeof res !== "object") return;
    const note = res.value;
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
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  useEffect(() => {
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500).then(async ({ data }) => {
      setLogs(data ?? []);
      const ids = new Set<string>();
      (data ?? []).forEach((x: any) => {
        if (x.actor_id) ids.add(x.actor_id);
        const tu = x.metadata?.target_user_id;
        if (tu) ids.add(tu);
        if (x.target_type === "user" && x.target_id) ids.add(x.target_id);
      });
      if (ids.size) {
        const { data: p } = await supabase.from("profiles").select("id,full_name,email").in("id", Array.from(ids));
        const m: Record<string, any> = {};
        (p ?? []).forEach((x: any) => { m[x.id] = x; });
        setProfiles(m);
      }
    });
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter !== "all" && !l.action.startsWith(actionFilter)) return false;
      if (!q) return true;
      const actor = profiles[l.actor_id]?.full_name ?? "";
      const targetUserId = l.metadata?.target_user_id ?? (l.target_type === "user" ? l.target_id : null);
      const target = targetUserId ? (profiles[targetUserId]?.full_name ?? "") : "";
      const hay = `${l.action} ${l.target_type} ${l.target_id ?? ""} ${actor} ${target} ${JSON.stringify(l.metadata ?? {})}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [logs, q, actionFilter, profiles]);

  const actionPrefixes = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.action.split("_")[0]));
    return Array.from(set).sort();
  }, [logs]);

  return (
    <div className="space-y-3">
      <Card className="glass-strong p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Filter className="h-3 w-3" />Filter</div>
        <Input placeholder="Search action, user, target, metadata…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64 h-9" />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionPrefixes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-auto">{filtered.length} of {logs.length}</Badge>
      </Card>

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No audit entries match.</p>}
      <div className="space-y-2">
        {filtered.map((l) => {
          const actor = profiles[l.actor_id];
          const meta = l.metadata ?? {};
          const targetUserId = meta.target_user_id ?? (l.target_type === "user" ? l.target_id : null);
          const targetUser = targetUserId ? profiles[targetUserId] : null;
          const ts = new Date(l.created_at);
          const action = humanize(l.action);
          const tone = /(ban|revoke|deny|delete|wipe|restrict|mute)/i.test(l.action) ? "destructive"
                     : /(grant|approve|credit|create|add|won)/i.test(l.action) ? "emerald"
                     : "primary";
          const toneCls = tone === "destructive" ? "border-destructive/40 bg-destructive/5"
                        : tone === "emerald" ? "border-emerald-400/30 bg-emerald-500/5"
                        : "border-primary/30 bg-primary/5";
          const dotCls = tone === "destructive" ? "bg-destructive" : tone === "emerald" ? "bg-emerald-400" : "bg-primary";
          // Strip enrichment keys from "extra" rendering
          const standardKeys = new Set(["actor_email", "user_agent", "route", "origin", "locale", "timezone", "timestamp_iso", "target_user_id"]);
          const extras = Object.entries(meta).filter(([k]) => !standardKeys.has(k));
          return (
            <Card key={l.id} className={`glass p-4 border ${toneCls}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${dotCls} shadow-[0_0_10px_currentColor]`} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold text-primary">{actor?.full_name ?? "System"}</span>
                    <span className="text-muted-foreground">{action}</span>
                    <span className="text-muted-foreground">on</span>
                    <Badge variant="outline" className="capitalize">{l.target_type ?? "—"}</Badge>
                    {targetUser && (
                      <>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-bold text-emerald-300">{targetUser.full_name}</span>
                      </>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {actor?.email && <Detail icon={Users} label="By"><span className="font-mono">{actor.email}</span></Detail>}
                    {targetUser?.email && <Detail icon={Users} label="To"><span className="font-mono">{targetUser.email}</span></Detail>}
                    {l.target_id && l.target_type !== "user" && <Detail icon={Tag} label="Target ID"><span className="font-mono break-all">{l.target_id}</span></Detail>}
                    {meta.route && <Detail icon={MapPin} label="From route"><span className="font-mono">{meta.route}</span></Detail>}
                    {meta.origin && <Detail icon={Globe} label="Origin"><span className="font-mono">{meta.origin}</span></Detail>}
                    {meta.user_agent && <Detail icon={Smartphone} label="Device"><span className="font-mono truncate inline-block max-w-[260px] align-bottom">{summariseUA(meta.user_agent)}</span></Detail>}
                    <Detail icon={Clock} label="When"><span title={ts.toISOString()}>{ts.toLocaleString()} <span className="text-muted-foreground">({timeAgo(ts)})</span></span></Detail>
                    {meta.timezone && <Detail icon={Globe} label="Timezone">{meta.timezone}</Detail>}
                  </div>
                  {extras.length > 0 && (
                    <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Action details</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {extras.map(([k, v]) => (
                          <div key={k}>
                            <span className="text-muted-foreground">{humanize(k)}:</span>{" "}
                            <span className="font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
function summariseUA(ua: string) {
  const m = ua.match(/(Chrome|Firefox|Safari|Edge|OPR|Edg)\/[\d.]+/);
  const os = ua.match(/(Windows|Mac OS X|Android|iPhone|Linux|iPad)[^;)]*/);
  return [m?.[0], os?.[0]].filter(Boolean).join(" · ") || ua.slice(0, 60);
}
function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
function Detail({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate">{children}</span>
    </div>
  );
}
function humanize(action: string) { return action.replace(/_/g, " "); }

function humanizeKind(kind: string) {
  const map: Record<string, string> = {
    balance_change: "Balance change",
    daily_login: "Daily login",
    bet_placed: "Bet placed",
    bet_settled: "Bet settled",
    bet_refund: "Bet refund",
    payout: "Payout",
    promo_redemption: "Promo redemption",
    withdrawal: "Withdrawal",
    withdrawal_refund: "Withdrawal refund",
    grant: "Admin grant",
    revoke: "Admin revoke",
    referral_bonus: "Referral bonus",
    streak_bonus: "Streak bonus",
    task_reward: "Task reward",
    challenge_reward: "Challenge reward",
  };
  return map[kind] ?? kind.replace(/_/g, " ");
}

function prettySource(kind: string, dir: "in" | "out") {
  const k = kind.toLowerCase();
  if (k.includes("daily")) return dir === "in" ? "Daily login system" : "User";
  if (k.includes("payout") || k.includes("settled")) return dir === "in" ? "House wallet (winnings)" : "User";
  if (k.includes("bet_placed") || k === "bet") return dir === "in" ? "House wallet" : "Bet stake (house wallet)";
  if (k.includes("refund")) return dir === "in" ? "House wallet (refund)" : "User";
  if (k.includes("promo")) return dir === "in" ? "Promo code redemption" : "User";
  if (k.includes("withdrawal")) return dir === "in" ? "User" : "Withdrawal request";
  if (k.includes("grant") || k === "balance_change") return dir === "in" ? "Admin grant" : "Admin revoke";
  if (k.includes("referral")) return "Referral program";
  if (k.includes("streak")) return "Streak reward system";
  if (k.includes("task") || k.includes("challenge")) return "Rewards system";
  return dir === "in" ? "System" : "User";
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground shrink-0">{label}</span>
      <span className="truncate text-foreground/90">{value}</span>
    </div>
  );
}

/* ============================ ANALYTICS ============================ */
function AnalyticsPanel() {
  const nav = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [activity, setActivity] = useState<any[]>([]);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [event, setEvent] = useState<any>(null);
  const [highlights, setHighlights] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [u, b, t, r, m, tr, wr, pr, ap, ti, br, ev] = await Promise.all([
        supabase.from("profiles").select("created_at, token_balance, is_banned"),
        supabase.from("bets").select("status, stake, potential_payout, created_at"),
        supabase.from("token_transactions").select("amount, kind, created_at"),
        supabase.from("token_requests").select("status, amount"),
        supabase.from("matches").select("id,name,status,created_at").in("status", ["live", "scheduled"]).limit(5),
        supabase.from("token_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("promo_code_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("ban_appeals").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "closed"),
        supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(3),
        supabase.from("events").select("*").eq("is_active", true).order("starts_at", { ascending: true }).limit(1).maybeSingle(),
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
      setCounts({
        gangWars: m.data?.length ?? 0,
        pendingTokens: tr.count ?? 0,
        pendingWithdrawals: wr.count ?? 0,
        pendingPromos: pr.count ?? 0,
        pendingAppeals: ap.count ?? 0,
        openTickets: ti.count ?? 0,
        bookedTickets: bets.length,
        pendingTotal: (tr.count ?? 0) + (wr.count ?? 0) + (pr.count ?? 0),
      });
      setLiveMatches(m.data ?? []);
      setBroadcasts(br.data ?? []);
      setEvent(ev.data ?? null);

      const days: Record<string, { day: string; bets: number; staked: number; users: number }> = {};
      const today = new Date(); today.setHours(0,0,0,0);
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(5, 10);
        days[d.toISOString().slice(0,10)] = { day: key, bets: 0, staked: 0, users: 0 };
      }
      bets.forEach((x: any) => {
        const k = (x.created_at ?? "").slice(0, 10);
        if (days[k]) { days[k].bets += 1; days[k].staked += Number(x.stake ?? 0); }
      });
      users.forEach((x: any) => {
        const k = (x.created_at ?? "").slice(0, 10);
        if (days[k]) days[k].users += 1;
      });
      setSeries(Object.values(days));

      const { data: aud } = await supabase.from("audit_logs").select("action,target_type,created_at,metadata").order("created_at", { ascending: false }).limit(6);
      setActivity(aud ?? []);
      const { data: hl } = await supabase.from("highlights").select("id,title,media_url,media_type,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(4);
      setHighlights(hl ?? []);
    })();
  }, []);

  if (!stats) return <div className="text-sm text-muted-foreground">Loading analytics…</div>;

  const fmt = (n: number) => n.toLocaleString();
  const short = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  };

  const goTab = (t: string) => setActiveTabFromAnalytics(nav, t);
  const row1 = [
    { icon: Users, value: stats.totalUsers, title: "USERS", sub: "TOTAL USERS", tone: "gold", onClick: () => goTab("users") },
    { icon: Trophy, value: counts.gangWars ?? 0, title: "GANG WARS", sub: "LIVE & UPCOMING", tone: "gold", onClick: () => goTab("matches") },
    { icon: AlertTriangle, value: counts.pendingTotal ?? 0, title: "PENDING REQUESTS", sub: "AWAITING ACTION", tone: "amber", onClick: () => goTab("tokens") },
    { icon: Coins, value: short(stats.circulating), title: "TOTAL VOLUME", sub: "IN CIRCULATION", tone: "gold-lg" },
    { icon: Calendar, value: counts.openTickets ?? 0, title: "OPEN REPORTS", sub: "REPORTED ITEMS", tone: "gold", onClick: () => goTab("tickets") },
  ];
  const row2 = [
    { icon: Ticket, value: counts.bookedTickets ?? 0, title: "TICKETS BOOKED", sub: "TOTAL BOOKED", onClick: () => goTab("bettracker") },
    { icon: Coins, value: counts.pendingTokens ?? 0, title: "TOKEN REQUESTS", sub: "REQUESTED TOKENS", onClick: () => goTab("tokens") },
    { icon: Wallet, value: counts.pendingWithdrawals ?? 0, title: "WITHDRAWALS", sub: "PENDING PAYOUTS", onClick: () => goTab("withdrawals") },
    { icon: Tag, value: counts.pendingPromos ?? 0, title: "PROMO REQUESTS", sub: "PENDING PROMOS", onClick: () => goTab("promoreqs") },
    { icon: AlertTriangle, value: counts.pendingAppeals ?? 0, title: "BAN APPEALS", sub: "PENDING APPEALS", onClick: () => goTab("appeals") },
  ];
  const row4 = [
    { icon: Users, value: stats.totalUsers, title: "TOTAL USERS", onClick: () => goTab("users") },
    { icon: Shield, value: stats.bannedUsers, title: "BANNED USERS", onClick: () => goTab("bannedusers") },
    { icon: Coins, value: short(stats.circulating), title: "TOKENS CIRCULATING", onClick: () => goTab("pnl") },
    { icon: Ticket, value: stats.totalBets, title: "TOTAL BETS", onClick: () => goTab("bettracker") },
    { icon: Trophy, value: stats.wonBets, title: "WON BETS", onClick: () => goTab("wonbets") },
  ];
  const row5 = [
    { icon: X, value: stats.lostBets, title: "LOST BETS", onClick: () => goTab("lostbets") },
    { icon: Eye, value: stats.openBets, title: "OPEN BETS", onClick: () => goTab("bettracker") },
    { icon: Coins, value: short(stats.totalStaked), title: "TOTAL STAKED", onClick: () => goTab("pnl") },
    { icon: Wallet, value: short(stats.totalPaid), title: "TOTAL PAID OUT", onClick: () => goTab("pnl") },
    { icon: BarChart3, value: short(stats.houseEdge), title: "NET (HOUSE)", onClick: () => goTab("pnl") },
  ];
  const row6 = [
    { icon: Check, value: short(stats.approvedRequests), title: "TOKENS APPROVED", onClick: () => goTab("tokens") },
    { icon: Coins, value: short(stats.credits), title: "TOKEN CREDITS", onClick: () => goTab("tokenmovement") },
    { icon: Coins, value: short(stats.debits), title: "TOKEN DEBITS", onClick: () => goTab("tokenmovement") },
  ];

  const ts = (ts: string) => {
    const diff = (Date.now() - +new Date(ts)) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  return (
    <div className="space-y-3">
      {/* ROW 1 — 5 metric squares */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {row1.map((x) => <MetricSquare key={x.title} {...x} />)}
      </div>

      {/* ROW 2 — 5 metric squares */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {row2.map((x) => <MetricSquare key={x.title} {...x} />)}
      </div>

      {/* ROW 3 — 2 charts side-by-side */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card className="glass p-2 sm:p-4 border-primary/20 bg-card/60">
          <div className="text-[9px] sm:text-xs font-bold tracking-widest text-primary mb-1">VOLUME OVER TIME <span className="text-muted-foreground font-normal">(LAST 14 DAYS)</span></div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={series} margin={{ top: 5, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gStake" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(45 96% 56%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(45 96% 56%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(45 30% 20%)" />
              <XAxis dataKey="day" stroke="hsl(45 50% 60%)" fontSize={8} />
              <YAxis stroke="hsl(45 50% 60%)" fontSize={8} tickFormatter={short} />
              <RTooltip contentStyle={{ background: "hsl(45 20% 8%)", border: "1px solid hsl(45 60% 40%)", borderRadius: 8, fontSize: 11 }} />
              <Area type="monotone" dataKey="staked" stroke="hsl(45 96% 56%)" fill="url(#gStake)" strokeWidth={2} dot={{ r: 2, fill: "hsl(45 96% 56%)" }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="glass p-2 sm:p-4 border-primary/20 bg-card/60">
          <div className="text-[9px] sm:text-xs font-bold tracking-widest text-primary mb-1">NEW USERS PER DAY</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={series} margin={{ top: 5, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(45 30% 20%)" />
              <XAxis dataKey="day" stroke="hsl(45 50% 60%)" fontSize={8} />
              <YAxis stroke="hsl(45 50% 60%)" fontSize={8} />
              <RTooltip contentStyle={{ background: "hsl(45 20% 8%)", border: "1px solid hsl(45 60% 40%)", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="users" fill="hsl(45 96% 56%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ROW 4 — 5 metric squares */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {row4.map((x) => <MetricSquare key={x.title} {...x} compact />)}
      </div>

      {/* ROW 5 — 5 metric squares */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {row5.map((x) => <MetricSquare key={x.title} {...x} compact />)}
      </div>

      {/* ROW 6 — 3 wider squares + image cell */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {row6.map((x) => <MetricSquare key={x.title} {...x} compact />)}
        <Card className="overflow-hidden border-primary/20 bg-card/60 relative min-h-[80px]">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(45_30%_15%),hsl(0_50%_15%))] opacity-80" />
          <div className="absolute inset-0 grid place-items-center text-[10px] uppercase tracking-widest text-primary/80 font-bold">League</div>
        </Card>
      </div>

      {/* ROW 7 — Recent Activity | Live Gang Wars | Highlights Hub */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <PanelBlock title="RECENT ACTIVITY" onView={() => setActiveTabFromAnalytics(nav, "activity")}>
          {activity.length === 0 && <div className="text-[10px] text-muted-foreground">No activity yet</div>}
          {activity.map((a, i) => (
            <button key={i} onClick={() => setActiveTabFromAnalytics(nav, "audit")} className="w-full text-left flex items-start gap-1.5 text-[9px] sm:text-xs py-1 border-b border-primary/10 last:border-0 hover:bg-primary/5 rounded transition">
              <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate">{a.action?.replace(/_/g, " ")}</div>
                <div className="text-muted-foreground text-[8px] sm:text-[10px]">{ts(a.created_at)}</div>
              </div>
            </button>
          ))}
        </PanelBlock>
        <PanelBlock title="LIVE GANG WARS" onView={() => nav({ to: "/matches" })}>
          {liveMatches.length === 0 && <div className="text-[10px] text-muted-foreground">No live wars</div>}
          {liveMatches.map((m) => (
            <button key={m.id} onClick={() => nav({ to: "/matches/$matchId", params: { matchId: m.id } })} className="w-full flex items-center justify-between text-[9px] sm:text-xs py-1 border-b border-primary/10 last:border-0 hover:bg-primary/5 rounded px-1 transition">
              <span className="truncate text-foreground text-left">{m.name}</span>
              <Badge variant="outline" className="text-[8px] border-primary/40 text-primary px-1 py-0">{m.status}</Badge>
            </button>
          ))}
        </PanelBlock>
        <PanelBlock title="HIGHLIGHTS HUB" onView={() => setActiveTabFromAnalytics(nav, "content")}>
          {highlights.length === 0 && <div className="text-[10px] text-muted-foreground">No highlights yet</div>}
          {highlights.map((h) => (
            <button key={h.id} onClick={() => setActiveTabFromAnalytics(nav, "content")} className="w-full flex items-center gap-1.5 text-[9px] sm:text-xs py-1 border-b border-primary/10 last:border-0 hover:bg-primary/5 rounded px-1 transition">
              {h.media_type === "video" ? <Play className="h-3 w-3 text-primary shrink-0" /> : <ImageIcon className="h-3 w-3 text-primary shrink-0" />}
              <div className="min-w-0 flex-1 truncate text-left">{h.title}</div>
            </button>
          ))}
        </PanelBlock>
      </div>

      {/* ROW 8 — Event Countdown | Broadcast Center | Quick Actions */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <PanelBlock title="EVENT COUNTDOWN" onView={() => setActiveTabFromAnalytics(nav, "events")}>
          {event ? (
            <button onClick={() => setActiveTabFromAnalytics(nav, "events")} className="w-full text-left hover:bg-primary/5 rounded p-1 transition space-y-1">
              <div className="text-[9px] sm:text-xs font-bold text-primary truncate">{event.title}</div>
              <div className="text-[10px] sm:text-sm font-mono text-amber-300"><Countdown target={event.ends_at ?? event.starts_at} /></div>
              <div className="text-[7px] sm:text-[9px] text-muted-foreground">{new Date(event.starts_at ?? event.ends_at).toLocaleString()}</div>
            </button>
          ) : (
            <div className="text-[10px] text-muted-foreground">No active event</div>
          )}
        </PanelBlock>
        <PanelBlock title="BROADCAST CENTER" onView={() => setActiveTabFromAnalytics(nav, "broadcast")}>
          {broadcasts.length === 0 && <div className="text-[10px] text-muted-foreground">No broadcasts</div>}
          {broadcasts.map((b) => (
            <button key={b.id} onClick={() => setActiveTabFromAnalytics(nav, "broadcast")} className="w-full text-left text-[9px] sm:text-xs py-1 border-b border-primary/10 last:border-0 hover:bg-primary/5 rounded px-1 transition">
              <div className="flex items-center gap-1"><Megaphone className="h-2.5 w-2.5 text-primary shrink-0" /><div className="truncate text-foreground font-semibold">{b.title || "Broadcast"}</div></div>
              {b.body && <div className="text-[8px] sm:text-[10px] text-muted-foreground truncate pl-3.5">{b.body}</div>}
              <div className="text-[7px] sm:text-[9px] text-muted-foreground pl-3.5">{ts(b.created_at)}</div>
            </button>
          ))}
        </PanelBlock>
        <PanelBlock title="QUICK ACTIONS">
          <div className="max-h-[260px] sm:max-h-[320px] overflow-y-auto pr-1 -mr-1">
            <div className="grid grid-cols-3 gap-1">
              {[
                { i: BarChart3, l: "Analytics", t: "analytics" },
                { i: Users, l: "Users", t: "users" },
                { i: Shield, l: "Banned", t: "bannedusers" },
                { i: Sparkles, l: "Admin AI", t: "adminai" },
                { i: AlertTriangle, l: "Appeals", t: "appeals" },
                { i: History, l: "Audit", t: "audit" },
                { i: ClipboardList, l: "Bet Tracker", t: "bettracker" },
                { i: Send, l: "Broadcast", t: "broadcast" },
                { i: Sparkles, l: "Challenges", t: "challenges" },
                { i: MessageSquare, l: "Chat", t: "chat" },
                { i: Megaphone, l: "Content", t: "content" },
                { i: Trophy, l: "Emblems", t: "emblems" },
                { i: Calendar, l: "Events", t: "events" },
                { i: Wallet, l: "House Wallet", t: "housewallet" },
                { i: ListOrdered, l: "Leaderboard", t: "leaderboard" },
                { i: Trophy, l: "Matches", t: "matches" },
                { i: Send, l: "Notify", t: "notify" },
                { i: BarChart3, l: "P&L", t: "pnl" },
                { i: Tag, l: "Promo Codes", t: "promos" },
                { i: Tag, l: "Promo Reqs", t: "promoreqs" },
                { i: Users, l: "Referrals", t: "referrals" },
                { i: BarChart3, l: "Reports", t: "reports" },
                { i: AlertTriangle, l: "Risk", t: "risk" },
                { i: Trophy, l: "Seasons", t: "seasons" },
                { i: SettingsIcon, l: "Settings", t: "settings" },
                { i: Sparkles, l: "Spotlights", t: "spotlights" },
                { i: Sparkles, l: "Streak/Push", t: "streakpush" },
                { i: ClipboardList, l: "Tasks", t: "tasks" },
                { i: Ticket, l: "Tickets", t: "tickets" },
                { i: Coins, l: "Tokens", t: "tokens" },
                { i: Coins, l: "Token Rules", t: "tokenrules" },
                { i: Coins, l: "Token Move", t: "tokenmovement" },
                { i: Users, l: "Activity", t: "activity" },
                { i: Dice5, l: "Virtual", t: "virtual" },
                { i: Trophy, l: "VIP", t: "vip" },
                { i: Wallet, l: "Withdrawals", t: "withdrawals" },
                { i: Trophy, l: "Won Bets", t: "wonbets" },
                { i: X, l: "Lost Bets", t: "lostbets" },
              ].map((q) => (
                <button key={q.l} onClick={() => setActiveTabFromAnalytics(nav, q.t)} className="flex flex-col items-center gap-0.5 p-1 rounded border border-primary/20 hover:border-primary/50 hover:bg-primary/10 active:scale-95 transition">
                  <q.i className="h-3 w-3 text-primary" />
                  <span className="text-[7px] sm:text-[9px] text-foreground text-center leading-tight">{q.l}</span>
                </button>
              ))}
            </div>
          </div>
        </PanelBlock>
      </div>

      {/* ROW 9 — 5 module tiles */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {[
          { l: "VIRTUAL", s: "Manage virtual matches and rounds", t: "virtual", img: tileVirtual },
          { l: "VIP PROGRAM", s: "Manage VIP tiers and rewards", t: "vip", img: tileVip },
          { l: "CHALLENGES", s: "Create and manage gang challenges", t: "challenges", img: tileChallenges },
          { l: "REFERRALS", s: "Manage referrals and commissions", t: "referrals", img: tileReferrals },
          { l: "HOUSE WALLET", s: "Manage platform funds", t: "housewallet", img: tileHousewallet },
        ].map((m) => (
          <Card key={m.l} className="border-primary/20 bg-card/60 p-2 sm:p-3 flex flex-col">
            <button type="button" onClick={() => setActiveTabFromAnalytics(nav, m.t)} className="aspect-square w-full mb-1 rounded overflow-hidden border border-primary/20 hover:border-primary/60 transition active:scale-95">
              <img src={m.img} alt={m.l} loading="lazy" width={512} height={512} className="w-full h-full object-cover" />
            </button>
            <div className="text-[8px] sm:text-[10px] font-bold text-primary leading-tight">{m.l}</div>
            <div className="text-[6px] sm:text-[8px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{m.s}</div>
            <Button size="sm" variant="outline" className="mt-1 h-5 sm:h-6 text-[7px] sm:text-[9px] border-primary/40 text-primary px-1" onClick={() => setActiveTabFromAnalytics(nav, m.t)}>Manage</Button>
          </Card>
        ))}
      </div>

      {/* ROW 10 — System Status */}
      <Card className="border-primary/20 bg-card/60 p-3">
        <div className="text-[10px] sm:text-xs font-bold tracking-widest text-primary mb-2">SYSTEM STATUS <span className="text-muted-foreground font-normal">(COMING SOON)</span></div>
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {["Platform", "Database", "Payments", "Broadcast", "AI Engine"].map((s) => (
            <div key={s} className="flex items-center justify-between gap-1 text-[8px] sm:text-[10px] px-1.5 py-1 rounded bg-background/40 border border-primary/10">
              <span className="text-foreground truncate">{s}</span>
              <span className="text-emerald-400 font-bold">●</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function setActiveTabFromAnalytics(_nav: any, _tab: string) {
  // Dispatch a custom event the parent listens to, or fallback: store and reload
  const ev = new CustomEvent("admin:set-tab", { detail: _tab });
  window.dispatchEvent(ev);
}

function MetricSquare({ icon: Icon, value, title, sub, tone, compact, onClick }: { icon: any; value: any; title: string; sub?: string; tone?: string; compact?: boolean; onClick?: () => void }) {
  const valueClass = tone === "gold-lg"
    ? "text-[10px] sm:text-base font-black text-primary leading-tight"
    : tone === "amber"
    ? "text-base sm:text-xl font-black text-amber-400 leading-none"
    : compact
    ? "text-xs sm:text-lg font-black text-primary leading-none"
    : "text-base sm:text-2xl font-black text-primary leading-none";
  const content = (
    <>
      <Icon className="h-2.5 w-2.5 sm:h-4 sm:w-4 text-primary/70 mb-0.5" />
      <div className={valueClass}>{value}</div>
      <div className="mt-0.5">
        <div className="text-[6px] sm:text-[9px] uppercase tracking-wider text-muted-foreground leading-tight font-semibold">{title}</div>
        {sub && <div className="text-[5px] sm:text-[8px] uppercase tracking-wider text-muted-foreground/70 leading-tight">{sub}</div>}
      </div>
    </>
  );
  const baseCls = "border-primary/20 bg-card/60 p-1.5 sm:p-3 flex flex-col justify-between min-h-[68px] sm:min-h-[100px] hover:border-primary/50 hover:bg-primary/10 active:scale-95 transition cursor-pointer text-left w-full";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`rounded-xl border shadow ${baseCls}`}>
        {content}
      </button>
    );
  }
  return (
    <Card className={baseCls}>{content}</Card>
  );
}

function PanelBlock({ title, onView, children }: { title: string; onView?: () => void; children: React.ReactNode }) {
  return (
    <Card className="border-primary/20 bg-card/60 p-2 sm:p-3 flex flex-col min-h-[140px]">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[8px] sm:text-[11px] font-bold tracking-widest text-primary">{title}</div>
        {onView && (
          <button onClick={onView} className="text-[7px] sm:text-[9px] text-primary/70 hover:text-primary">View all</button>
        )}
      </div>
      <div className="space-y-0.5 flex-1 overflow-hidden">{children}</div>
    </Card>
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
    <div className="grid lg:grid-cols-2 gap-4 max-w-5xl">
      <SettingsSection icon={Pause} title="Maintenance" subtitle="Block non-admin access and post a notice.">
        <div className="flex items-center justify-between">
          <div className="text-sm">Maintenance mode</div>
          <Switch checked={!!s.maintenance_mode} onCheckedChange={(v) => setS({ ...s, maintenance_mode: v })} />
        </div>
        <Textarea placeholder="Message shown to users" value={s.maintenance_message ?? ""} onChange={(e) => setS({ ...s, maintenance_message: e.target.value })} />
      </SettingsSection>

      <SettingsSection icon={Coins} title="Betting Limits" subtitle="Stake and payout guardrails.">
        <FieldLuxe label="Minimum stake">
          <Input type="number" value={s.min_stake ?? 2000000} onChange={(e) => setS({ ...s, min_stake: Number(e.target.value) })} />
        </FieldLuxe>
        <FieldLuxe label="Maximum payout cap">
          <Input type="number" value={s.max_payout ?? 100000000} onChange={(e) => setS({ ...s, max_payout: Number(e.target.value) })} />
        </FieldLuxe>
        <p className="text-[10px] text-muted-foreground">Bets whose potential payout exceeds the cap are automatically clamped.</p>
      </SettingsSection>

      <SettingsSection icon={Sparkles} title="Brand" subtitle="Tagline shown across landing surfaces.">
        <FieldLuxe label="Hero tagline"><Input value={s.hero_tagline ?? ""} onChange={(e) => setS({ ...s, hero_tagline: e.target.value })} placeholder="Season 4 · Live" /></FieldLuxe>
      </SettingsSection>

      <SettingsSection icon={MessageSquare} title="Contact" subtitle="Public-facing contact channels.">
        <FieldLuxe label="Email"><Input value={s.contact_email ?? ""} onChange={(e) => setS({ ...s, contact_email: e.target.value })} /></FieldLuxe>
        <FieldLuxe label="Phone"><Input value={s.contact_phone ?? ""} onChange={(e) => setS({ ...s, contact_phone: e.target.value })} /></FieldLuxe>
        <FieldLuxe label="WhatsApp"><Input value={s.contact_whatsapp ?? ""} onChange={(e) => setS({ ...s, contact_whatsapp: e.target.value })} /></FieldLuxe>
      </SettingsSection>

      <SettingsSection icon={Megaphone} title="About & Trust" subtitle="Public-facing copy.">
        <FieldLuxe label="About us"><Textarea rows={3} value={s.about_us ?? ""} onChange={(e) => setS({ ...s, about_us: e.target.value })} /></FieldLuxe>
        <FieldLuxe label="Why trust us"><Textarea rows={3} value={s.why_trust_us ?? ""} onChange={(e) => setS({ ...s, why_trust_us: e.target.value })} /></FieldLuxe>
        <FieldLuxe label="Terms & Conditions"><Textarea rows={6} value={s.terms_content ?? ""} onChange={(e) => setS({ ...s, terms_content: e.target.value })} /></FieldLuxe>
      </SettingsSection>

      <SettingsSection icon={ImageIcon} title="Pop-up Ad" subtitle="Promo modal across the platform." right={<Switch checked={!!s.popup_ad_active} onCheckedChange={(v) => setS({ ...s, popup_ad_active: v })} />}>
        <FieldLuxe label="Size">
          <Select value={s.popup_ad_size ?? "large"} onValueChange={(v) => setS({ ...s, popup_ad_size: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
              <SelectItem value="xl">Extra Large</SelectItem>
            </SelectContent>
          </Select>
        </FieldLuxe>
        <FieldLuxe label="Image"><Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadPopup(e.target.files[0])} /></FieldLuxe>
        {s.popup_ad_image && <img src={s.popup_ad_image} alt="" className="w-full max-h-48 object-contain rounded border border-border" />}
        <FieldLuxe label="Body text/HTML"><Textarea rows={3} value={s.popup_ad_text ?? ""} onChange={(e) => setS({ ...s, popup_ad_text: e.target.value })} /></FieldLuxe>
        <FieldLuxe label="Link (optional)"><Input value={s.popup_ad_link ?? ""} onChange={(e) => setS({ ...s, popup_ad_link: e.target.value })} /></FieldLuxe>
      </SettingsSection>

      <Card className="glass-strong p-4 lg:col-span-2 flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" />Saving writes an audit log entry.</div>
        <div className="flex gap-2 flex-wrap">
          <Button className="btn-luxury h-11 px-6" onClick={save}><Check className="h-4 w-4 mr-1" />Save settings</Button>
          <Button variant="destructive" className="h-11" onClick={wipe}><AlertTriangle className="h-4 w-4 mr-1" />Emergency: wipe all tokens</Button>
        </div>
      </Card>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, subtitle, right, children }: { icon: any; title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="glass-strong p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-xl bg-gradient-gold text-primary-foreground grid place-items-center shrink-0 shadow-gold"><Icon className="h-5 w-5" /></span>
        <div className="flex-1">
          <div className="font-bold text-base">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
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
      inputLabel: approve ? "Instructions for user" : "Reason for declining",
      inputPlaceholder: approve ? "Optional payout instructions…" : "Optional decline reason…",
    });
    if (!ok || typeof ok !== "object") return;
    const note = ok.value;
    const { error } = await supabase.rpc("review_withdrawal_request", { _id: r.id, _approve: approve, _note: note || undefined });
    if (error) toast.error(error.message); else {
      toast.success("Done");
      await logAudit(`withdrawal_${approve ? "approved" : "declined"}`, "withdrawal", r.id, {
        amount: r.amount, reason: note ?? null, target_user_id: r.user_id,
        target_user_email: profiles[r.user_id]?.email, target_user_name: profiles[r.user_id]?.full_name,
        ingame_name: r.ingame_name, gang_name: r.gang_name,
      });
      load();
    }
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
  const [draft, setDraft] = useState({ kind: "gang", name: "", top_player: "", wins: 0, losses: 0, draws: 0, played: 0, points: 0, manual_rank: "", is_hidden: false });
  const [editId, setEditId] = useState<string | null>(null);
  const confirm = useConfirm();
  async function load() { setList((await supabase.from("leaderboard_overrides").select("*").order("kind").order("manual_rank", { ascending: true, nullsFirst: false })).data ?? []); }
  useEffect(() => { load(); }, []);
  async function save() {
    if (!draft.name) { toast.error("Name required"); return; }
    const payload: any = { ...draft, manual_rank: draft.manual_rank ? Number(draft.manual_rank) : null };
    if (editId) payload.id = editId;
    const { error } = await supabase.from("leaderboard_overrides").upsert(payload);
    if (error) { toast.error(error.message); return; }
    await logAudit(editId ? "leaderboard_override_edit" : "leaderboard_override_create", "leaderboard_overrides", editId ?? undefined, payload);
    toast.success(editId ? "Entry updated" : "Override saved");
    setDraft({ kind: "gang", name: "", top_player: "", wins: 0, losses: 0, draws: 0, played: 0, points: 0, manual_rank: "", is_hidden: false });
    setEditId(null);
    load();
  }
  async function del(id: string) {
    if (!await confirm({ title: "Delete leaderboard entry?", tone: "danger", confirmText: "Delete" })) return;
    await supabase.from("leaderboard_overrides").delete().eq("id", id);
    await logAudit("leaderboard_override_delete", "leaderboard_overrides", id);
    load();
  }
  async function toggleHide(o: any) {
    const next = !o.is_hidden;
    const { error } = await supabase.from("leaderboard_overrides").update({ is_hidden: next }).eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(next ? "leaderboard_hide" : "leaderboard_unhide", "leaderboard_overrides", o.id, { name: o.name, kind: o.kind });
    toast.success(next ? `${o.name} hidden from leaderboard` : `${o.name} restored`);
    load();
  }
  async function hideTeam() {
    if (!draft.name) { toast.error("Enter the team or shooter name to hide"); return; }
    const payload: any = { kind: draft.kind, name: draft.name, is_hidden: true, wins: 0, losses: 0, draws: 0, played: 0, points: 0 };
    const { error } = await supabase.from("leaderboard_overrides").upsert(payload, { onConflict: "id" });
    if (error) { toast.error(error.message); return; }
    await logAudit("leaderboard_hide", "leaderboard_overrides", undefined, payload);
    toast.success(`${draft.name} hidden from leaderboard`);
    setDraft({ kind: "gang", name: "", top_player: "", wins: 0, losses: 0, draws: 0, played: 0, points: 0, manual_rank: "", is_hidden: false });
    load();
  }
  function editEntry(o: any) {
    setEditId(o.id);
    setDraft({
      kind: o.kind ?? "gang", name: o.name ?? "", top_player: o.top_player ?? "",
      wins: Number(o.wins ?? 0), losses: Number(o.losses ?? 0), draws: Number(o.draws ?? 0),
      played: Number(o.played ?? 0), points: Number(o.points ?? 0),
      manual_rank: o.manual_rank ? String(o.manual_rank) : "",
      is_hidden: !!o.is_hidden,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function clearAll() {
    if (!await confirm({
      title: `Clear ALL ${list.length} leaderboard entries?`,
      description: "This permanently removes every manual leaderboard override. Auto-computed stats from match results are unaffected.",
      tone: "danger", confirmText: "Clear leaderboard",
    })) return;
    const { error } = await supabase.from("leaderboard_overrides").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) { toast.error(error.message); return; }
    await logAudit("leaderboard_clear_all", "leaderboard_overrides", undefined, { previous_count: list.length });
    toast.success("Leaderboard cleared");
    load();
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">{list.length} manual override{list.length === 1 ? "" : "s"}</div>
        <Button variant="destructive" size="sm" onClick={clearAll} disabled={list.length === 0}>
          <Trash2 className="h-3 w-3 mr-1" />Clear Leaderboard
        </Button>
      </div>
      <Card className="glass-strong p-4 space-y-2">
        <div className="font-bold flex items-center gap-2">
          {editId ? <><Pencil className="h-4 w-4 text-primary" />Editing entry</> : "Manual override (auto-stats are computed from match results)"}
          {editId && <button onClick={() => { setEditId(null); setDraft({ kind: "gang", name: "", top_player: "", wins: 0, losses: 0, draws: 0, played: 0, points: 0, manual_rank: "", is_hidden: false }); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline">Cancel edit</button>}
        </div>
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
        <div className="flex flex-wrap gap-2">
          <Button className="btn-luxury" onClick={save}>
            {editId ? <><Check className="h-4 w-4 mr-1" />Update entry</> : <><Plus className="h-4 w-4 mr-1" />Save override</>}
          </Button>
          {!editId && (
            <Button variant="destructive" onClick={hideTeam} title="Hide this team/shooter from the public leaderboard without touching match history">
              <Trash2 className="h-4 w-4 mr-1" />Remove from leaderboard
            </Button>
          )}
        </div>
      </Card>
      <div className="space-y-1">
        {list.map((o) => (
          <Card key={o.id} className={`glass p-2 flex items-center gap-2 flex-wrap text-sm ${o.is_hidden ? "opacity-60 border-destructive/40" : ""}`}>
            <Badge variant="outline" className="capitalize">{o.kind}</Badge>
            {o.is_hidden && <Badge variant="destructive" className="text-[10px]">Hidden</Badge>}
            <div className="font-bold flex-1 min-w-0 truncate">{o.name} {o.top_player && <span className="text-xs text-muted-foreground">· top: {o.top_player}</span>}</div>
            <span className="text-xs text-muted-foreground">W {o.wins} · L {o.losses} · D {o.draws} · PTS {o.points}{o.manual_rank ? ` · #${o.manual_rank}` : ""}</span>
            <Button size="sm" variant="outline" onClick={() => toggleHide(o)} title={o.is_hidden ? "Show on leaderboard" : "Hide from leaderboard"}>
              {o.is_hidden ? <Eye className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => editEntry(o)}><Pencil className="h-3 w-3" /></Button>
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
      .select("*, profiles!user_id(full_name,email,ingame_name), bet_selections(*, matches!match_id(name))")
      .order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") qb = qb.eq("status", filter as any);
    const { data } = await qb;
    setBets(data ?? []);
  }
  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    const ch = supabase.channel("admin-bettracker")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_selections" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [filter]);

  async function suspend(b: any) {
    const ok = await confirm({ title: "Suspend / flag ticket?", description: `Tracking ${b.tracking_id} will stop from crediting until admin unsuspends it.`, tone: "danger", confirmText: "Suspend ticket", inputLabel: "Reason", inputPlaceholder: "Why is this betslip being suspended?" });
    if (!ok || typeof ok !== "object") return;
    const { error } = await supabase.rpc("admin_suspend_bet", { _bet_id: b.id, _reason: ok.value || undefined });
    if (error) toast.error(error.message); else {
      await logAudit("bet_suspend", "bet", b.id, { tracking_id: b.tracking_id, stake: b.stake, user_id: b.user_id, target_user_email: b.profiles?.email, reason: ok.value });
      toast.success("Ticket suspended"); load();
    }
  }
  async function unsuspend(b: any) {
    const { error } = await supabase.rpc("admin_unsuspend_bet", { _bet_id: b.id });
    if (error) toast.error(error.message); else {
      await logAudit("bet_unsuspend", "bet", b.id, { tracking_id: b.tracking_id, user_id: b.user_id, target_user_email: b.profiles?.email });
      toast.success("Ticket reactivated"); load();
    }
  }
  async function del(b: any) {
    const ok = await confirm({ title: "Delete ticket?", description: `Tracking ${b.tracking_id}. You can optionally refund the stake before removal.`, tone: "danger", confirmText: "Delete ticket", cancelText: "Cancel", checkboxLabel: "Refund stake to user", inputLabel: "Admin note", inputPlaceholder: "Optional reason shown in logs…" });
    if (!ok || typeof ok !== "object") return;
    const { error } = await supabase.rpc("admin_delete_bet", { _bet_id: b.id, _refund: ok.checked, _reason: ok.value || undefined });
    if (error) toast.error(error.message); else {
      await logAudit("bet_delete", "bet", b.id, { tracking_id: b.tracking_id, stake: b.stake, refunded: !!ok.checked, user_id: b.user_id, target_user_email: b.profiles?.email, reason: ok.value });
      toast.success(ok.checked ? "Ticket deleted & refunded" : "Ticket deleted"); load();
    }
  }
  async function refund(b: any) {
    const ok = await confirm({ title: "Mark ticket as refunded?", description: `Refunds ${Number(b.stake).toLocaleString()} tokens and closes ${b.tracking_id}.`, confirmText: "Refund stake", inputLabel: "Refund reason", inputPlaceholder: "Reason for refund…" });
    if (!ok || typeof ok !== "object") return;
    const { error } = await supabase.rpc("admin_refund_bet", { _bet_id: b.id, _reason: ok.value || undefined });
    if (error) toast.error(error.message); else {
      await logAudit("bet_refund", "bet", b.id, { tracking_id: b.tracking_id, stake: b.stake, user_id: b.user_id, target_user_email: b.profiles?.email, reason: ok.value });
      toast.success("Ticket refunded"); load();
    }
  }
  async function voidBet(b: any) {
    const ok = await confirm({ title: "Mark ticket as void?", description: `Void ${b.tracking_id}. You can return the stake while keeping the ticket record visible.`, confirmText: "Mark void", checkboxLabel: "Refund stake to user", inputLabel: "Void reason", inputPlaceholder: "Reason for voiding this ticket…" });
    if (!ok || typeof ok !== "object") return;
    const { error } = await (supabase as any).rpc("admin_void_bet", { _bet_id: b.id, _refund: ok.checked, _reason: ok.value || undefined });
    if (error) toast.error(error.message); else {
      await logAudit("bet_void", "bet", b.id, { tracking_id: b.tracking_id, stake: b.stake, refunded: !!ok.checked, user_id: b.user_id, target_user_email: b.profiles?.email, reason: ok.value });
      toast.success(ok.checked ? "Ticket voided & refunded" : "Ticket voided"); load();
    }
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
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tracking, code, user…" className="w-full md:max-w-xs" />
        <Button size="sm" variant="outline" onClick={load}><RotateCw className="h-3 w-3 mr-1" />Refresh</Button>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all","open","won","lost","suspended","refunded","cashed_out","void"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <div className="mt-3 grid gap-1.5">
                  {(b.bet_selections ?? []).map((s: any) => (
                    <div key={s.id} className="rounded-lg border border-border/70 bg-background/30 px-2 py-1.5 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{s.matches?.name ?? "Match"}</span> · {s.selection_label} <span className="font-mono text-primary">@{Number(s.locked_odds).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 items-center flex-wrap justify-end">
                <Button asChild size="sm" variant="outline"><a href={`/ticket/${b.id}`}>View</a></Button>
                {b.status === "open" && <Button size="sm" variant="outline" onClick={() => suspend(b)}><Pause className="h-3 w-3" /></Button>}
                {b.status === "suspended" && <Button size="sm" variant="outline" onClick={() => unsuspend(b)}><Play className="h-3 w-3" /></Button>}
                {!["won", "cashed_out", "refunded", "void"].includes(b.status) && <Button size="sm" variant="outline" onClick={() => voidBet(b)}>Void</Button>}
                {!["won", "cashed_out", "refunded"].includes(b.status) && <Button size="sm" variant="outline" onClick={() => refund(b)}><RotateCw className="h-3 w-3" /></Button>}
                <Button size="sm" variant="destructive" onClick={() => del(b)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TasksAchievementsPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [draft, setDraft] = useState({ user_id: "", title: "", description: "", reward_tokens: 0 });
  const [ach, setAch] = useState({ user_id: "", code: "", title: "", description: "", icon: "🏆" });
  async function load() {
    const [{ data: u }, { data: t }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email").order("created_at", { ascending: false }).limit(500),
      supabase.from("user_tasks").select("*, profiles!user_id(full_name,email)").order("created_at", { ascending: false }).limit(200),
      supabase.from("user_achievements").select("*, profiles!user_id(full_name,email)").order("awarded_at", { ascending: false }).limit(200),
    ]);
    setUsers(u ?? []); setTasks(t ?? []); setAchievements(a ?? []);
  }
  useEffect(() => { load(); }, []);
  async function createTask() {
    if (!draft.user_id || !draft.title) { toast.error("Pick a user and enter a task title"); return; }
    const { error } = await supabase.from("user_tasks").insert({ user_id: draft.user_id, title: draft.title, description: draft.description || null, reward_tokens: draft.reward_tokens || 0 });
    if (error) toast.error(error.message); else { toast.success("Task assigned"); setDraft({ user_id: "", title: "", description: "", reward_tokens: 0 }); load(); }
  }
  async function markDone(task: any) {
    await supabase.from("user_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
    if (task.reward_tokens > 0) {
      const { data: p } = await supabase.from("profiles").select("token_balance").eq("id", task.user_id).single();
      if (p) await supabase.from("profiles").update({ token_balance: (p.token_balance ?? 0) + task.reward_tokens }).eq("id", task.user_id);
    }
    await supabase.from("notifications").insert({ user_id: task.user_id, title: "Task completed", body: `${task.title}${task.reward_tokens ? ` · +${task.reward_tokens} tokens` : ""}` });
    toast.success("Task completed"); load();
  }
  async function awardAchievement() {
    if (!ach.user_id || !ach.code || !ach.title) { toast.error("User, code and title required"); return; }
    const { error } = await supabase.from("user_achievements").insert({
      user_id: ach.user_id, code: ach.code, title: ach.title,
      description: ach.description || null, icon: ach.icon || null,
    });
    if (error) { toast.error(error.message); return; }
    await supabase.from("notifications").insert({ user_id: ach.user_id, title: "Achievement unlocked! 🏆", body: `${ach.icon} ${ach.title}` });
    toast.success("Achievement awarded");
    setAch({ user_id: "", code: "", title: "", description: "", icon: "🏆" });
    load();
  }
  async function revokeAchievement(id: string) {
    await supabase.from("user_achievements").delete().eq("id", id);
    toast.success("Revoked"); load();
  }
  return (
    <div className="space-y-4">
      <Card className="glass-strong p-4 space-y-3">
        <div className="flex items-center gap-2 font-bold"><ClipboardList className="h-4 w-4 text-primary" />User Tasks</div>
        <div className="grid md:grid-cols-4 gap-2">
          <Select value={draft.user_id} onValueChange={(v) => setDraft({ ...draft, user_id: v })}>
            <SelectTrigger><SelectValue placeholder="Assign to user" /></SelectTrigger>
            <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Task title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Input placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <Input type="number" placeholder="Reward tokens" value={draft.reward_tokens || ""} onChange={(e) => setDraft({ ...draft, reward_tokens: Number(e.target.value) })} />
        </div>
        <Button className="btn-luxury" onClick={createTask}><Plus className="h-4 w-4 mr-1" />Assign task</Button>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass p-4 space-y-2">
          <div className="font-bold">Active platform tasks</div>
          {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
          {tasks.map((t) => <div key={t.id} className="rounded-lg border border-border/70 p-3 text-sm"><div className="font-bold">{t.title}</div><div className="text-xs text-muted-foreground">{t.profiles?.full_name || t.profiles?.email} · {t.status} · reward {Number(t.reward_tokens).toLocaleString()}</div>{t.status !== "completed" && <Button size="sm" variant="outline" className="mt-2" onClick={() => markDone(t)}><Check className="h-3 w-3 mr-1" />Mark complete</Button>}</div>)}
        </Card>
        <Card className="glass p-4 space-y-3">
          <div className="font-bold flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" />Achievements</div>
          <div className="grid md:grid-cols-2 gap-2">
            <Select value={ach.user_id} onValueChange={(v) => setAch({ ...ach, user_id: v })}>
              <SelectTrigger><SelectValue placeholder="Award to user" /></SelectTrigger>
              <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Code (e.g. first_win)" value={ach.code} onChange={(e) => setAch({ ...ach, code: e.target.value })} />
            <Input placeholder="Title" value={ach.title} onChange={(e) => setAch({ ...ach, title: e.target.value })} />
            <Input placeholder="Icon (emoji)" value={ach.icon} onChange={(e) => setAch({ ...ach, icon: e.target.value })} />
            <Input className="md:col-span-2" placeholder="Description" value={ach.description} onChange={(e) => setAch({ ...ach, description: e.target.value })} />
          </div>
          <Button className="btn-luxury" onClick={awardAchievement}><Trophy className="h-4 w-4 mr-1" />Award achievement</Button>
          <div className="space-y-2 pt-2 max-h-72 overflow-y-auto">
            {achievements.length === 0 && <p className="text-sm text-muted-foreground">No achievements awarded yet.</p>}
            {achievements.map((a) => (
              <div key={a.id} className="rounded-lg border border-border/70 p-3 text-sm flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate">{a.icon} {a.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.profiles?.full_name || a.profiles?.email} · {new Date(a.awarded_at).toLocaleString()}</div>
                  {a.description && <div className="text-xs mt-1 text-muted-foreground">{a.description}</div>}
                </div>
                <Button size="sm" variant="outline" onClick={() => revokeAchievement(a.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        </Card>
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
      .select("*, profiles!user_id(full_name,email)")
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
    const ok = await confirm({ title: "Approve & generate code?", description: `Will create a ${Number(r.amount).toLocaleString()}-token promo code with ${r.usage_limit} uses.`, confirmText: "Approve", inputLabel: "Note to sponsor", inputPlaceholder: "Optional approval note…" });
    if (!ok || typeof ok !== "object") return;
    const { error } = await supabase.rpc("approve_promo_request", { _id: r.id, _note: ok.value || undefined });
    if (error) toast.error(error.message); else { toast.success("Promo code approved & generated"); load(); }
  }
  async function decline(r: any) {
    const ok = await confirm({ title: "Decline request?", tone: "danger", confirmText: "Decline", inputLabel: "Reason", inputPlaceholder: "Tell the sponsor why it was declined…" });
    if (!ok || typeof ok !== "object") return;
    const { error } = await supabase.rpc("decline_promo_request", { _id: r.id, _note: ok.value || undefined });
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

// ============= Correct Score Market Manager =============
const POPULAR_SCORES: Array<[number, number]> = [
  [0,0],[1,0],[0,1],[1,1],[2,0],[0,2],[2,1],[1,2],[2,2],
  [3,0],[0,3],[3,1],[1,3],[3,2],[2,3],[3,3],[4,0],[0,4],
  [4,1],[1,4],[4,2],[2,4],[5,0],[0,5],
];
const DEFAULT_ODDS_BY_SCORE: Record<string, number> = {
  "0-0": 9, "1-0": 6.5, "0-1": 8, "1-1": 5.5, "2-0": 8, "0-2": 12,
  "2-1": 8.5, "1-2": 11, "2-2": 13, "3-0": 14, "0-3": 26, "3-1": 12,
  "1-3": 21, "3-2": 21, "2-3": 26, "3-3": 41, "4-0": 26, "0-4": 51,
  "4-1": 21, "1-4": 41, "4-2": 41, "2-4": 67, "5-0": 67, "0-5": 101,
};

function CorrectScoreManagerButton({ match, onSaved }: { match: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} title="Correct Score market">
        <Trophy className="h-3 w-3 mr-1" />CS
      </Button>
      {open && <CorrectScoreEditor match={match} onClose={() => { setOpen(false); onSaved(); }} />}
    </>
  );
}

function CorrectScoreEditor({ match, onClose }: { match: any; onClose: () => void }) {
  const [marketId, setMarketId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [rows, setRows] = useState<Array<{ id?: string; label: string; value: number; _delete?: boolean; _new?: boolean }>>([]);
  const [customH, setCustomH] = useState<number>(0);
  const [customA, setCustomA] = useState<number>(0);
  const [customOdds, setCustomOdds] = useState<number>(10);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const homeName = match?.home_team?.name ?? "Home";
  const awayName = match?.away_team?.name ?? "Away";

  useEffect(() => {
    (async () => {
      const { data: markets } = await supabase
        .from("markets")
        .select("id,name,is_open,odds(id,label,value)")
        .eq("match_id", match.id);
      const m = (markets ?? []).find((x: any) => /correct\s*score/i.test(x.name));
      if (m) {
        setMarketId(m.id);
        setIsOpen(!!m.is_open);
        setRows(((m as any).odds ?? []).map((o: any) => ({ id: o.id, label: o.label, value: Number(o.value) })));
      }
      setLoading(false);
    })();
  }, [match.id]);

  function addScore(h: number, a: number, odds?: number) {
    const label = `${h}-${a}`;
    if (rows.some((r) => r.label === label && !r._delete)) { toast.info(`${label} already added`); return; }
    setRows([...rows, { label, value: odds ?? DEFAULT_ODDS_BY_SCORE[label] ?? 15, _new: true }]);
  }

  function generatePopular() {
    const existing = new Set(rows.filter((r) => !r._delete).map((r) => r.label));
    const adds = POPULAR_SCORES
      .map(([h, a]) => `${h}-${a}`)
      .filter((l) => !existing.has(l))
      .map((label) => ({ label, value: DEFAULT_ODDS_BY_SCORE[label] ?? 15, _new: true }));
    if (adds.length === 0) { toast.info("All popular scores already added"); return; }
    setRows([...rows, ...adds]);
  }

  async function save() {
    setSaving(true);
    try {
      let mId = marketId;
      if (!mId) {
        const { data, error } = await supabase.from("markets").insert({ match_id: match.id, name: "Correct Score", is_open: isOpen }).select().single();
        if (error) throw error;
        mId = data.id;
        setMarketId(mId);
      } else {
        await supabase.from("markets").update({ is_open: isOpen }).eq("id", mId);
      }
      // deletes
      const toDelete = rows.filter((r) => r._delete && r.id).map((r) => r.id!);
      if (toDelete.length) await supabase.from("odds").delete().in("id", toDelete);
      // updates
      for (const r of rows.filter((r) => r.id && !r._delete && !r._new)) {
        await supabase.from("odds").update({ value: r.value, label: r.label }).eq("id", r.id!);
      }
      // inserts
      const toInsert = rows.filter((r) => r._new && !r._delete).map((r) => ({ market_id: mId!, label: r.label, value: r.value }));
      if (toInsert.length) await supabase.from("odds").insert(toInsert);
      toast.success("Correct Score market saved");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally { setSaving(false); }
  }

  const visible = rows
    .map((r, i) => ({ ...r, _i: i }))
    .filter((r) => !r._delete)
    .filter((r) => !search.trim() || r.label.replace(/[-:]/g, "").includes(search.replace(/[-:\s]/g, "")));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" />Correct Score · {homeName} vs {awayName}</DialogTitle>
        </DialogHeader>

        {loading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-sm"><Switch checked={isOpen} onCheckedChange={setIsOpen} /> Market is open</label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={generatePopular}><Sparkles className="h-3 w-3 mr-1" />Generate popular scores</Button>
                <Button size="sm" variant="outline" onClick={() => setRows(rows.map((r) => r.id ? { ...r, _delete: true } : { ...r, _delete: true }))}><Trash2 className="h-3 w-3 mr-1" />Clear all</Button>
              </div>
            </div>

            <Card className="glass p-3 space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add custom scoreline</div>
              <div className="flex items-end gap-2 flex-wrap">
                <div><label className="text-[10px] text-muted-foreground">{homeName}</label><Input type="number" min={0} value={customH} onChange={(e) => setCustomH(Number(e.target.value))} className="w-20" /></div>
                <span className="pb-2 text-muted-foreground">-</span>
                <div><label className="text-[10px] text-muted-foreground">{awayName}</label><Input type="number" min={0} value={customA} onChange={(e) => setCustomA(Number(e.target.value))} className="w-20" /></div>
                <div><label className="text-[10px] text-muted-foreground">Odds</label><Input type="number" step="0.01" min={1.01} value={customOdds} onChange={(e) => setCustomOdds(Number(e.target.value))} className="w-24" /></div>
                <Button size="sm" onClick={() => addScore(customH, customA, customOdds)}><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
            </Card>

            <Input placeholder="Search scoreline (e.g. 2-1 or 21)" value={search} onChange={(e) => setSearch(e.target.value)} />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visible.length === 0 && <div className="col-span-full text-center text-sm text-muted-foreground py-6">No scorelines yet. Use “Generate popular scores” or add custom.</div>}
              {visible.map((r) => (
                <div key={r._i} className="rounded-lg border border-border bg-background/40 p-2 flex items-center gap-2">
                  <div className="font-mono font-bold text-sm shrink-0">{r.label}</div>
                  <Input type="number" step="0.01" min={1.01} value={r.value} onChange={(e) => {
                    const v = Number(e.target.value);
                    setRows(rows.map((row, i) => i === r._i ? { ...row, value: v } : row));
                  }} className="h-8 text-xs" />
                  <button className="text-destructive shrink-0" onClick={() => setRows(rows.map((row, i) => i === r._i ? { ...row, _delete: true } : row))} title="Remove"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="btn-luxury" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Market"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ HOUSE WALLET ============================ */
function HouseWalletPanel() {
  const confirm = useConfirm();
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjAmt, setAdjAmt] = useState<number>(0);
  const [adjReason, setAdjReason] = useState<string>("");
  const [pauseReason, setPauseReason] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: w }, { data: t }] = await Promise.all([
      supabase.from("house_wallet").select("*").eq("id", 1).maybeSingle(),
      supabase.from("house_transactions").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setWallet(w);
    setTxs(t ?? []);
    const ids = Array.from(new Set((t ?? []).map((x: any) => x.user_id).filter(Boolean)));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id,full_name,ingame_name,gang_name").in("id", ids);
      const map: Record<string, any> = {}; (p ?? []).forEach((x: any) => { map[x.id] = x; }); setProfiles(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("house-wallet-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "house_wallet" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "house_transactions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function togglePause(next: boolean) {
    const ok = await confirm({
      title: next ? "Pause all payouts?" : "Resume payouts?",
      description: next
        ? "Cashouts and admin-paid winnings will be blocked until you resume. Users will see a clear message."
        : "Payouts will start processing again, including any winnings that admins try to credit.",
      confirmText: next ? "Pause Wallet" : "Resume Wallet",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("house_set_paused", { _paused: next, _reason: next ? (pauseReason || undefined) : undefined });
    if (error) toast.error(error.message);
    else { toast.success(next ? "Payouts paused" : "Payouts resumed"); setPauseReason(""); }
  }

  async function adjust() {
    if (!adjAmt || !adjReason.trim()) { toast.error("Amount and reason required"); return; }
    const { error } = await supabase.rpc("house_manual_adjust", { _amount: adjAmt, _reason: adjReason.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("Wallet adjusted");
    setAdjustOpen(false); setAdjAmt(0); setAdjReason("");
  }

  if (loading || !wallet) return <Card className="glass-strong p-6">Loading wallet…</Card>;

  const balance = Number(wallet.balance ?? 0);
  const totalIn = Number(wallet.total_in ?? 0);
  const totalOut = Number(wallet.total_out ?? 0);
  const net = totalIn - totalOut;
  const filtered = filter === "all" ? txs : txs.filter((t) => t.kind === filter);

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <Card className={`relative overflow-hidden p-5 border-2 ${wallet.payouts_paused ? "border-destructive/60 bg-destructive/10" : "border-primary/30 glass-strong"}`}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-gold" />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
              <Wallet className="h-3 w-3" /> House Bankroll
              {wallet.payouts_paused && <Badge variant="destructive" className="ml-2">PAYOUTS PAUSED</Badge>}
            </div>
            <div className={`text-4xl font-black mt-1 ${balance < 0 ? "text-destructive" : "gradient-gold-text"}`}>
              {balance.toLocaleString()} <span className="text-base text-muted-foreground font-normal">tokens</span>
            </div>
            {wallet.payouts_paused && wallet.pause_reason && (
              <div className="text-xs text-destructive mt-1">Reason: {wallet.pause_reason}</div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!wallet.payouts_paused && (
              <Input placeholder="Pause reason (optional)" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} className="w-56" />
            )}
            <Button variant={wallet.payouts_paused ? "default" : "destructive"} onClick={() => togglePause(!wallet.payouts_paused)}>
              {wallet.payouts_paused ? <><Play className="h-4 w-4 mr-1" />Resume Payouts</> : <><Pause className="h-4 w-4 mr-1" />Pause Payouts</>}
            </Button>
            <Button className="btn-luxury" onClick={() => setAdjustOpen(true)}><Plus className="h-4 w-4 mr-1" />Manual Adjust</Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total In (Stakes)</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">+{totalIn.toLocaleString()}</div>
        </Card>
        <Card className="glass p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Out (Payouts)</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">-{totalOut.toLocaleString()}</div>
        </Card>
        <Card className="glass p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Net P/L</div>
          <div className={`text-2xl font-bold mt-1 ${net >= 0 ? "text-emerald-400" : "text-destructive"}`}>{net >= 0 ? "+" : ""}{net.toLocaleString()}</div>
        </Card>
        <Card className="glass p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Transactions</div>
          <div className="text-2xl font-bold text-primary mt-1">{txs.length}</div>
        </Card>
      </div>

      {/* History */}
      <Card className="glass-strong p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="font-bold flex items-center gap-2"><History className="h-4 w-4 text-primary" />Transaction history</div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All transactions</SelectItem>
              <SelectItem value="bet_inflow">Bet inflows</SelectItem>
              <SelectItem value="payout">Winnings paid</SelectItem>
              <SelectItem value="cashout">Cashouts</SelectItem>
              <SelectItem value="refund_inflow">Refunds back</SelectItem>
              <SelectItem value="manual_credit">Manual credits</SelectItem>
              <SelectItem value="manual_debit">Manual debits</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr className="text-left border-b border-border">
                <th className="py-2 pr-2">When</th>
                <th className="pr-2">Kind</th>
                <th className="pr-2">Amount</th>
                <th className="pr-2">Balance after</th>
                <th className="pr-2">User</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No transactions.</td></tr>}
              {filtered.map((t) => {
                const p = t.user_id ? profiles[t.user_id] : null;
                const amt = Number(t.amount);
                const bal = Number(t.balance_after);
                return (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="py-2 pr-2 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="pr-2"><Badge variant="outline" className="text-[10px]">{t.kind}</Badge></td>
                    <td className={`pr-2 font-mono font-bold ${amt > 0 ? "text-emerald-400" : "text-destructive"}`}>{amt > 0 ? "+" : ""}{amt.toLocaleString()}</td>
                    <td className={`pr-2 font-mono ${bal < 0 ? "text-destructive" : ""}`}>{bal.toLocaleString()}</td>
                    <td className="pr-2">{p ? <span title={p.full_name}>{p.ingame_name || p.full_name}{p.gang_name && <span className="text-muted-foreground ml-1">[{p.gang_name}]</span>}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="text-muted-foreground">{t.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Adjust Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />Manual Wallet Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Amount (positive = credit house, negative = debit)</label>
              <Input type="number" value={adjAmt} onChange={(e) => setAdjAmt(Number(e.target.value))} placeholder="e.g. 5000000 or -2000000" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reason (required)</label>
              <Textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Why is this adjustment being made?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button className="btn-luxury" onClick={adjust}>Confirm Adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChallengesAdminPanel() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ kind: "daily", title: "", description: "", reward_tokens: 100000, target_count: 1, action_key: "manual", is_active: true });
  const load = async () => {
    const { data } = await supabase.from("challenges").select("*").order("created_at", { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => { load(); }, []);
  async function save() {
    if (!form.title) return toast.error("Title required");
    const { error } = await supabase.from("challenges").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Challenge created");
    setForm({ ...form, title: "", description: "" });
    load();
  }
  async function toggle(c: any) {
    await supabase.from("challenges").update({ is_active: !c.is_active }).eq("id", c.id);
    load();
  }
  const confirm = useConfirm();
  async function remove(id: string) {
    if (!await confirm({ title: "Delete challenge?", description: "This permanently removes the challenge.", tone: "danger", confirmText: "Delete" })) return;
    await supabase.from("challenges").delete().eq("id", id);
    load();
  }
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="font-bold">Create Challenge</div>
        <div className="grid md:grid-cols-3 gap-2">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="rounded-md border bg-background px-2 py-2 text-sm">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Action key (e.g. place_bet)" value={form.action_key} onChange={(e) => setForm({ ...form, action_key: e.target.value })} />
          <Input type="number" placeholder="Reward tokens" value={form.reward_tokens} onChange={(e) => setForm({ ...form, reward_tokens: Number(e.target.value) })} />
          <Input type="number" placeholder="Target count" value={form.target_count} onChange={(e) => setForm({ ...form, target_count: Number(e.target.value) })} />
          <Button onClick={save} className="btn-luxury">Create</Button>
        </div>
        <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Card>
      <div className="space-y-2">
        {list.map((c) => (
          <Card key={c.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><Badge variant="outline">{c.kind}</Badge><span className="font-bold">{c.title}</span></div>
              <div className="text-xs text-muted-foreground">{c.description} · {c.reward_tokens.toLocaleString()} tokens · target {c.target_count}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => toggle(c)}>{c.is_active ? "Disable" : "Enable"}</Button>
            <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>Delete</Button>
          </Card>
        ))}
        {list.length === 0 && <p className="text-muted-foreground text-sm">No challenges yet.</p>}
      </div>
    </div>
  );
}

function SeasonsAdminPanel() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name: "", description: "", banner_url: "", starts_at: new Date().toISOString().slice(0, 16), ends_at: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16), is_active: true });
  const load = async () => {
    const { data } = await supabase.from("seasons").select("*").order("starts_at", { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => { load(); }, []);
  async function save() {
    if (!form.name) return toast.error("Name required");
    const { error } = await supabase.from("seasons").insert({ ...form, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString() });
    if (error) return toast.error(error.message);
    toast.success("Season created");
    setForm({ ...form, name: "", description: "" });
    load();
  }
  async function toggle(s: any) {
    await supabase.from("seasons").update({ is_active: !s.is_active }).eq("id", s.id);
    load();
  }
  const confirm = useConfirm();
  async function remove(id: string) {
    if (!await confirm({ title: "Delete season?", description: "This permanently removes the season.", tone: "danger", confirmText: "Delete" })) return;
    await supabase.from("seasons").delete().eq("id", id);
    load();
  }
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="font-bold">Create Season</div>
        <div className="grid md:grid-cols-2 gap-2">
          <Input placeholder="Season name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Banner URL (optional)" value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })} />
          <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
        </div>
        <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Button onClick={save} className="btn-luxury">Create Season</Button>
      </Card>
      <div className="space-y-2">
        {list.map((s) => (
          <Card key={s.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><Badge variant="outline" className={s.is_active ? "border-emerald-500/50 text-emerald-300" : ""}>{s.is_active ? "ACTIVE" : "INACTIVE"}</Badge><span className="font-bold">{s.name}</span></div>
              <div className="text-xs text-muted-foreground">{new Date(s.starts_at).toLocaleDateString()} → {new Date(s.ends_at).toLocaleDateString()}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.is_active ? "Deactivate" : "Activate"}</Button>
            <Button size="sm" variant="destructive" onClick={() => remove(s.id)}>Delete</Button>
          </Card>
        ))}
        {list.length === 0 && <p className="text-muted-foreground text-sm">No seasons yet.</p>}
      </div>
    </div>
  );
}

/* ============================ BANNED USERS ============================ */
function BannedUsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  async function load() {
    const { data } = await supabase.from("profiles").select("id,full_name,email,gang_name,is_banned,ban_reason,updated_at").eq("is_banned", true).order("updated_at", { ascending: false });
    setUsers(data ?? []);
  }
  useEffect(() => { load(); }, []);
  async function unban(id: string) {
    const { error } = await supabase.from("profiles").update({ is_banned: false, ban_reason: null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("User unbanned");
    logAudit("user_unban", "user", id);
    load();
  }
  const filtered = users.filter((u) => !q || (u.full_name ?? "").toLowerCase().includes(q.toLowerCase()) || (u.email ?? "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 flex items-center gap-3 backdrop-blur-2xl border-destructive/30">
        <Shield className="h-5 w-5 text-destructive" />
        <div className="flex-1">
          <div className="font-bold">Banned Users</div>
          <div className="text-xs text-muted-foreground">{filtered.length} banned · click Unban to restore access.</div>
        </div>
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </Card>
      {filtered.length === 0 && <p className="text-muted-foreground text-sm">No banned users.</p>}
      {filtered.map((u) => (
        <Card key={u.id} className="glass-strong p-4 flex items-center justify-between gap-3 flex-wrap backdrop-blur-2xl border-destructive/20">
          <div className="min-w-0 flex-1">
            <div className="font-bold">{u.full_name || "—"} <span className="text-xs text-muted-foreground font-normal">{u.email}</span></div>
            <div className="text-xs text-muted-foreground">{u.gang_name ?? "Independent"} · banned {new Date(u.updated_at).toLocaleDateString()}</div>
            {u.ban_reason && <div className="text-xs mt-1 text-destructive/80">Reason: {u.ban_reason}</div>}
          </div>
          <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300" onClick={() => unban(u.id)}>Unban</Button>
        </Card>
      ))}
    </div>
  );
}

/* ============================ BETS BY STATUS (won / lost) ============================ */
function BetsByStatusPanel({ status }: { status: "won" | "lost" }) {
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("bets")
        .select("id,user_id,tracking_id,stake,potential_payout,settled_at,created_at,bet_selections(selection_label,matches:match_id(name))")
        .eq("status", status)
        .order("settled_at", { ascending: false, nullsFirst: false })
        .limit(200);
      const list = data ?? [];
      setRows(list);
      const ids = Array.from(new Set(list.map((b: any) => b.user_id).filter(Boolean)));
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id,full_name,email,gang_name").in("id", ids as string[]);
        const map: Record<string, any> = {}; (p ?? []).forEach((x: any) => { map[x.id] = x; }); setProfiles(map);
      }
    })();
  }, [status]);
  const tone = status === "won" ? "emerald" : "destructive";
  const label = status === "won" ? "Won Bets" : "Lost Bets";
  return (
    <div className="space-y-3">
      <Card className={`glass-strong p-4 flex items-center gap-3 backdrop-blur-2xl border-${tone}-500/30`}>
        {status === "won" ? <Trophy className="h-5 w-5 text-emerald-400" /> : <X className="h-5 w-5 text-destructive" />}
        <div>
          <div className="font-bold">{label}</div>
          <div className="text-xs text-muted-foreground">{rows.length} ticket(s)</div>
        </div>
      </Card>
      {rows.length === 0 && <p className="text-muted-foreground text-sm">No {status} bets yet.</p>}
      <div className="grid gap-2">
        {rows.map((b) => {
          const u = profiles[b.user_id];
          const matches = (b.bet_selections ?? []).map((s: any) => s.matches?.name || s.selection_label).filter(Boolean).join(" · ");
          return (
            <Card key={b.id} className="backdrop-blur-2xl bg-card/85 border-primary/25 p-4 shadow-luxury">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{u?.full_name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{u?.email}</span>
                    <span className="font-mono text-[10px] text-primary">{b.tracking_id}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{matches || "—"}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(b.settled_at ?? b.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{status === "won" ? "Amount Won" : "Stake Lost"}</div>
                  <div className={`text-lg font-black ${status === "won" ? "text-emerald-300" : "text-destructive"}`}>
                    {(status === "won" ? b.potential_payout : b.stake)?.toLocaleString?.() ?? 0}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ TOKEN MOVEMENT (credits + debits) ============================ */
function TokenMovementPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "credit" | "debit">("all");
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("token_transactions").select("id,user_id,amount,kind,description,balance_after,created_at").order("created_at", { ascending: false }).limit(300);
      setRows(data ?? []);
    })();
  }, []);
  const filtered = rows.filter((r) => filter === "all" || (filter === "credit" ? r.amount > 0 : r.amount < 0));
  const credits = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const debits = rows.filter((r) => r.amount < 0).reduce((a, r) => a + Math.abs(r.amount), 0);
  return (
    <div className="space-y-3">
      <Card className="glass-strong p-4 backdrop-blur-2xl border-primary/30">
        <div className="flex items-center gap-3 flex-wrap">
          <Coins className="h-5 w-5 text-primary" />
          <div>
            <div className="font-bold">Token Movement</div>
            <div className="text-xs text-muted-foreground">Credits and debits across the platform</div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="text-emerald-300 font-bold">+ {credits.toLocaleString()}</span>
            <span className="text-destructive font-bold">− {debits.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          {(["all", "credit", "debit"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="text-[10px] capitalize" onClick={() => setFilter(f)}>{f}</Button>
          ))}
        </div>
      </Card>
      {filtered.length === 0 && <p className="text-muted-foreground text-sm">No token movements.</p>}
      <div className="grid gap-2">
        {filtered.map((r) => (
          <Card key={r.id} className="backdrop-blur-2xl bg-card/85 border-primary/20 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wider text-primary">{r.kind}</div>
              <div className="text-xs text-muted-foreground truncate">{r.description ?? "—"}</div>
              <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className={`text-base font-black ${r.amount > 0 ? "text-emerald-300" : "text-destructive"}`}>
                {r.amount > 0 ? "+" : "−"}{Math.abs(r.amount).toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">bal {Number(r.balance_after ?? 0).toLocaleString()}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
