import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ticket as TicketIcon, ChevronRight, Wallet, UserCog, CreditCard, Coins, Tag, Trophy, ListChecks, Sparkles, Lock, History as HistoryIcon, ArrowLeftRight, Gift, Receipt } from "lucide-react";
import { ChallengesPanel } from "@/components/ChallengesPanel";
import { VipCard } from "@/components/UserHubSections";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Dashboard — Lomita Shooters League" },
      { name: "description", content: "Manage your bet slips, token balance, withdrawals, promo codes, achievements, and account settings in one place." },
      { property: "og:title", content: "Your Dashboard — Lomita Shooters League" },
      { property: "og:description", content: "Manage your bet slips, balance, withdrawals, and achievements at LSL." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/dashboard" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://lslonlinebetting.lovable.app/dashboard" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, profile, roles, refresh } = useAuth();
  const [bets, setBets] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [promoOpen, setPromoOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [betFilter, setBetFilter] = useState<string>("all");
  const [betSearch, setBetSearch] = useState("");
  const isSponsor = roles?.includes("sponsor") || roles?.includes("admin");
  useEffect(() => {
    if (!user) return;
    const load = () => supabase.from("bets")
      .select("*, bet_selections(*, matches!match_id(name))")
      .eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setBets(data ?? []));
    load();
    const ch = supabase.channel(`my-bets-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const load = () => supabase.from("withdrawal_requests")
      .select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setWithdrawals(data ?? []));
    load();
    const ch = supabase.channel(`my-wds-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!user) return <Layout><div className="container mx-auto px-4 py-16 text-center"><p>Please <Link to="/login" className="text-primary underline">sign in</Link>.</p></div></Layout>;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Welcome back</p>
          <h1 className="text-4xl md:text-5xl font-extrabold gradient-gold-text mt-1">{profile?.full_name?.split(" ")[0] ?? "Shooter"}</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Token Balance" value={profile?.token_balance.toLocaleString() ?? "0"} accent="primary" />
          <StatCard label="Active Bets" value={String(bets.filter(b => b.status === 'open').length)} />
          <StatCard label="Won" value={String(bets.filter(b => b.status === 'won').length)} accent="emerald" />
          <StatCard label="Total Bets" value={String(bets.length)} />
        </div>

        {/* Quick panels */}
        <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <PanelCard to="#bets" icon={TicketIcon} title="Bet Slips" subtitle={`${bets.length} total`} />
          <PanelCard to="/profile" icon={UserCog} title="Edit Profile" subtitle="Update details" />
          <PanelCard to="/withdraw" icon={Wallet} title="Withdrawal" subtitle="Cash out tokens" />
          <PanelCard onClick={() => setTransferOpen(true)} icon={ArrowLeftRight} title="Transfer Tokens" subtitle="Send to a user ID" />
          <PanelCard to="/checkout" icon={Coins} title="Request Tokens" subtitle="Top up balance" />
          {isSponsor && (
            <PanelCard onClick={() => setPromoOpen(true)} icon={Tag} title="Promo Codes" subtitle="Sponsor only" gold />
          )}
          <PanelCard to="/tasks" icon={ListChecks} title="Tasks" subtitle="Earn token rewards" />
          <PanelCard to="/achievements" icon={Trophy} title="Achievements" subtitle="Your badges" />
        </div>

        <div className="mb-10">
          <ChallengesPanel />
        </div>

        <div className="mb-10">
          <VipCard />
        </div>

        <div className="mb-10">
          <GiftsAndSpin onClaimed={refresh} />
        </div>

        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><HistoryIcon className="h-5 w-5 text-primary" />Bet History</h2>
        {bets.length > 0 && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                { k: "all", label: "All" },
                { k: "open", label: "Open" },
                { k: "won", label: "Won" },
                { k: "lost", label: "Lost" },
                { k: "cashed_out", label: "Cashed out" },
                { k: "suspended", label: "Suspended" },
                { k: "void", label: "Void" },
                { k: "refunded", label: "Refunded" },
              ].map((f) => {
                const n = f.k === "all" ? bets.length : bets.filter((b) => b.status === f.k).length;
                if (f.k !== "all" && n === 0) return null;
                const active = betFilter === f.k;
                return (
                  <button
                    key={f.k}
                    onClick={() => setBetFilter(f.k)}
                    className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${active ? "bg-primary/20 border-primary/60 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}
                  >
                    {f.label} <span className="opacity-70">({n})</span>
                  </button>
                );
              })}
            </div>
            <Input
              value={betSearch}
              onChange={(e) => setBetSearch(e.target.value)}
              placeholder="Search by tracking ID, booking code or match…"
              className="max-w-md"
            />
          </div>
        )}
        <div id="bets" className="space-y-3 scroll-mt-24">
          {bets.length === 0 && <p className="text-muted-foreground text-sm">No bets yet.</p>}
          {(() => {
            const q = betSearch.trim().toLowerCase();
            const filtered = bets.filter((b) => {
              if (betFilter !== "all" && b.status !== betFilter) return false;
              if (!q) return true;
              const hay = [
                b.tracking_id,
                b.booking_code,
                ...(b.bet_selections ?? []).map((s: any) => s.matches?.name || s.selection_label),
              ].join(" ").toLowerCase();
              return hay.includes(q);
            });
            if (filtered.length === 0) return <p className="text-muted-foreground text-sm">No bets match this filter.</p>;
            return filtered.map((b) => (
            <Link key={b.id} to="/ticket/$id" params={{ id: b.id }}>
              <Card className="p-3 hover:border-primary/60 transition group cursor-pointer">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-primary">{b.tracking_id}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">· {b.booking_code}</span>
                    </div>
                    <div className="font-bold mt-0.5 text-sm">{b.bet_selections?.length ?? 0} selection(s) · stake {b.stake.toLocaleString()}</div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {(b.bet_selections ?? []).map((s: any) => s.matches?.name || s.selection_label).join(" · ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={
                      b.status === 'won' ? 'border-emerald-500/50 text-emerald-300' :
                      b.status === 'lost' ? 'border-destructive/50 text-destructive' :
                      b.status === 'suspended' ? 'border-amber-500/50 text-amber-300' :
                      'border-primary/50 text-primary'
                    }>{b.status.toUpperCase()}</Badge>
                    <div className="text-[11px] text-muted-foreground mt-1">Payout {b.potential_payout.toLocaleString()}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                </div>
              </Card>
            </Link>
            ));
          })()}
        </div>

        <div className="mt-10 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-bold flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />My Withdrawals</h2>
          <Link to="/withdraw" className="text-xs text-primary hover:underline">Request withdrawal →</Link>
        </div>
        <div className="space-y-3 mt-4">
          {withdrawals.length === 0 && <p className="text-muted-foreground text-sm">No withdrawal requests yet.</p>}
          {withdrawals.map((w) => (
            <Card key={w.id} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{w.amount.toLocaleString()} tokens</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {w.ingame_name} · {w.gang_name}
                    {w.ticket_ref && <> · ref {w.ticket_ref}</>}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(w.created_at).toLocaleString()}</div>
                  {w.admin_note && <div className="text-xs mt-1 text-muted-foreground">Admin: {w.admin_note}</div>}
                </div>
                <Badge variant="outline" className={
                  w.status === 'approved' ? 'border-emerald-500/50 text-emerald-300' :
                  w.status === 'rejected' ? 'border-destructive/50 text-destructive' :
                  w.status === 'paid' ? 'border-emerald-500/50 text-emerald-300' :
                  'border-amber-500/50 text-amber-300'
                }>{String(w.status).toUpperCase()}</Badge>
              </div>
            </Card>
          ))}
        </div>

        <TransactionRecords />
      </div>
      <PromoRequestDialog open={promoOpen} onClose={() => setPromoOpen(false)} userId={user.id} />
      <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} onDone={refresh} />
    </Layout>
  );
}

