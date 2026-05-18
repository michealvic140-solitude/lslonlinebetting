import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, Activity, TrendingUp, TrendingDown, Wallet, Users, Image as ImageIcon, Crown, Gift, RefreshCw, Bell, Send, Coins, Sparkles, FileDown, Heart, Bot, Loader2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { useServerFn } from "@tanstack/react-start";
import { adminAiChat } from "@/lib/admin-ai.functions";
import { generateVapidKeys } from "@/lib/vapid.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

/* =============== STREAK / LOGIN / PUSH SETTINGS =============== */
export function StreakAndPushPanel() {
  const [s, setS] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [generatedPriv, setGeneratedPriv] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const genVapid = useServerFn(generateVapidKeys);

  async function load() {
    const { data } = await supabase.from("app_settings")
      .select("daily_login_enabled, daily_login_base_reward, daily_login_bonus_per_day, daily_login_max_streak, vapid_public_key, vapid_subject, push_endpoint_url")
      .eq("id", 1).maybeSingle();
    setS(data ?? {});
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const { error } = await supabase.from("app_settings").update(s).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Saved (audit log recorded)");
  }

  async function verifyXp() {
    setVerifying(true);
    const { data, error } = await supabase.rpc("verify_xp_consistency", { _user_id: undefined });
    setVerifying(false);
    if (error) toast.error(error.message); else toast.success(`Checked ${(data as any)?.checked ?? 0} users · fixed ${(data as any)?.fixed ?? 0}`);
  }

  async function generate() {
    setGenLoading(true);
    try {
      const res = await genVapid();
      if ((res as any)?.error) {
        toast.error((res as any).error);
        return;
      }
      if (!res?.privateKey) {
        toast.error("Server returned no private key. Check server logs.");
        return;
      }
      setS((prev: any) => ({ ...prev, vapid_public_key: res.publicKey, vapid_subject: prev?.vapid_subject || "mailto:admin@lomitashootersleague.com" }));
      setGeneratedPriv(res.privateKey ?? null);
      toast.success("VAPID keys generated. Copy the private key from the dialog.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate VAPID keys");
    } finally { setGenLoading(false); }
  }

  if (!s) return null;
  const example = (s.daily_login_base_reward || 0) * (1 + Math.min(s.daily_login_max_streak || 0, 30) * (Number(s.daily_login_bonus_per_day) || 0));

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><Gift className="h-5 w-5 text-amber-300" /><div className="font-bold">Daily login streak</div></div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Claims enabled</span>
          <Switch checked={!!s.daily_login_enabled} onCheckedChange={(v) => setS({ ...s, daily_login_enabled: v })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Base reward (tokens)</label>
            <Input type="number" value={s.daily_login_base_reward ?? 0} onChange={(e) => setS({ ...s, daily_login_base_reward: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Bonus per day (e.g. 0.10 = +10%)</label>
            <Input type="number" step="0.01" value={s.daily_login_bonus_per_day ?? 0} onChange={(e) => setS({ ...s, daily_login_bonus_per_day: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Max streak cap (days)</label>
            <Input type="number" value={s.daily_login_max_streak ?? 30} onChange={(e) => setS({ ...s, daily_login_max_streak: Number(e.target.value) })} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Day 1 = base. At cap a user earns <span className="font-bold text-amber-300">{Math.round(example).toLocaleString()}</span> tokens per claim.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /><div className="font-bold">Web push (VAPID)</div></div>
        <p className="text-[11px] text-muted-foreground">Click <strong>Generate keys</strong> to create a VAPID pair on the server. The public key is saved automatically — copy the private key and paste it into the <span className="font-mono">VAPID_PRIVATE_KEY</span> backend secret.</p>
        <Button onClick={generate} disabled={genLoading} variant="outline">{genLoading ? "Generating…" : "Generate keys"}</Button>
        <Dialog open={!!generatedPriv} onOpenChange={(o) => { if (!o) setGeneratedPriv(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>VAPID private key (one-time)</DialogTitle>
              <DialogDescription>
                Copy this now. It will <strong>never</strong> be shown again. Paste it into your backend secret named <span className="font-mono">VAPID_PRIVATE_KEY</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-amber-300">Public key (saved automatically)</div>
              <code className="text-xs break-all block font-mono p-2 rounded bg-muted">{s?.vapid_public_key}</code>
              <div className="text-[10px] uppercase tracking-widest text-amber-300">Private key</div>
              <code className="text-xs break-all block font-mono p-2 rounded bg-amber-500/10 border border-amber-500/40">{generatedPriv}</code>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { if (generatedPriv) { navigator.clipboard.writeText(generatedPriv); toast.success("Private key copied"); } }}>Copy private key</Button>
              <Button onClick={() => setGeneratedPriv(null)}>I've saved it</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">VAPID public key</label>
          <Input value={s.vapid_public_key ?? ""} onChange={(e) => setS({ ...s, vapid_public_key: e.target.value })} placeholder="BNc..." />
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">VAPID subject (mailto:)</label>
          <Input value={s.vapid_subject ?? ""} onChange={(e) => setS({ ...s, vapid_subject: e.target.value })} placeholder="mailto:admin@example.com" />
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">Push delivery endpoint URL</label>
          <Input value={s.push_endpoint_url ?? ""} onChange={(e) => setS({ ...s, push_endpoint_url: e.target.value })} placeholder="https://your-site.lovable.app/api/public/hooks/send-push" />
          <p className="text-[10px] text-muted-foreground mt-1">When a notification is created, the server calls this URL to deliver pushes. Leave empty to disable push delivery.</p>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-emerald-300" /><div className="font-bold">XP / VIP integrity</div></div>
        <p className="text-xs text-muted-foreground">Recomputes every user's XP from their actual bets, wins, and referrals. Fixes drift and re-applies the right VIP tier. Runs nightly automatically.</p>
        <Button onClick={verifyXp} disabled={verifying} variant="outline">{verifying ? "Verifying…" : "Verify now"}</Button>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} className="btn-luxury">Save settings</Button>
      </div>
    </div>
  );
}


/* =============== RISK & EXPOSURE =============== */
export function RiskPanel() {
  const [s, setS] = useState<any>(null);
  const [exposure, setExposure] = useState<any[]>([]);
  const [paused, setPaused] = useState(false);
  const [reason, setReason] = useState("");
  const [warnPct, setWarnPct] = useState(70);

  async function load() {
    const [{ data: rs }, { data: ex }, { data: ap }] = await Promise.all([
      supabase.rpc("admin_risk_summary"),
      supabase.rpc("admin_exposure_per_match"),
      supabase.from("app_settings").select("exposure_warn_pct, house_low_balance").eq("id", 1).maybeSingle(),
    ]);
    setS(rs);
    setExposure((ex as any) ?? []);
    setPaused((rs as any)?.payouts_paused ?? false);
    setWarnPct((ap as any)?.exposure_warn_pct ?? 70);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function togglePause() {
    const { error } = await supabase.rpc("house_set_paused", { _paused: !paused, _reason: reason || undefined });
    if (error) return toast.error(error.message);
    toast.success(!paused ? "Payouts paused globally" : "Payouts resumed");
    load();
  }

  if (!s) return <div className="text-sm text-muted-foreground">Loading risk data…</div>;

  const balance = Number(s.house_balance || 0);
  const exposureTotal = Number(s.total_exposure || 0);
  const exposureRatio = balance > 0 ? Math.round((exposureTotal / balance) * 100) : 999;
  const danger = exposureRatio >= warnPct;
  const lowBalance = balance < (Number(s.house_low_balance ?? 1_000_000));

  return (
    <div className="space-y-4">
      {(danger || lowBalance) && (
        <Card className="p-4 border-destructive/50 bg-destructive/10">
          <div className="flex items-center gap-2 text-destructive font-bold"><AlertTriangle className="h-5 w-5" />Risk Alert</div>
          <ul className="text-sm mt-2 space-y-1">
            {danger && <li>Exposure is {exposureRatio}% of house wallet (warn ≥{warnPct}%).</li>}
            {lowBalance && <li>House wallet is below low-balance threshold.</li>}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RiskStat label="House balance" value={balance.toLocaleString()} icon={Wallet} accent={lowBalance ? "danger" : "primary"} />
        <RiskStat label="Total exposure" value={exposureTotal.toLocaleString()} icon={Activity} accent={danger ? "danger" : "default"} />
        <RiskStat label="Exposure %" value={`${exposureRatio}%`} icon={TrendingUp} accent={danger ? "danger" : "emerald"} />
        <RiskStat label="Open bets" value={String(s.open_bets || 0)} icon={Users} />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-bold">Global payout pause</div>
            <div className="text-xs text-muted-foreground">Stops cashouts and admin pay-winnings until resumed.</div>
          </div>
          <Switch checked={paused} onCheckedChange={() => togglePause()} />
        </div>
        {paused && <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />}
      </Card>

      <Card className="p-5">
        <div className="font-bold mb-3 flex items-center justify-between">Exposure by match
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3 w-3" /></Button>
        </div>
        {exposure.length === 0 ? (
          <p className="text-xs text-muted-foreground">No open exposure right now.</p>
        ) : (
          <div className="space-y-2">
            {exposure.map((m: any) => (
              <div key={m.match_id} className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{m.match_name}</div>
                  <div className="text-[11px] text-muted-foreground">{m.bet_count} open bets</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-amber-300">{Number(m.exposure).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="font-bold mb-2">Pending withdrawals</div>
        <Badge variant="outline" className="text-amber-300 border-amber-500/40">{s.pending_withdrawals} pending</Badge>
      </Card>
    </div>
  );
}

function RiskStat({ label, value, icon: Icon, accent }: any) {
  const tone = accent === "danger" ? "text-destructive" : accent === "emerald" ? "text-emerald-300" : accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <Card className="p-4">
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

/* =============== P&L DASHBOARD =============== */
export function PnLPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [topUsers, setTopUsers] = useState<any[]>([]);

  async function load() {
    const { data: pnl } = await supabase.rpc("admin_pnl_summary", { _days: days });
    setData(pnl);
    // build daily series from house_transactions
    const since = new Date(); since.setDate(since.getDate() - days);
    const { data: tx } = await supabase.from("house_transactions").select("kind, amount, created_at").gte("created_at", since.toISOString());
    const buckets: Record<string, { date: string; in: number; out: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key.slice(5), in: 0, out: 0 };
    }
    (tx ?? []).forEach((t: any) => {
      const k = t.created_at.slice(0, 10);
      if (!buckets[k]) return;
      if (t.amount > 0) buckets[k].in += Number(t.amount);
      else buckets[k].out += Math.abs(Number(t.amount));
    });
    setSeries(Object.values(buckets));

    // top users by stake
    const { data: bets } = await supabase.from("bets").select("user_id, stake, status, potential_payout").gte("created_at", since.toISOString());
    const byUser: Record<string, { user_id: string; staked: number; won: number }> = {};
    (bets ?? []).forEach((b: any) => {
      if (!byUser[b.user_id]) byUser[b.user_id] = { user_id: b.user_id, staked: 0, won: 0 };
      byUser[b.user_id].staked += Number(b.stake);
      if (b.status === "won") byUser[b.user_id].won += Number(b.potential_payout);
    });
    const top = Object.values(byUser).sort((a, b) => b.staked - a.staked).slice(0, 10);
    if (top.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, ingame_name").in("id", top.map((x) => x.user_id));
      const map: any = {}; (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      setTopUsers(top.map((u) => ({ ...u, profile: map[u.user_id] })));
    } else setTopUsers([]);
  }
  useEffect(() => { load(); }, [days]);

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const net = Number(data.net || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[7, 30, 90, 365].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d}d</Button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RiskStat label="Stakes in" value={Number(data.stakes_in).toLocaleString()} icon={TrendingDown} />
        <RiskStat label="Payouts out" value={Number(data.payouts_out).toLocaleString()} icon={TrendingUp} />
        <RiskStat label="Net P&L" value={(net >= 0 ? "+" : "") + net.toLocaleString()} icon={Wallet} accent={net >= 0 ? "emerald" : "danger"} />
        <RiskStat label="Bets / Wins" value={`${data.bets} / ${data.wins}`} icon={Activity} />
      </div>

      <Card className="p-5">
        <div className="font-bold mb-3">Daily flow</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="in" fill="hsl(142 70% 45%)" radius={2} />
              <Bar dataKey="out" fill="hsl(0 70% 55%)" radius={2} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-bold mb-3">Top users by stake (last {days}d)</div>
        <div className="space-y-2">
          {topUsers.length === 0 && <p className="text-xs text-muted-foreground">No data.</p>}
          {topUsers.map((u, i) => (
            <div key={u.user_id} className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-5">#{i + 1}</span>
                <span className="font-semibold text-sm">{u.profile?.ingame_name || u.profile?.full_name || u.user_id.slice(0, 8)}</span>
              </div>
              <div className="text-right text-xs">
                <div className="font-bold">{u.staked.toLocaleString()}</div>
                <div className="text-emerald-300">+{u.won.toLocaleString()} won</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ===================== TOKEN RULES PANEL ===================== */
export function TokenRulesPanel() {
  const [s, setS] = useState<any>(null);
  async function load() {
    const { data } = await supabase.from("app_settings")
      .select("xp_per_bet,xp_per_win,xp_per_login,xp_per_referral,referral_bonus_referrer,referral_bonus_referee,challenge_reward_multiplier,vip_token_multipliers,spin_enabled,spin_min_reward,spin_max_reward,spin_cooldown_hours,gift_enabled,gift_daily_limit,gift_min_amount,gift_max_per_tx,gift_fee_pct,friends_enabled,min_stake,max_payout,min_selections_per_ticket,max_selections_per_ticket")
      .eq("id", 1).maybeSingle();
    setS(data ?? {});
  }
  useEffect(() => { load(); }, []);
  async function save() {
    const { error } = await supabase.from("app_settings").update(s).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Token rules saved");
  }
  if (!s) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const tiers = ["bronze", "silver", "gold", "platinum", "legend"];
  const mults = s.vip_token_multipliers ?? {};
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><Coins className="h-5 w-5 text-amber-300" /><div className="font-bold">Token Rewards Rules Engine</div></div>
        <p className="text-xs text-muted-foreground">Central control for every multiplier and cap that affects how many tokens users earn.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-bold text-sm">XP per action</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[["xp_per_bet","Bet placed"],["xp_per_win","Bet won"],["xp_per_login","Daily login"],["xp_per_referral","Referral"]].map(([k,l]) => (
            <div key={k}><label className="text-[10px] uppercase text-muted-foreground">{l}</label><Input type="number" value={s[k] ?? 0} onChange={(e)=>setS({...s,[k]:Number(e.target.value)})} /></div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-bold text-sm">Referral bonuses (tokens)</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] uppercase text-muted-foreground">Referrer bonus</label><Input type="number" value={s.referral_bonus_referrer ?? 0} onChange={(e)=>setS({...s,referral_bonus_referrer:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Referee bonus</label><Input type="number" value={s.referral_bonus_referee ?? 0} onChange={(e)=>setS({...s,referral_bonus_referee:Number(e.target.value)})} /></div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-bold text-sm">Challenge reward multiplier</div>
        <div><label className="text-[10px] uppercase text-muted-foreground">Multiplier (1.0 = no change, 1.5 = +50%)</label><Input type="number" step="0.05" value={s.challenge_reward_multiplier ?? 1} onChange={(e)=>setS({...s,challenge_reward_multiplier:Number(e.target.value)})} /></div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-bold text-sm">VIP tier token multipliers</div>
        <p className="text-[11px] text-muted-foreground">Applied to spin rewards (and any other VIP-aware payout). Example: gold = 1.10 means +10%.</p>
        <div className="grid grid-cols-5 gap-3">
          {tiers.map((t) => (
            <div key={t}>
              <label className="text-[10px] uppercase text-muted-foreground capitalize">{t}</label>
              <Input type="number" step="0.05" value={mults[t] ?? 1} onChange={(e) => setS({ ...s, vip_token_multipliers: { ...mults, [t]: Number(e.target.value) } })} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between"><div className="font-bold text-sm">Daily Spin Wheel</div>
          <label className="flex items-center gap-2 text-xs"><Switch checked={!!s.spin_enabled} onCheckedChange={(v)=>setS({...s,spin_enabled:v})} />Enabled</label></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-[10px] uppercase text-muted-foreground">Min reward</label><Input type="number" value={s.spin_min_reward ?? 0} onChange={(e)=>setS({...s,spin_min_reward:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Max reward</label><Input type="number" value={s.spin_max_reward ?? 0} onChange={(e)=>setS({...s,spin_max_reward:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Cooldown (hours)</label><Input type="number" value={s.spin_cooldown_hours ?? 24} onChange={(e)=>setS({...s,spin_cooldown_hours:Number(e.target.value)})} /></div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between"><div className="font-bold text-sm">Token Gifts (P2P)</div>
          <label className="flex items-center gap-2 text-xs"><Switch checked={!!s.gift_enabled} onCheckedChange={(v)=>setS({...s,gift_enabled:v})} />Enabled</label></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label className="text-[10px] uppercase text-muted-foreground">Daily limit / sender</label><Input type="number" value={s.gift_daily_limit ?? 0} onChange={(e)=>setS({...s,gift_daily_limit:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Min per gift</label><Input type="number" value={s.gift_min_amount ?? 0} onChange={(e)=>setS({...s,gift_min_amount:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Max per gift</label><Input type="number" value={s.gift_max_per_tx ?? 0} onChange={(e)=>setS({...s,gift_max_per_tx:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Fee % (0-100)</label><Input type="number" step="0.5" value={s.gift_fee_pct ?? 0} onChange={(e)=>setS({...s,gift_fee_pct:Number(e.target.value)})} /></div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between"><div className="font-bold text-sm">Friends / Follow system</div>
          <label className="flex items-center gap-2 text-xs"><Switch checked={!!s.friends_enabled} onCheckedChange={(v)=>setS({...s,friends_enabled:v})} />Enabled</label></div>
        <p className="text-xs text-muted-foreground">When disabled, users cannot follow each other or see friend feeds.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-bold text-sm">Bet limits</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label className="text-[10px] uppercase text-muted-foreground">Min stake</label><Input type="number" value={s.min_stake ?? 0} onChange={(e)=>setS({...s,min_stake:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Max payout</label><Input type="number" value={s.max_payout ?? 0} onChange={(e)=>setS({...s,max_payout:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Min selections / ticket</label><Input type="number" min={1} value={s.min_selections_per_ticket ?? 3} onChange={(e)=>setS({...s,min_selections_per_ticket:Number(e.target.value)})} /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Max selections / ticket</label><Input type="number" min={1} value={s.max_selections_per_ticket ?? 20} onChange={(e)=>setS({...s,max_selections_per_ticket:Number(e.target.value)})} /></div>
        </div>
        <p className="text-[10px] text-muted-foreground">Controls how many bets (selections) a user must combine on a single ticket.</p>
      </Card>

      <Button onClick={save} className="bg-gradient-gold text-primary-foreground"><Sparkles className="h-3 w-3 mr-1" />Save all rules</Button>
    </div>
  );
}

/* ===================== BROADCAST PANEL ===================== */
export function BroadcastPanel() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [segment, setSegment] = useState<"all" | "vip" | "admins">("all");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(30);
    setHistory(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function send() {
    if (!title.trim()) { toast.error("Title required"); return; }
    setSending(true);
    const { data, error } = await supabase.rpc("admin_broadcast", { _title: title, _body: body || "", _link: link || "", _segment: segment });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Sent to ${(data as any)?.sent ?? 0} users`);
    setTitle(""); setBody(""); setLink(""); load();
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" /><div className="font-bold">Broadcast notification</div></div>
        <Input placeholder="Title (e.g. Season 5 starts tonight!)" value={title} onChange={(e)=>setTitle(e.target.value)} />
        <Textarea placeholder="Message body" value={body} onChange={(e)=>setBody(e.target.value)} rows={3} />
        <Input placeholder="Optional link (/matches, /dashboard …)" value={link} onChange={(e)=>setLink(e.target.value)} />
        <div className="flex items-center gap-2 flex-wrap">
          {(["all","vip","admins"] as const).map((s) => (
            <Button key={s} size="sm" variant={segment === s ? "default" : "outline"} onClick={()=>setSegment(s)}>{s.toUpperCase()}</Button>
          ))}
          <Button onClick={send} disabled={sending} className="ml-auto bg-gradient-gold text-primary-foreground">
            {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}Send
          </Button>
        </div>
      </Card>
      <Card className="p-5 space-y-2">
        <div className="font-bold text-sm">Recent broadcasts</div>
        {history.length === 0 && <div className="text-xs text-muted-foreground">No broadcasts yet.</div>}
        {history.map((b) => (
          <div key={b.id} className="flex items-start justify-between gap-2 border-b border-border/50 py-2">
            <div className="min-w-0">
              <div className="text-sm font-bold">{b.title} <Badge variant="outline" className="ml-1 text-[9px] uppercase">{b.segment}</Badge></div>
              {b.body && <div className="text-xs text-muted-foreground line-clamp-2">{b.body}</div>}
            </div>
            <div className="text-xs text-right shrink-0">
              <div className="font-bold gradient-gold-text">{b.sent_count}</div>
              <div className="text-[10px] text-muted-foreground">{new Date(b.created_at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ===================== ACTIVITY / SESSIONS PANEL ===================== */
export function ActivityPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  async function load() {
    const { data } = await supabase.from("user_sessions").select("*").order("last_seen", { ascending: false }).limit(100);
    setRows(data ?? []);
    const ids = (data ?? []).map((r:any)=>r.user_id);
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id,full_name,email,vip_tier,gang_name").in("id", ids);
      const map: Record<string, any> = {}; (p ?? []).forEach((x:any) => { map[x.id] = x; }); setProfiles(map);
    }
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  const onlineThreshold = Date.now() - 2 * 60 * 1000;
  const online = rows.filter((r) => new Date(r.last_seen).getTime() > onlineThreshold);
  return (
    <div className="space-y-4">
      <Card className="p-5 flex items-center gap-3">
        <Activity className="h-5 w-5 text-emerald-400" />
        <div><div className="font-bold">Live user activity</div><div className="text-xs text-muted-foreground">Updates every 15s · {online.length} online now / {rows.length} tracked</div></div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={load}><RefreshCw className="h-3 w-3 mr-1" />Refresh</Button>
      </Card>
      <Card className="p-3">
        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {rows.map((r) => {
            const p = profiles[r.user_id]; const isOn = new Date(r.last_seen).getTime() > onlineThreshold;
            return (
              <div key={r.user_id} className="flex items-center gap-3 py-2 border-b border-border/50">
                <span className={`h-2.5 w-2.5 rounded-full ${isOn ? "bg-emerald-400 animate-pulse" : "bg-muted"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{p?.full_name ?? "—"} <span className="text-xs text-muted-foreground">{p?.email}</span></div>
                  <div className="text-[11px] text-muted-foreground truncate">{r.route ?? "—"} · {r.user_agent?.slice(0,60) ?? "—"}</div>
                </div>
                <Badge variant="outline" className="capitalize">{p?.vip_tier ?? "bronze"}</Badge>
                <div className="text-[10px] text-muted-foreground w-24 text-right">{new Date(r.last_seen).toLocaleTimeString()}</div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="text-center text-sm text-muted-foreground py-6">No activity recorded yet.</div>}
        </div>
      </Card>
    </div>
  );
}

/* ===================== FINANCIAL REPORTS PANEL ===================== */
export function ReportsPanel() {
  const [days, setDays] = useState(30);
  const [pnl, setPnl] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.rpc("admin_pnl_summary", { _days: days });
    setPnl(data);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data: bets } = await supabase.from("bets").select("created_at,stake,potential_payout,status,settled_at").gte("created_at", since);
    const buckets: Record<string, { in: number; out: number }> = {};
    (bets ?? []).forEach((b: any) => {
      const day = b.created_at.slice(0, 10);
      buckets[day] = buckets[day] ?? { in: 0, out: 0 };
      buckets[day].in += b.stake;
      if (b.status === "won") buckets[day].out += b.potential_payout;
    });
    setSeries(Object.entries(buckets).map(([date, v]) => ({ date, stakes: v.in, payouts: v.out, net: v.in - v.out })).sort((a,b) => a.date.localeCompare(b.date)));
  }
  useEffect(() => { load(); }, [days]);

  function exportCsv() {
    const header = "date,stakes,payouts,net\n";
    const rows = series.map((r) => `${r.date},${r.stakes},${r.payouts},${r.net}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `lsl-report-${days}d.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 flex items-center gap-3 flex-wrap">
        <FileDown className="h-5 w-5 text-primary" />
        <div><div className="font-bold">Financial reports</div><div className="text-xs text-muted-foreground">Stakes vs payouts · net house P&amp;L</div></div>
        <div className="ml-auto flex gap-2 items-center">
          {[7,14,30,90].map((d) => <Button key={d} size="sm" variant={days===d?"default":"outline"} onClick={()=>setDays(d)}>{d}d</Button>)}
          <Button size="sm" onClick={exportCsv}><FileDown className="h-3 w-3 mr-1" />Export CSV</Button>
        </div>
      </Card>
      {pnl && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4"><div className="text-[10px] uppercase text-muted-foreground">Stakes in</div><div className="text-2xl font-bold gradient-gold-text">{Number(pnl.stakes_in).toLocaleString()}</div></Card>
          <Card className="p-4"><div className="text-[10px] uppercase text-muted-foreground">Payouts out</div><div className="text-2xl font-bold text-amber-300">{Number(pnl.payouts_out).toLocaleString()}</div></Card>
          <Card className="p-4"><div className="text-[10px] uppercase text-muted-foreground">Net (house)</div><div className={`text-2xl font-bold ${pnl.net>=0?"text-emerald-400":"text-destructive"}`}>{Number(pnl.net).toLocaleString()}</div></Card>
          <Card className="p-4"><div className="text-[10px] uppercase text-muted-foreground">Bets · wins</div><div className="text-2xl font-bold">{pnl.bets} · {pnl.wins}</div></Card>
        </div>
      )}
      <Card className="p-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Line type="monotone" dataKey="stakes" stroke="hsl(var(--primary))" />
            <Line type="monotone" dataKey="payouts" stroke="hsl(var(--destructive))" />
            <Line type="monotone" dataKey="net" stroke="hsl(var(--accent))" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

/* ===================== ADMIN AI PANEL (LIVE) ===================== */
type AiAction = { name: string; args: any; result: any; error?: string };
type AiMsg = { role: "user" | "assistant"; content: string; actions?: AiAction[] };

export function AdminAILivePanel() {
  const ask = useServerFn(adminAiChat);
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string>("google/gemini-2.5-flash");

  async function send() {
    const text = input.trim();
    if (!text) return;
    const next: AiMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next); setInput(""); setLoading(true);
    try {
      const res: any = await ask({
        data: { messages: next.map(({ role, content }) => ({ role, content })), model },
      });
      if (res?.error) {
        toast.error(res.error);
        setMessages([...next, { role: "assistant", content: `⚠️ ${res.error}`, actions: res.actions ?? [] }]);
        return;
      }
      const { reply, actions } = res;
      setMessages([...next, { role: "assistant", content: reply || "(no reply)", actions: actions ?? [] }]);
    } catch (e: any) {
      toast.error(e?.message ?? "AI request failed");
    } finally { setLoading(false); }
  }

  const quick = [
    "Summarize today's platform health",
    "Show top 5 matches by open exposure",
    "Broadcast: weekend 2x XP event to all users",
    "Find user 'lomita' and credit them 5000 tokens as goodwill",
  ];

  return (
    <div className="space-y-4">
      <Card className="p-5 flex items-center gap-3 flex-wrap bg-gradient-to-br from-card to-primary/5">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/40 to-accent/40 grid place-items-center shadow-gold"><Bot className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0">
          <div className="font-bold flex items-center gap-2">Admin AI Copilot <Badge variant="outline" className="border-accent/50 text-accent text-[10px]">Tool-enabled</Badge></div>
          <div className="text-xs text-muted-foreground">Full admin powers: search, broadcast, refund, ban/mute, house controls, withdrawals, promo reviews.</div>
        </div>
        <select value={model} onChange={(e)=>setModel(e.target.value)} className="ml-auto text-xs bg-background border border-border rounded px-2 py-1">
          <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (fast)</option>
          <option value="google/gemini-2.5-pro">Gemini 2.5 Pro (deep)</option>
          <option value="openai/gpt-5-mini">GPT-5 mini</option>
          <option value="openai/gpt-5">GPT-5 (most capable)</option>
        </select>
      </Card>

      <Card className="p-3 max-h-[55vh] overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-3">
            <div className="text-sm text-muted-foreground">Try a quick prompt:</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {quick.map((q) => <Button key={q} size="sm" variant="outline" onClick={()=>setInput(q)}>{q}</Button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
            <div className={`max-w-[85%] space-y-2 ${m.role==="user"?"":""}`}>
              <div className={`rounded-xl p-3 text-sm whitespace-pre-wrap ${m.role==="user"?"bg-primary/20 text-foreground":"bg-card border border-border"}`}>{m.content}</div>
              {m.actions && m.actions.length > 0 && (
                <details className="rounded-lg border border-accent/30 bg-accent/5 p-2 text-[11px]">
                  <summary className="cursor-pointer flex items-center gap-2 text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-accent" />
                    <span>Used {m.actions.length} admin tool{m.actions.length>1?"s":""}</span>
                    <span className="ml-auto opacity-60">view details</span>
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {m.actions.map((a, j) => (
                      <li key={j} className="flex items-center gap-2">
                        {a.error
                          ? <Badge variant="outline" className="border-destructive/50 text-destructive">error</Badge>
                          : <Badge variant="outline" className="border-accent/50 text-accent">ok</Badge>}
                        <span className="font-mono">{a.name}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="bg-card border border-border rounded-xl p-3 text-sm flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Thinking…</div></div>}
      </Card>

      <Card className="p-3 flex gap-2">
        <Textarea rows={2} value={input} onChange={(e)=>setInput(e.target.value)} placeholder="Ask the copilot…" onKeyDown={(e)=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }} />
        <Button onClick={send} disabled={loading || !input.trim()} className="bg-gradient-gold text-primary-foreground"><Send className="h-3 w-3 mr-1" />Send</Button>
      </Card>
    </div>
  );
}

/* =============== REFERRALS ADMIN =============== */
export function ReferralsAdminPanel() {
  const [s, setS] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  async function load() {
    const { data: settings } = await supabase.from("app_settings").select("referral_enabled, referral_bonus_referrer, referral_bonus_referee").eq("id", 1).maybeSingle();
    setS(settings);
    const { data } = await supabase.from("referrals").select("*").order("created_at", { ascending: false }).limit(200);
    setList(data ?? []);
    const ids = Array.from(new Set((data ?? []).flatMap((r: any) => [r.referrer_id, r.referee_id])));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name, ingame_name").in("id", ids);
      const map: any = {}; (p ?? []).forEach((x: any) => { map[x.id] = x; }); setProfiles(map);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const { error } = await supabase.from("app_settings").update(s).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Saved");
  }

  if (!s) return null;
  const totalReferrals = list.length;
  const totalPaid = list.reduce((a, b) => a + Number(b.referrer_bonus || 0) + Number(b.referee_bonus || 0), 0);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2"><Gift className="h-5 w-5 text-primary" /><div className="font-bold">Referral system</div></div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Enabled globally</span>
          <Switch checked={!!s.referral_enabled} onCheckedChange={(v) => setS({ ...s, referral_enabled: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Referrer bonus</label>
            <Input type="number" value={s.referral_bonus_referrer} onChange={(e) => setS({ ...s, referral_bonus_referrer: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Referee bonus</label>
            <Input type="number" value={s.referral_bonus_referee} onChange={(e) => setS({ ...s, referral_bonus_referee: Number(e.target.value) })} />
          </div>
        </div>
        <Button onClick={save} className="btn-luxury">Save</Button>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <RiskStat label="Total referrals" value={String(totalReferrals)} icon={Users} accent="primary" />
        <RiskStat label="Tokens distributed" value={totalPaid.toLocaleString()} icon={Gift} accent="emerald" />
      </div>

      <Card className="p-5">
        <div className="font-bold mb-3">Recent referrals</div>
        <div className="space-y-2">
          {list.length === 0 && <p className="text-xs text-muted-foreground">No referrals yet.</p>}
          {list.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between border-b border-border pb-2 text-sm">
              <div>
                <div className="font-semibold">{profiles[r.referrer_id]?.ingame_name || profiles[r.referrer_id]?.full_name || r.referrer_id.slice(0, 8)}</div>
                <div className="text-[11px] text-muted-foreground">→ {profiles[r.referee_id]?.ingame_name || profiles[r.referee_id]?.full_name || r.referee_id.slice(0, 8)}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-emerald-300">+{(Number(r.referrer_bonus) + Number(r.referee_bonus)).toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* =============== EMBLEM MODERATION =============== */
export function EmblemModerationPanel() {
  const [list, setList] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [autoApprove, setAutoApprove] = useState(false);

  async function load() {
    const { data } = await supabase.from("gang_emblems").select("*").order("created_at", { ascending: false });
    setList(data ?? []);
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name, ingame_name, gang_name").in("id", ids);
      const m: any = {}; (p ?? []).forEach((x: any) => { m[x.id] = x; }); setProfiles(m);
    }
    const { data: s } = await supabase.from("app_settings").select("emblem_auto_approve").eq("id", 1).maybeSingle();
    setAutoApprove(!!(s as any)?.emblem_auto_approve);
  }
  useEffect(() => { load(); }, []);

  async function review(id: string, approve: boolean) {
    const note = approve ? null : prompt("Reason for rejection?") || null;
    const { error } = await supabase.rpc("review_gang_emblem", { _id: id, _approve: approve, _note: note ?? undefined });
    if (error) toast.error(error.message); else { toast.success(approve ? "Approved" : "Rejected"); load(); }
  }

  async function toggleAuto(v: boolean) {
    setAutoApprove(v);
    await supabase.from("app_settings").update({ emblem_auto_approve: v }).eq("id", 1);
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold flex items-center gap-2"><ImageIcon className="h-4 w-4" />Auto-approve emblems</div>
            <div className="text-xs text-muted-foreground">When on, all uploaded emblems are immediately visible.</div>
          </div>
          <Switch checked={autoApprove} onCheckedChange={toggleAuto} />
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.length === 0 && <p className="text-xs text-muted-foreground">No emblems submitted yet.</p>}
        {list.map((e: any) => (
          <Card key={e.id} className="p-3">
            <div className="aspect-square w-full rounded-lg overflow-hidden bg-background/40 mb-2">
              <img src={e.image_url} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="text-sm font-semibold truncate">{profiles[e.user_id]?.ingame_name || profiles[e.user_id]?.full_name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{profiles[e.user_id]?.gang_name}</div>
            <div className="flex items-center justify-between mt-2">
              <Badge variant="outline" className={
                e.status === "approved" ? "border-emerald-500/50 text-emerald-300" :
                e.status === "rejected" ? "border-destructive/50 text-destructive" :
                "border-amber-500/50 text-amber-300"
              }>{e.status}</Badge>
              {e.status === "pending" && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => review(e.id, false)}>Reject</Button>
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => review(e.id, true)}>Approve</Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* =============== VIP / LOYALTY ADMIN =============== */
export function VipAdminPanel() {
  const [s, setS] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from("app_settings").select("vip_enabled, xp_per_bet, xp_per_win, xp_per_login, xp_per_referral").eq("id", 1).maybeSingle();
    setS(data);
    const { data: u } = await supabase.from("profiles").select("id, full_name, ingame_name, xp, vip_tier").order("xp", { ascending: false }).limit(50);
    setUsers(u ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const { error } = await supabase.from("app_settings").update(s).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Saved");
  }

  async function adjust(uid: string, delta: number) {
    const { error } = await supabase.rpc("admin_adjust_xp", { _user_id: uid, _delta: delta, _reason: "admin manual" });
    if (error) toast.error(error.message); else { toast.success("XP adjusted"); load(); }
  }

  if (!s) return null;
  const filtered = users.filter((u) => !search || (u.full_name + " " + u.ingame_name).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><Crown className="h-5 w-5 text-amber-300" /><div className="font-bold">VIP / Loyalty</div></div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Enabled</span>
          <Switch checked={!!s.vip_enabled} onCheckedChange={(v) => setS({ ...s, vip_enabled: v })} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["xp_per_bet", "XP per bet"],
            ["xp_per_win", "XP per win"],
            ["xp_per_login", "XP per login"],
            ["xp_per_referral", "XP per referral"],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="text-[10px] uppercase text-muted-foreground">{label}</label>
              <Input type="number" value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Tier thresholds: Bronze 0 · Silver 500 · Gold 3,000 · Platinum 10,000 · Legend 25,000 XP</p>
        <Button onClick={save} className="btn-luxury">Save</Button>
      </Card>

      <Card className="p-5">
        <div className="font-bold mb-3">Top XP users</div>
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
        <div className="space-y-2">
          {filtered.map((u, i) => (
            <div key={u.id} className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <span className="text-xs font-mono text-muted-foreground mr-2">#{i + 1}</span>
                <span className="font-semibold">{u.ingame_name || u.full_name}</span>
                <Badge variant="outline" className="ml-2 text-[10px]">{u.vip_tier}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="font-bold gradient-gold-text">{Number(u.xp).toLocaleString()} XP</div>
                <Button size="sm" variant="outline" className="h-7" onClick={() => adjust(u.id, 100)}>+100</Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => adjust(u.id, -100)}>-100</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
