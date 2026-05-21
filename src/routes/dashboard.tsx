import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ticket as TicketIcon, ChevronRight, Wallet, UserCog, CreditCard, Coins, Tag, Trophy, ListChecks, Sparkles, Lock } from "lucide-react";
import { ChallengesPanel } from "@/components/ChallengesPanel";
import { ReferralCard, VipCard, UserAnalyticsDashboard, BetHistoryAdvanced, GangEmblemUpload } from "@/components/UserHubSections";

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
  const { user, profile, roles } = useAuth();
  const [bets, setBets] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [promoOpen, setPromoOpen] = useState(false);
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
      <PageShell tone="wallet">
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
          <PanelCard icon={CreditCard} title="Deposit" subtitle="Coming soon" comingSoon />
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

        <div className="grid md:grid-cols-2 gap-4 mb-10">
          <VipCard />
          <ReferralCard />
        </div>

        <div className="mb-10">
          <UserAnalyticsDashboard bets={bets} />
        </div>

        <div className="mb-10">
          <GangEmblemUpload />
        </div>

        <div className="mb-10">
          <BetHistoryAdvanced bets={bets} />
        </div>

        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><TicketIcon className="h-5 w-5 text-primary" />My Bet Tickets</h2>
        <div id="bets" className="space-y-3 scroll-mt-24">
          {bets.length === 0 && <p className="text-muted-foreground text-sm">No bets yet.</p>}
          {bets.map((b) => (
            <Link key={b.id} to="/ticket/$id" params={{ id: b.id }}>
              <Card className="p-4 hover:border-primary/60 transition group">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-primary">{b.tracking_id}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">· {b.booking_code}</span>
                    </div>
                    <div className="font-bold mt-1">{b.bet_selections?.length ?? 0} selection(s) · stake {b.stake.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
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
                    <div className="text-xs text-muted-foreground mt-1">Payout {b.potential_payout.toLocaleString()}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                </div>
              </Card>
            </Link>
          ))}
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
      </div>
      <PromoRequestDialog open={promoOpen} onClose={() => setPromoOpen(false)} userId={user.id} />
      </PageShell>
    </Layout>
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
