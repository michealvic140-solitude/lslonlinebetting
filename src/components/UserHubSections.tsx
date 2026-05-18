import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users, Copy, Share2, Trophy, Star, Crown, Shield, Bell, BellOff,
  Upload, Image as ImageIcon, Filter, Search, TrendingUp, TrendingDown,
  Award, Activity, Sparkles,
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";

const TIER_META: Record<string, { label: string; color: string; min: number; next?: number; perks: string[] }> = {
  bronze:   { label: "Bronze",   color: "from-amber-700 to-amber-900",   min: 0,     next: 500,   perks: ["Standard limits", "Daily login bonus"] },
  silver:   { label: "Silver",   color: "from-slate-300 to-slate-500",   min: 500,   next: 3000,  perks: ["+10% stake limit", "Silver chat badge"] },
  gold:     { label: "Gold",     color: "from-amber-400 to-yellow-600",  min: 3000,  next: 10000, perks: ["+25% stake limit", "Faster withdrawals", "Gold chat color"] },
  platinum: { label: "Platinum", color: "from-cyan-300 to-blue-600",     min: 10000, next: 25000, perks: ["+50% stake limit", "Exclusive promos", "Platinum badge"] },
  legend:   { label: "Legend",   color: "from-fuchsia-500 to-pink-600",  min: 25000, perks: ["+100% stake limit", "Priority support", "Legend animation", "Hall of fame"] },
};