function GiftsAndSpin({ onClaimed }: { onClaimed: () => void }) {
  const { user } = useAuth();
  const [gifts, setGifts] = useState<any[]>([]);
  const [spinCfg, setSpinCfg] = useState<{ enabled: boolean; cooldown: number; min: number; max: number } | null>(null);
  const [lastSpin, setLastSpin] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const loadGifts = () => {
    if (!user) return;
    (supabase as any).from("user_gifts").select("*").eq("user_id", user.id).eq("status", "pending").order("created_at", { ascending: false })
      .then(({ data }: any) => setGifts(data ?? []));
  };
  const loadSpin = () => {
    if (!user) return;
    supabase.from("app_settings").select("spin_enabled,spin_cooldown_hours,spin_min_reward,spin_max_reward").eq("id", 1).maybeSingle()
      .then(({ data }: any) => { if (data) setSpinCfg({ enabled: !!data.spin_enabled, cooldown: Number(data.spin_cooldown_hours ?? 24), min: Number(data.spin_min_reward ?? 0), max: Number(data.spin_max_reward ?? 0) }); });
    (supabase as any).from("spins").select("created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1)
      .then(({ data }: any) => setLastSpin(data?.[0]?.created_at ?? null));
  };

  useEffect(() => {
    if (!user) return;
    loadGifts(); loadSpin();
    const ch = supabase.channel(`my-gifts-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_gifts", filter: `user_id=eq.${user.id}` }, loadGifts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  async function claim(id: string) {
    setClaiming(id);
    const { data, error } = await (supabase.rpc as any)("claim_gift", { _gift_id: id });
    setClaiming(null);
    if (error) return toast.error(error.message);
    toast.success(`Claimed ${Number(data?.amount ?? 0).toLocaleString()} tokens! 🎁`);
    loadGifts(); onClaimed();
  }

  const cooldownLeft = (() => {
    if (!spinCfg || !lastSpin) return 0;
    const next = new Date(lastSpin).getTime() + spinCfg.cooldown * 3600_000;
    return Math.max(0, next - Date.now());
  })();
  const canSpin = !!spinCfg?.enabled && cooldownLeft === 0;

  async function spin() {
    setSpinning(true);
    const { data, error } = await (supabase.rpc as any)("spin_wheel");
    setSpinning(false);
    if (error) return toast.error(error.message);
    toast.success(`You won ${Number(data?.reward ?? 0).toLocaleString()} tokens! 🎉`);
    loadSpin(); onClaimed();
  }

  const fmtLeft = (ms: number) => {
    const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Gifts */}
      <Card className="p-5 border-primary/20">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Gift className="h-5 w-5 text-primary" />Your Gifts</h2>
        {gifts.length === 0 && <p className="text-sm text-muted-foreground">No gifts to claim right now.</p>}
        <div className="space-y-2">
          {gifts.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-card/60 p-3">
              <div className="min-w-0">
                <div className="font-bold text-primary">{Number(g.amount).toLocaleString()} tokens</div>
                {g.message && <div className="text-[11px] text-muted-foreground truncate">{g.message}</div>}
              </div>
              <Button size="sm" className="btn-luxury" disabled={claiming === g.id} onClick={() => claim(g.id)}>{claiming === g.id ? "…" : "Claim"}</Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Lucky Spin */}
      <Card className="relative overflow-hidden p-5 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Sparkles className="h-5 w-5 text-amber-300" />Lucky Spin</h2>
        {!spinCfg?.enabled ? (
          <p className="text-sm text-muted-foreground">The lucky spin is currently disabled. Check back soon!</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">Spin to win between <span className="text-amber-300 font-semibold">{spinCfg.min.toLocaleString()}</span> and <span className="text-amber-300 font-semibold">{spinCfg.max.toLocaleString()}</span> tokens.</p>
            <Button onClick={spin} disabled={!canSpin || spinning} className="btn-luxury w-full">
              {spinning ? "Spinning…" : canSpin ? "🎰 Spin now" : `Next spin in ${fmtLeft(cooldownLeft)}`}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

function TransactionRecords() {
  const { user } = useAuth();
  const [txns, setTxns] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "credit" | "debit">("all");
  useEffect(() => {
    if (!user) return;
    const load = () => supabase.from("token_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setTxns(data ?? []));
    load();
    const ch = supabase.channel(`my-txns-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "token_transactions", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);
  const filtered = txns.filter((t) => filter === "all" || (filter === "credit" ? t.amount > 0 : t.amount < 0));
  return (
    <div className="mt-10">
      <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Receipt className="h-5 w-5 text-primary" />Transaction Records</h2>
      <div className="flex gap-2 mb-4">
        {[{ k: "all", l: "All" }, { k: "credit", l: "Credits" }, { k: "debit", l: "Debits" }].map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k as any)} className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${filter === f.k ? "bg-primary/20 border-primary/60 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>{f.l}</button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
        {filtered.map((t) => (
          <Card key={t.id} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm capitalize">{String(t.kind).replace(/_/g, " ")}</div>
                {t.description && <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(t.created_at).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${t.amount >= 0 ? "text-emerald-300" : "text-destructive"}`}>{t.amount >= 0 ? "+" : ""}{Number(t.amount).toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">bal {Number(t.balance_after).toLocaleString()}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "primary" | "emerald" }) {
  const tone = accent === "primary" ? "text-primary" : accent === "emerald" ? "text-emerald-300" : "text-foreground";
  return (
    <Card className="p-5 backdrop-blur-xl bg-card/60 border-primary/20 hover:border-primary/40 transition">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-2xl md:text-3xl font-extrabold mt-1 ${tone}`}>{value}</div>
    </Card>
  );
}

function PanelCard({ to, onClick, icon: Icon, title, subtitle, comingSoon, gold }: any) {
  const inner = (
    <Card className={`relative overflow-hidden p-4 backdrop-blur-xl bg-card/60 border ${gold ? "border-amber-500/40" : "border-primary/20"} hover:border-primary/60 transition group ${comingSoon ? "opacity-70" : "hover:-translate-y-0.5"} cursor-${comingSoon ? "not-allowed" : "pointer"}`}>
      <div className={`h-10 w-10 rounded-xl grid place-items-center mb-3 ${gold ? "bg-gradient-to-br from-amber-400/30 to-amber-600/20" : "bg-gradient-to-br from-primary/30 to-accent/20"}`}>
        <Icon className={`h-5 w-5 ${gold ? "text-amber-300" : "text-primary"}`} />
      </div>
      <div className="font-bold text-sm flex items-center gap-1.5">{title}{comingSoon && <Lock className="h-3 w-3 text-muted-foreground" />}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
      {!comingSoon && <ChevronRight className="absolute top-4 right-4 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />}
      {gold && <Sparkles className="absolute top-3 right-3 h-3 w-3 text-amber-300 animate-pulse" />}
    </Card>
  );
  if (comingSoon) return <div>{inner}</div>;
  if (to && to.startsWith("#")) return <a href={to}>{inner}</a>;
  if (to) return <Link to={to}>{inner}</Link>;
  return <button type="button" onClick={onClick} className="text-left">{inner}</button>;
}

function TransferDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [specialId, setSpecialId] = useState("");
  const [amount, setAmount] = useState(1_000_000);
  const [recipient, setRecipient] = useState<{ full_name: string; special_id: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function lookup() {
    const id = specialId.trim();
    if (!id) return toast.error("Enter a Special ID");
    setChecking(true);
    const { data, error } = await (supabase.rpc as any)("resolve_special_id", { _special_id: id });
    setChecking(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) { setRecipient(null); return toast.error("No user found with that Special ID"); }
    setRecipient({ full_name: row.full_name, special_id: row.special_id });
  }

  async function submit() {
    if (!recipient) return toast.error("Confirm the recipient first");
    if (amount <= 0) return toast.error("Enter a valid amount");
    setSubmitting(true);
    const { data, error } = await (supabase.rpc as any)("transfer_tokens", { _recipient_special_id: recipient.special_id, _amount: amount });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Sent ${amount.toLocaleString()} tokens to ${recipient.full_name}`);
    setSpecialId(""); setRecipient(null); setAmount(1_000_000);
    onDone();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong border-primary/30 max-w-md backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" />Transfer Tokens</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Recipient Special ID</label>
            <div className="flex gap-2">
              <Input value={specialId} onChange={(e) => { setSpecialId(e.target.value.toUpperCase()); setRecipient(null); }} placeholder="e.g. XHA6HD8" />
              <Button variant="outline" onClick={lookup} disabled={checking}>{checking ? "…" : "Check"}</Button>
            </div>
            {recipient && <p className="text-xs text-emerald-300 mt-1">Sending to: <span className="font-bold">{recipient.full_name}</span></p>}
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Amount</label>
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={submit} disabled={submitting || !recipient} className="flex-1 btn-luxury">{submitting ? "Sending…" : "Send Tokens"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PromoRequestDialog({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [amount, setAmount] = useState(1_000_000);
  const [usageLimit, setUsageLimit] = useState(1);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (amount <= 0 || usageLimit <= 0) return toast.error("Invalid amount or usage limit");
    setSubmitting(true);
    const { error } = await supabase.from("promo_code_requests").insert({ user_id: userId, amount, usage_limit: usageLimit, reason });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Promo code request submitted");
    onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong border-amber-500/30 max-w-md backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-amber-300" />Request a Promo Code</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Token amount per redemption</label><Input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Number of uses</label><Input type="number" min={1} value={usageLimit} onChange={(e) => setUsageLimit(Number(e.target.value))} /></div>
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Reason / campaign</label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's this promo for?" /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={submit} disabled={submitting} className="flex-1 btn-luxury">{submitting ? "Submitting…" : "Submit Request"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