/* ============================ REFERRAL CARD ============================ */
export function ReferralCard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<{ count: number; earned: number }>({ count: 0, earned: 0 });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const link = useMemo(() => typeof window !== "undefined" && profile?.referral_code
    ? `${window.location.origin}/register?ref=${profile.referral_code}` : "", [profile?.referral_code]);

  useEffect(() => {
    if (!user) return;
    supabase.from("referrals").select("referrer_bonus").eq("referrer_id", user.id)
      .then(({ data }) => setStats({ count: data?.length ?? 0, earned: (data ?? []).reduce((s: number, r: any) => s + Number(r.referrer_bonus || 0), 0) }));
  }, [user?.id]);

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    toast.success("Referral link copied!");
  }
  async function copyCode() {
    if (!profile?.referral_code) return;
    await navigator.clipboard.writeText(profile.referral_code);
    toast.success("Code copied!");
  }
  async function share() {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try { await (navigator as any).share({ title: "Join LSL", text: "Join me on LSL", url: link }); } catch {}
    } else copyLink();
  }
  async function applyCode() {
    if (!code.trim()) return;
    setBusy(true);
    const { error, data } = await supabase.rpc("apply_referral_code", { _code: code.trim().toUpperCase() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`+${(data as any)?.referee_bonus ?? 0} tokens credited!`);
    setCode("");
  }

  if (!profile) return null;

  return (
    <Card className="relative overflow-hidden p-6 border-primary/30 bg-gradient-to-br from-primary/10 via-card/80 to-accent/10 backdrop-blur-xl">
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1"><Users className="h-5 w-5 text-primary" /><h3 className="font-bold text-lg">Invite Friends</h3></div>
        <p className="text-xs text-muted-foreground mb-4">Earn bonus tokens for every friend who signs up with your code.</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-primary/20 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Referrals</div>
            <div className="text-2xl font-extrabold text-primary">{stats.count}</div>
          </div>
          <div className="rounded-xl border border-primary/20 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Earned</div>
            <div className="text-2xl font-extrabold gradient-gold-text">{stats.earned.toLocaleString()}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Your code</label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={profile.referral_code ?? ""} className="font-mono font-bold" />
              <Button variant="outline" size="icon" onClick={copyCode}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Share link</label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={link} className="text-xs" />
              <Button variant="outline" size="icon" onClick={copyLink}><Copy className="h-4 w-4" /></Button>
              <Button size="icon" onClick={share}><Share2 className="h-4 w-4" /></Button>
            </div>
          </div>
          {!profile.referred_by && (
            <div className="pt-2 border-t border-border/50">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Have a code? Redeem it</label>
              <div className="flex gap-2 mt-1">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LSL-XXXX" />
                <Button onClick={applyCode} disabled={busy}>Apply</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ============================ VIP CARD ============================ */
export function VipCard() {
  const { profile } = useAuth();
  const [xpRules, setXpRules] = useState<{ bet: number; win: number; login: number; referral: number } | null>(null);
  useEffect(() => {
    supabase.from("app_settings").select("xp_per_bet,xp_per_win,xp_per_login,xp_per_referral").eq("id", 1).maybeSingle()
      .then(({ data }) => {
        if (data) setXpRules({ bet: data.xp_per_bet ?? 10, win: data.xp_per_win ?? 25, login: data.xp_per_login ?? 5, referral: data.xp_per_referral ?? 100 });
      });
  }, []);
  if (!profile) return null;
  const tier = (profile.vip_tier as string) ?? "bronze";
  const meta = TIER_META[tier] ?? TIER_META.bronze;
  const xp = Number((profile as any).xp ?? 0);
  const progress = meta.next ? Math.min(100, ((xp - meta.min) / (meta.next - meta.min)) * 100) : 100;
  const TierIcon = tier === "legend" ? Crown : tier === "platinum" ? Shield : tier === "gold" ? Trophy : Star;
  const tierOrder = ["bronze", "silver", "gold", "platinum", "legend"];

  return (
    <Card className="relative overflow-hidden p-6 backdrop-blur-xl border-amber-500/30">
      <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${meta.color}`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><TierIcon className="h-5 w-5 text-amber-300" /><h3 className="font-bold text-lg">VIP Status</h3></div>
          <Badge className={`bg-gradient-to-r ${meta.color} text-white border-0`}>{meta.label}</Badge>
        </div>
        <div className="text-3xl font-extrabold gradient-gold-text">{xp.toLocaleString()} XP</div>
        {meta.next && (
          <>
            <div className="mt-3 h-2 rounded-full bg-background/40 overflow-hidden">
              <div className={`h-full bg-gradient-to-r ${meta.color}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">{Math.max(0, meta.next - xp).toLocaleString()} XP to reach {TIER_META[tierOrder[tierOrder.indexOf(tier) + 1]]?.label ?? "next tier"}</div>
          </>
        )}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Your perks</div>
          <ul className="space-y-1">
            {meta.perks.map((p) => <li key={p} className="text-xs flex items-center gap-2"><Sparkles className="h-3 w-3 text-amber-300" />{p}</li>)}
          </ul>
        </div>

        {/* How to earn XP */}
        <div className="mt-5 pt-4 border-t border-border/50">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">How to earn XP</div>
          <ul className="grid grid-cols-2 gap-2 text-xs">
            <li className="flex items-center justify-between rounded-md bg-background/40 px-2 py-1.5"><span>Place a bet</span><span className="font-bold text-amber-300">+{xpRules?.bet ?? 10}</span></li>
            <li className="flex items-center justify-between rounded-md bg-background/40 px-2 py-1.5"><span>Win a bet</span><span className="font-bold text-amber-300">+{xpRules?.win ?? 25}</span></li>
            <li className="flex items-center justify-between rounded-md bg-background/40 px-2 py-1.5"><span>Daily login</span><span className="font-bold text-amber-300">+{xpRules?.login ?? 5}</span></li>
            <li className="flex items-center justify-between rounded-md bg-background/40 px-2 py-1.5"><span>Referral signup</span><span className="font-bold text-amber-300">+{xpRules?.referral ?? 100}</span></li>
          </ul>
        </div>

        {/* Tier ladder */}
        <div className="mt-5 pt-4 border-t border-border/50">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Rank-up requirements</div>
          <div className="space-y-1.5">
            {tierOrder.map((t) => {
              const m = TIER_META[t];
              const reached = xp >= m.min;
              const isCurrent = t === tier;
              return (
                <div key={t} className={`flex items-center justify-between text-xs rounded-md px-2 py-1.5 ${isCurrent ? "bg-amber-500/15 border border-amber-500/40" : "bg-background/30"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${m.color}`} />
                    <span className={reached ? "font-semibold" : "text-muted-foreground"}>{m.label}</span>
                    {isCurrent && <Badge variant="outline" className="h-4 px-1 text-[9px]">YOU</Badge>}
                  </div>
                  <span className={reached ? "text-amber-300 font-mono" : "text-muted-foreground font-mono"}>
                    {m.min.toLocaleString()} XP{m.next ? "" : "+"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ============================ PUSH NOTIFICATIONS ============================ */
export function PushNotifSettings() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [prefs, setPrefs] = useState<any>(null);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    supabase.from("app_settings").select("vapid_public_key").eq("id", 1).maybeSingle()
      .then(({ data }) => setVapidKey((data as any)?.vapid_public_key ?? null));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    supabase.from("notification_prefs").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setPrefs(data ?? { user_id: user.id, push_enabled: true, match_starting: true, bet_results: true, withdrawals: true, promotions: true, chat_mentions: true, ticket_replies: true, rewards: true, referrals: true, vip_tier_up: true, daily_streak: true }));
  }, [user?.id]);

  // Live in-page push: subscribe to notifications and trigger Notification when permission granted
  useEffect(() => {
    if (!user || permission !== "granted" || !prefs?.push_enabled) return;
    const ch = supabase.channel(`push-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        const n: any = payload.new;
        try {
          new Notification(n.title || "LSL", { body: n.body ?? "", icon: "/favicon.ico", tag: n.id });
        } catch {}
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, permission, prefs?.push_enabled]);

  async function enable() {
    if (typeof Notification === "undefined") return toast.error("Browser doesn't support notifications");
    const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
    if (inIframe) {
      toast.error("Open the app in a new tab to enable notifications", {
        description: "Browsers block notification prompts inside the Lovable preview iframe. Click the open-in-new-tab icon at the top of the preview, then try again.",
        duration: 8000,
      });
      return;
    }
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") {
      try {
        if ("serviceWorker" in navigator && vapidKey && user) {
          const reg = await navigator.serviceWorker.ready;
          let sub = await reg.pushManager.getSubscription();
          if (!sub) {
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
          }
          const json: any = sub.toJSON();
          await supabase.from("push_subscriptions").upsert({
            user_id: user.id,
            endpoint: json.endpoint,
            p256dh: json.keys?.p256dh ?? "",
            auth_key: json.keys?.auth ?? "",
            user_agent: navigator.userAgent,
            enabled: true,
          }, { onConflict: "endpoint" });
          setSubscribed(true);
          toast.success("Push notifications enabled");
        } else {
          toast.success("Notifications enabled (in-page only — admin hasn't set VAPID keys yet)");
        }
      } catch (err: any) {
        toast.error(err?.message || "Push subscription failed");
      }
    } else {
      toast.error("Permission denied by your browser", {
        description: "You previously blocked notifications for this site. Click the 🔒 icon in your address bar → Site settings → set Notifications to Allow, then reload and try again.",
        duration: 9000,
      });
    }
  }

  async function savePrefs(patch: any) {
    if (!user) return;
    const next = { ...prefs, ...patch, user_id: user.id };
    setPrefs(next);
    await supabase.from("notification_prefs").upsert(next);
  }

  if (!prefs) return null;

  return (
    <Card className="p-6 backdrop-blur-xl bg-card/60 border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {permission === "granted" ? <Bell className="h-5 w-5 text-emerald-300" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
          <h3 className="font-bold text-lg">Notifications</h3>
        </div>
        {permission !== "granted" && <Button size="sm" onClick={enable}>Enable</Button>}
        {permission === "granted" && (
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">{subscribed ? "Push on" : "In-page only"}</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Choose which events trigger a notification. Push works even when the site isn't open.
      </p>
      <div className="flex items-center justify-between text-sm border-b border-border pb-2 mb-2">
        <span className="font-semibold">Master push</span>
        <Switch checked={!!prefs.push_enabled} onCheckedChange={(v) => savePrefs({ push_enabled: v })} />
      </div>
      <div className="space-y-2">
        {[
          ["match_starting", "Matches starting soon"],
          ["bet_results", "Bet won / lost / cashed out"],
          ["rewards", "Token rewards & credits"],
          ["daily_streak", "Daily login streak"],
          ["referrals", "Referral activity"],
          ["vip_tier_up", "VIP tier promotions"],
          ["withdrawals", "Withdrawal updates"],
          ["promotions", "Promotions & challenges"],
          ["chat_mentions", "Chat mentions"],
          ["ticket_replies", "Support ticket replies"],
        ].map(([key, label]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span>{label}</span>
            <Switch checked={!!prefs[key]} onCheckedChange={(v) => savePrefs({ [key]: v })} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/* ============================ USER ANALYTICS ============================ */
export function UserAnalyticsDashboard({ bets }: { bets: any[] }) {
  const stats = useMemo(() => {
    const total = bets.length;
    const won = bets.filter((b) => b.status === "won").length;
    const lost = bets.filter((b) => b.status === "lost").length;
    const settled = won + lost;
    const winRate = settled ? Math.round((won / settled) * 100) : 0;
    const totalStaked = bets.reduce((s, b) => s + Number(b.stake || 0), 0);
    const totalWon = bets.filter((b) => b.status === "won").reduce((s, b) => s + Number(b.potential_payout || 0), 0);
    const net = totalWon - totalStaked;

    // last 30 days series
    const days: Record<string, { date: string; staked: number; won: number; net: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { date: key.slice(5), staked: 0, won: 0, net: 0 };
    }
    bets.forEach((b) => {
      const key = (b.created_at || "").slice(0, 10);
      if (days[key]) {
        days[key].staked += Number(b.stake || 0);
        if (b.status === "won") days[key].won += Number(b.potential_payout || 0);
        days[key].net = days[key].won - days[key].staked;
      }
    });

    const distribution = [
      { name: "Won", value: won, color: "hsl(142 70% 50%)" },
      { name: "Lost", value: lost, color: "hsl(0 70% 55%)" },
      { name: "Open", value: bets.filter((b) => b.status === "open").length, color: "hsl(45 90% 55%)" },
      { name: "Void", value: bets.filter((b) => b.status === "void").length, color: "hsl(0 0% 45%)" },
    ].filter((x) => x.value > 0);

    return { total, won, lost, winRate, totalStaked, totalWon, net, series: Object.values(days), distribution };
  }, [bets]);

  const deep = useMemo(() => {
    // Win rate by day-of-week
    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const dow: { day: string; wins: number; losses: number; rate: number }[] =
      dayNames.map((day) => ({ day, wins: 0, losses: 0, rate: 0 }));
    bets.forEach((b) => {
      if (!b.created_at) return;
      const d = new Date(b.created_at).getDay();
      if (b.status === "won") dow[d].wins++;
      else if (b.status === "lost") dow[d].losses++;
    });
    dow.forEach((x) => { const t = x.wins + x.losses; x.rate = t ? Math.round((x.wins / t) * 100) : 0; });

    // Best 5 days by net
    const best = [...stats.series]
      .filter((s) => s.staked > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, 5);

    // 12-week heatmap: 7 rows x 12 cols, intensity by bet count
    const weeks = 12;
    const cells: { date: string; count: number; net: number; dow: number; week: number }[] = [];
    const today = new Date(); today.setHours(0,0,0,0);
    const start = new Date(today); start.setDate(start.getDate() - (weeks * 7 - 1));
    // align start to a Sunday
    start.setDate(start.getDate() - start.getDay());
    const byDay: Record<string, { count: number; net: number }> = {};
    bets.forEach((b) => {
      const key = (b.created_at || "").slice(0,10);
      if (!byDay[key]) byDay[key] = { count: 0, net: 0 };
      byDay[key].count++;
      byDay[key].net += (b.status === "won" ? Number(b.potential_payout||0) : 0) - Number(b.stake||0);
    });
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
        const key = dt.toISOString().slice(0,10);
        const v = byDay[key] ?? { count: 0, net: 0 };
        cells.push({ date: key, count: v.count, net: v.net, dow: d, week: w });
      }
    }
    const maxCount = Math.max(1, ...cells.map((c) => c.count));
    return { dow, best, cells, maxCount };
  }, [bets, stats.series]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Win rate" value={`${stats.winRate}%`} icon={Award} accent="emerald" />
        <MiniStat label="Total bets" value={stats.total.toLocaleString()} icon={Activity} />
        <MiniStat label="Staked" value={stats.totalStaked.toLocaleString()} icon={TrendingDown} />
        <MiniStat label="Net" value={(stats.net >= 0 ? "+" : "") + stats.net.toLocaleString()} icon={TrendingUp} accent={stats.net >= 0 ? "emerald" : "danger"} />
      </div>

      <Card className="p-5 backdrop-blur-xl bg-card/60 border-primary/20">
        <div className="text-sm font-bold mb-3">Performance · last 30 days</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Line type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="staked" stroke="hsl(var(--muted-foreground))" strokeWidth={1} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 backdrop-blur-xl bg-card/60 border-primary/20">
          <div className="text-sm font-bold mb-3">Bet outcomes</div>
          <div className="h-56">
            {stats.distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.distribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} label>
                    {stats.distribution.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full grid place-items-center text-xs text-muted-foreground">No data yet</div>}
          </div>
        </Card>
        <Card className="p-5 backdrop-blur-xl bg-card/60 border-primary/20">
          <div className="text-sm font-bold mb-3">Daily stake</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.series.slice(-14)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="staked" fill="hsl(var(--primary))" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 backdrop-blur-xl bg-card/60 border-primary/20">
          <div className="text-sm font-bold mb-3">Win rate by day of week</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deep.dow}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} unit="%" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="rate" fill="hsl(142 70% 50%)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 backdrop-blur-xl bg-card/60 border-primary/20">
          <div className="text-sm font-bold mb-3">Best days</div>
          {deep.best.length === 0 ? (
            <p className="text-xs text-muted-foreground">No profitable days yet.</p>
          ) : (
            <div className="space-y-2">
              {deep.best.map((d) => (
                <div key={d.date} className="flex items-center justify-between text-sm border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground">{d.date}</span>
                  <span className={`font-bold ${d.net >= 0 ? "text-emerald-300" : "text-destructive"}`}>
                    {d.net >= 0 ? "+" : ""}{d.net.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5 backdrop-blur-xl bg-card/60 border-primary/20">
        <div className="text-sm font-bold mb-3">Betting heatmap · last 12 weeks</div>
        <div className="flex gap-1 overflow-x-auto">
          <div className="grid grid-rows-7 gap-1 text-[9px] text-muted-foreground pr-1">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="h-3 leading-3">{d}</div>)}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {deep.cells.map((c) => {
              const intensity = c.count === 0 ? 0 : Math.min(1, c.count / deep.maxCount);
              const bg = c.count === 0
                ? "bg-secondary/40"
                : c.net >= 0 ? "bg-emerald-500" : "bg-destructive";
              return (
                <div key={c.date} title={`${c.date} · ${c.count} bet(s) · net ${c.net >= 0 ? "+" : ""}${c.net}`}
                  className={`h-3 w-3 rounded-sm ${bg}`} style={{ opacity: c.count === 0 ? 0.35 : 0.35 + intensity * 0.65 }} />
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-3">
          <span>Less</span>
          <div className="h-2 w-2 rounded-sm bg-secondary/40" />
          <div className="h-2 w-2 rounded-sm bg-emerald-500/40" />
          <div className="h-2 w-2 rounded-sm bg-emerald-500/70" />
          <div className="h-2 w-2 rounded-sm bg-emerald-500" />
          <span>More wins</span>
          <span className="ml-3">·</span>
          <div className="h-2 w-2 rounded-sm bg-destructive/50" />
          <span>Net loss</span>
        </div>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, accent }: any) {
  const tone = accent === "emerald" ? "text-emerald-300" : accent === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4 backdrop-blur-xl bg-card/60 border-primary/20">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className={`text-xl font-extrabold mt-0.5 ${tone}`}>{value}</div>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground/40" />
      </div>
    </Card>
  );
}

/* ============================ BET HISTORY ADVANCED ============================ */
export function BetHistoryAdvanced({ bets, onOpen }: { bets: any[]; onOpen?: (b: any) => void }) {
  const [status, setStatus] = useState<string>("all");
  const [range, setRange] = useState<string>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const filtered = useMemo(() => {
    const now = Date.now();
    return bets.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (range !== "all") {
        const days = range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 0;
        if (days && (now - new Date(b.created_at).getTime()) > days * 24 * 60 * 60 * 1000) return false;
      }
      if (q) {
        const hay = `${b.tracking_id} ${b.booking_code} ${(b.bet_selections ?? []).map((s: any) => s.matches?.name || s.selection_label).join(" ")}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [bets, status, range, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    const won = filtered.filter((b) => b.status === "won");
    const lost = filtered.filter((b) => b.status === "lost");
    const stakedTotal = filtered.reduce((s, b) => s + Number(b.stake || 0), 0);
    const wonTotal = won.reduce((s, b) => s + Number(b.potential_payout || 0), 0);
    return {
      total: filtered.length,
      staked: stakedTotal,
      won: wonTotal,
      net: wonTotal - stakedTotal,
      winRate: (won.length + lost.length) ? Math.round((won.length / (won.length + lost.length)) * 100) : 0,
    };
  }, [filtered]);

  return (
    <Card className="p-5 backdrop-blur-xl bg-card/60 border-primary/20">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h3 className="font-bold">Bet History</h3></div>
        <div className="text-xs text-muted-foreground">{filtered.length} of {bets.length}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mb-4">
        <div className="rounded-lg border border-primary/20 p-2"><div className="text-[9px] uppercase text-muted-foreground">Bets</div><div className="font-bold">{summary.total}</div></div>
        <div className="rounded-lg border border-primary/20 p-2"><div className="text-[9px] uppercase text-muted-foreground">Staked</div><div className="font-bold">{summary.staked.toLocaleString()}</div></div>
        <div className="rounded-lg border border-primary/20 p-2"><div className="text-[9px] uppercase text-muted-foreground">Won</div><div className="font-bold text-emerald-300">{summary.won.toLocaleString()}</div></div>
        <div className="rounded-lg border border-primary/20 p-2"><div className="text-[9px] uppercase text-muted-foreground">Net</div><div className={`font-bold ${summary.net >= 0 ? "text-emerald-300" : "text-destructive"}`}>{(summary.net >= 0 ? "+" : "") + summary.net.toLocaleString()}</div></div>
        <div className="rounded-lg border border-primary/20 p-2"><div className="text-[9px] uppercase text-muted-foreground">Win rate</div><div className="font-bold">{summary.winRate}%</div></div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
            <SelectItem value="void">Void</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={(v) => { setRange(v); setPage(1); }}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search code, match…" className="pl-8 h-9" />
        </div>
      </div>

      <div className="space-y-2">
        {paged.length === 0 && <p className="text-muted-foreground text-sm py-6 text-center">No bets match these filters.</p>}
        {paged.map((b) => (
          <button key={b.id} type="button" onClick={() => onOpen?.(b)} className="w-full text-left">
            <Card className="p-3 hover:border-primary/60 transition">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-primary">{b.tracking_id}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{b.booking_code}</span>
                  </div>
                  <div className="font-semibold text-sm mt-0.5">{(b.bet_selections ?? []).length} sel · stake {Number(b.stake).toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{(b.bet_selections ?? []).map((s: any) => s.matches?.name || s.selection_label).join(" · ")}</div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className={
                    b.status === 'won' ? 'border-emerald-500/50 text-emerald-300' :
                    b.status === 'lost' ? 'border-destructive/50 text-destructive' :
                    b.status === 'suspended' ? 'border-amber-500/50 text-amber-300' :
                    b.status === 'void' ? 'border-muted-foreground/50 text-muted-foreground' :
                    'border-primary/50 text-primary'
                  }>{b.status.toUpperCase()}</Badge>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(b.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
        </div>
      )}
    </Card>
  );
}

/* ============================ GANG EMBLEM UPLOAD ============================ */
export function GangEmblemUpload() {
  const { user, profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [latest, setLatest] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("gang_emblems").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLatest(data));
  }, [user?.id]);

  async function handleFile(f: File) {
    if (!user) return;
    if (!f.type.startsWith("image/")) return toast.error("Image only");
    if (f.size > 2 * 1024 * 1024) return toast.error("Max 2MB");
    setUploading(true);
    const path = `${user.id}/${Date.now()}-${f.name}`;
    const { error: upErr } = await supabase.storage.from("gang-emblems").upload(path, f, { upsert: true });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const url = supabase.storage.from("gang-emblems").getPublicUrl(path).data.publicUrl;
    const { error, data } = await supabase.from("gang_emblems").insert({ user_id: user.id, image_url: url }).select().maybeSingle();
    setUploading(false);
    if (error) return toast.error(error.message);
    setLatest(data);
    toast.success(data?.status === "approved" ? "Emblem approved instantly!" : "Submitted for admin review");
  }

  return (
    <Card className="p-6 backdrop-blur-xl bg-card/60 border-primary/20">
      <div className="flex items-center gap-2 mb-3"><ImageIcon className="h-5 w-5 text-primary" /><h3 className="font-bold text-lg">Gang Emblem</h3></div>
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-2xl border-2 border-dashed border-primary/40 grid place-items-center overflow-hidden bg-background/40">
          {profile?.gang_emblem_url
            ? <img src={profile.gang_emblem_url} alt="emblem" className="h-full w-full object-cover" />
            : <ImageIcon className="h-7 w-7 text-muted-foreground/40" />}
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-2">Square image, max 2MB. Shown next to your name in chat & leaderboards.</p>
          <label className="inline-block">
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button asChild disabled={uploading}><span><Upload className="h-4 w-4 mr-1" />{uploading ? "Uploading…" : "Upload emblem"}</span></Button>
          </label>
          {latest && (
            <div className="mt-2 text-xs">
              <Badge variant="outline" className={
                latest.status === "approved" ? "border-emerald-500/50 text-emerald-300" :
                latest.status === "rejected" ? "border-destructive/50 text-destructive" :
                "border-amber-500/50 text-amber-300"
              }>{latest.status.toUpperCase()}</Badge>
              {latest.admin_note && <span className="ml-2 text-muted-foreground">{latest.admin_note}</span>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
