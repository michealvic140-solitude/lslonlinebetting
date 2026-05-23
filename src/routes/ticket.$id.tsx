import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/TeamLogo";
import { useConfirm } from "@/components/ConfirmDialog";
import { Sparkles, Send, ArrowLeft, Ticket as TicketIcon, Copy, Check, X, Image as ImageIcon, Share2, Trash2, Lock as LockIcon, Clock as ClockIcon, ShieldCheck, Trophy, Coins, TrendingUp, Gem, Calendar, CalendarCheck, ShieldAlert } from "lucide-react";
import { GangLogo } from "@/components/GangLogo";
import { toast } from "sonner";
import lslLogo from "@/assets/lsl-logo.png";

export const Route = createFileRoute("/ticket/$id")({
  head: () => ({ meta: [{ title: "Ticket — LSL" }] }),
  component: TicketPage,
});

function TicketPage() {
  const { id } = Route.useParams();
  const { user, isMod } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [bet, setBet] = useState<any>(null);

  useEffect(() => {
    supabase.from("support_tickets").select("*").eq("id", id).maybeSingle().then(({ data }) => setTicket(data ?? null));
    loadBet();
    const ch = supabase.channel(`item-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter: `id=eq.${id}` }, loadBet)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, loadBet)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${id}` },
        (p) => setTicket(p.new))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "support_tickets", filter: `id=eq.${id}` },
        () => setTicket(null))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadBet() {
    const { data, error } = await supabase.from("bets")
      .select("*, bet_selections(*, matches!match_id(name, status, home_score, away_score, is_virtual, home_team:teams!home_team_id(name,logo_url), away_team:teams!away_team_id(name,logo_url)), markets!market_id(name))")
      .eq("id", id).maybeSingle();
    if (error) { console.error("loadBet error", error); return; }
    if (!data) return;
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", data.user_id).maybeSingle();
    setBet({ ...data, profiles: prof });
  }

  if (!user) return <Layout><div className="container py-10"><Link to="/login" className="text-primary underline">Sign in</Link> to view tickets.</div></Layout>;
  if (bet) return <BetTicket bet={bet} viewerId={user.id} />;
  if (ticket) return <SupportTicketView ticket={ticket} userId={user.id} isMod={isMod} />;
  return <Layout><div className="container py-10">Loading…</div></Layout>;
}

/* ================= BET TICKET (Glassmorphism Voucher) ================= */
function BetTicket({ bet, viewerId }: { bet: any; viewerId: string }) {
  const sels = bet.bet_selections ?? [];
  const isOwner = bet.user_id === viewerId;
  const statusBadge =
    bet.status === "won" ? { label: "WON", cls: "neon-green-border text-emerald-300 bg-emerald-500/15", Icon: Trophy }
    : bet.status === "lost" ? { label: "LOST", cls: "border border-destructive/40 text-destructive bg-destructive/10", Icon: X }
    : bet.status === "cashed_out" ? { label: "CASHED OUT", cls: "border border-amber-400/40 text-amber-300 bg-amber-400/10", Icon: ShieldCheck }
    : { label: "PENDING", cls: "neon-green-border text-emerald-300 bg-emerald-500/10", Icon: ClockIcon };

  const allWon = sels.length > 0 && sels.every((s: any) => s.result === "won");
  function copy(t: string) { navigator.clipboard.writeText(t); toast.success("Copied"); }

  async function shareCode() {
    const url = `${window.location.origin}/?code=${bet.booking_code}`;
    if (navigator.share) try { await navigator.share({ title: `LSL Booking ${bet.booking_code}`, url }); return; } catch {/*ignore*/}
    navigator.clipboard.writeText(url); toast.success("Share link copied");
  }

  return (
    <Layout>
      <PageShell tone="wallet">
      <div className="w-full max-w-xl px-3 py-6 md:ml-0 md:mr-auto">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />My bets</Link>
        <BetVoucher bet={bet} sels={sels} statusBadge={statusBadge} allWon={allWon} copy={copy} shareCode={shareCode} />

        {!isOwner && (
          <Card className="glass mt-4 p-3 text-xs text-muted-foreground">
            Viewing a shared booking. Use the booking code on the home page to copy these picks to your own slip.
          </Card>
        )}
      </div>
      </PageShell>
    </Layout>
  );
}

/* ====== Premium Glassmorphism Bet Voucher (matches reference) ====== */
export function BetVoucher({ bet, sels, statusBadge, allWon, copy, shareCode }: {
  bet: any; sels: any[]; statusBadge: { label: string; cls: string; Icon: any }; allWon: boolean;
  copy: (t: string) => void; shareCode: () => void;
}) {
  const status = bet.status as string;
  const isVirtualTicket = sels.some((s: any) => s.matches?.is_virtual);
  const statusBarCls =
    status === "won" || status === "cashed_out" ? "voucher-status-bar-won"
    : status === "lost" ? "voucher-status-bar-lost"
    : "voucher-status-bar-pending";
  const statusBarIcon =
    status === "won" || status === "cashed_out" ? <Trophy className="h-4 w-4" />
    : status === "lost" ? <X className="h-4 w-4" />
    : <ClockIcon className="h-4 w-4" />;
  const statusBarText =
    status === "won" ? "BET STATUS: CONGRATULATIONS, YOU WON!"
    : status === "cashed_out" ? "BET STATUS: CASHED OUT SUCCESSFULLY"
    : status === "lost" ? "BET STATUS: BETTER LUCK NEXT ROUND"
    : status === "void" ? "BET STATUS: TICKET VOIDED"
    : status === "refunded" ? "BET STATUS: REFUNDED"
    : status === "suspended" ? "BET STATUS: SUSPENDED BY ADMIN"
    : "BET STATUS: PENDING SETTLEMENT";

  return (
    <div className="relative px-0 py-4 animate-fade-in">
      {/* Outer ambient glow */}
      <div className="absolute -inset-6 rounded-[40px] bg-[radial-gradient(circle_at_30%_20%,oklch(0.85_0.22_152/0.30),transparent_60%),radial-gradient(circle_at_80%_80%,oklch(0.82_0.17_90/0.22),transparent_60%)] blur-3xl pointer-events-none" />

      <div className="relative rounded-[28px] voucher-frame voucher-bg overflow-hidden transition-transform duration-500 hover:[transform:perspective(1600px)_rotateX(0.6deg)_rotateY(-0.6deg)_translateY(-2px)]">
        {/* LSL logo watermark behind everything */}
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.08]"
          aria-hidden
        >
          <img src={lslLogo} alt="" className="w-2/3 max-w-[420px] object-contain mix-blend-screen" />
        </div>
        {/* Holographic corner patches (4 corners like reference) */}
        <div className="absolute left-0 top-0 w-16 h-16 rounded-br-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 voucher-holo" />
        </div>
        <div className="absolute right-0 top-0 w-16 h-16 rounded-bl-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 voucher-holo" />
        </div>
        <div className="absolute left-0 bottom-0 w-16 h-16 rounded-tr-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 voucher-holo" />
        </div>
        <div className="absolute right-0 bottom-0 w-16 h-16 rounded-tl-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 voucher-holo" />
        </div>
        {/* Circuit pattern */}
        <div className="absolute inset-0 voucher-circuit pointer-events-none" />

        <div className="relative px-3 sm:px-5 pt-6 pb-5 space-y-4">
          {/* HEADER */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <GangLogo size={22} withGlow={false} />
              <span className="text-[10px] sm:text-[11px] tracking-[0.32em] text-muted-foreground font-bold">LOMITA SHOOTERS LEAGUE</span>
            </div>
              <h2 className="font-display text-3xl sm:text-5xl font-black tracking-[0.08em] leading-none">
              <Sparkles className="inline h-4 w-4 text-primary mr-2 -mt-2" />
                <span className="gold-foil">BET</span> <span className="gold-foil">VOUCHER</span>
              <Sparkles className="inline h-4 w-4 text-primary ml-2 -mt-2" />
            </h2>
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary uppercase tracking-[0.22em] text-[10px]">
              {isVirtualTicket ? "Virtual Matches Voucher" : "Real Matches Voucher"}
            </Badge>
          </div>

          {/* CODES */}
          <div className="rounded-2xl voucher-row p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Booking Code</div>
              <button onClick={() => copy(bet.booking_code)} className="mt-1 inline-flex items-center gap-2 font-mono font-black text-xl sm:text-2xl gold-foil hover:opacity-80 truncate max-w-full">
                {bet.booking_code} <Copy className="h-4 w-4 text-primary shrink-0" />
              </button>
              <button onClick={shareCode} className="mt-1 flex items-center gap-1 text-xs neon-green hover:underline">
                <Share2 className="h-3 w-3" />Share booking
              </button>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Tracking ID</div>
              <button onClick={() => copy(bet.tracking_id)} className="mt-1 inline-flex items-center gap-1 ml-auto font-mono font-black text-base sm:text-lg gold-foil hover:opacity-80 max-w-full truncate">
                {bet.tracking_id} <Copy className="h-3 w-3 text-primary shrink-0" />
              </button>
              {bet.profiles?.full_name && (
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">By {bet.profiles.full_name}</div>
              )}
            </div>
          </div>

          {/* SELECTIONS HEADER */}
          <div className="flex items-center gap-3 justify-center">
            <span className="flex-1 h-px bg-gradient-to-r from-transparent to-emerald-400/50" />
            <span className="text-[11px] tracking-[0.4em] text-muted-foreground font-bold inline-flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-primary" />
              SELECTIONS ({sels.length})
              <Sparkles className="h-3 w-3 text-primary" />
            </span>
            <span className="flex-1 h-px bg-gradient-to-l from-transparent to-emerald-400/50" />
          </div>

          {/* SELECTIONS LIST */}
          <div className="space-y-3">
            {sels.map((s: any, i: number) => {
              const m = s.matches;
              const live = m?.status === "live";
              const ended = m?.status === "ended";
              const won = s.result === "won";
              const lost = s.result === "lost";
              const badgeCls = won ? "badge-won" : lost ? "badge-lost" : "badge-pending";
              const badgeLabel = won ? "WON" : lost ? "LOST" : live ? "LIVE" : "PENDING";
              const BadgeIcon = won ? Trophy : lost ? X : ClockIcon;
              const scoreLabel = ended ? "FINAL" : live ? "LIVE" : "SCORE";
              return (
                <div key={s.id} className="voucher-row p-3 sm:p-4 transition-all hover:scale-[1.01]">
                  <div className="flex items-center gap-3">
                    {/* Logo */}
                    <div className="shrink-0">
                      <TeamLogo name={m?.home_team?.name} url={m?.home_team?.logo_url} size={36} rounded="full" />
                    </div>
                    {/* Match + pick */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-extrabold tracking-wide truncate uppercase">
                        {m?.home_team?.name} <span className="text-muted-foreground font-normal lowercase">vs</span> {m?.away_team?.name}
                      </div>
                      <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5 truncate">
                        Pick: <span className="text-foreground font-bold">{s.selection_label}</span>
                      </div>
                    </div>
                    {/* Score */}
                    <div className="text-center shrink-0 hidden sm:block">
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{scoreLabel}</div>
                      <div className={`font-mono font-black text-base ${live ? "neon-green animate-pulse" : "text-foreground"}`}>
                        {m ? `${m.home_score}-${m.away_score}` : "—"}
                      </div>
                    </div>
                    {/* Status badge */}
                    <div className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest ${badgeCls}`}>
                      {badgeLabel} <BadgeIcon className="h-3 w-3" />
                    </div>
                    {/* Odds */}
                    <div className="text-right shrink-0 w-12 sm:w-14">
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Odds</div>
                      <div className="font-mono font-black text-base sm:text-lg gold-foil">{Number(s.locked_odds).toFixed(2)}</div>
                    </div>
                  </div>
                  {/* mobile score row */}
                  <div className="sm:hidden mt-2 pt-2 border-t border-emerald-500/15 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{scoreLabel}</span>
                    <span className={`font-mono font-black ${live ? "neon-green animate-pulse" : "text-foreground"}`}>{m ? `${m.home_score}-${m.away_score}` : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PERFORATION */}
          <div className="relative py-3">
            <div className="absolute -left-7 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background" />
            <div className="absolute -right-7 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background" />
            <div className="voucher-dashed" />
          </div>

          {/* TOTALS */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="voucher-row p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Coins className="h-4 w-4 text-amber-400" />
                <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">Stake</div>
              </div>
              <div className="font-display font-black text-lg sm:text-2xl gold-foil">{Number(bet.stake).toLocaleString()}</div>
            </div>
            <div className="voucher-row p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">Total Odds</div>
              </div>
              <div className="font-display font-black text-lg sm:text-2xl neon-green">{Number(bet.total_odds).toFixed(2)}</div>
            </div>
            <div className="voucher-row p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Gem className="h-4 w-4 text-amber-400" />
                <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">{status === "cashed_out" ? "Cashed Out" : "Potential Cash Out"}</div>
              </div>
              <div className="font-display font-black text-lg sm:text-2xl gold-foil">
                {Number(status === "cashed_out" ? (bet.cashout_amount ?? bet.potential_payout) : bet.potential_payout).toLocaleString()}
              </div>
            </div>
          </div>

          {/* DATES */}
          <div className="voucher-row p-3 grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-bold">Date Booked</div>
                <div className="text-[11px] sm:text-xs font-mono text-foreground truncate">{new Date(bet.created_at).toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-bold">Date Settled</div>
                <div className="text-[11px] sm:text-xs font-mono text-foreground truncate">{bet.settled_at ? new Date(bet.settled_at).toLocaleString() : "— pending —"}</div>
              </div>
            </div>
          </div>

          {/* STATUS BAR */}
          <div className={`rounded-xl px-4 py-3 flex items-center justify-center gap-2 font-black tracking-[0.18em] text-xs sm:text-sm ${statusBarCls}`}>
            {statusBarIcon}
            <span className="text-center">{statusBarText}</span>
          </div>

          {/* CASHOUT (only if open + all selections won) */}
          {status === "open" && allWon && (
            <CashoutButton betId={bet.id} amount={Number(bet.potential_payout)} />
          )}
          {status === "open" && !allWon && (
            <div className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
              <LockIcon className="h-3 w-3" />Awaiting match settlement. Cash-out unlocks when every selection wins.
            </div>
          )}
          {isVirtualTicket && status === "won" && (
            <Link to="/virtual/history" className="w-full rounded-xl py-3 btn-luxury font-black tracking-widest text-base flex items-center justify-center gap-2">
              <Trophy className="h-5 w-5" />Claim virtual payout
            </Link>
          )}

          {/* BARCODE */}
          <div className="space-y-2 pt-1">
            <div className="voucher-barcode h-14 w-full" />
            <div className="text-center font-mono text-[10px] tracking-[0.4em] text-muted-foreground">
              {bet.tracking_id}
            </div>
          </div>

          {/* FOOTER */}
          <div className="text-center space-y-1 pt-1">
            <div className="text-[10px] sm:text-[11px] tracking-[0.35em] neon-green font-bold inline-flex items-center gap-2">
              <Sparkles className="h-3 w-3" />
              DIGITAL BETTING RECEIPT
              <Sparkles className="h-3 w-3" />
            </div>
            <div className="text-[10px] tracking-[0.25em] text-muted-foreground inline-flex items-center justify-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              VERIFIED BY LSL SYSTEM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashoutButton({ betId, amount }: { betId: string; amount: number }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  async function go() {
    const ok = await confirm({
      title: "Cash out this winning ticket?",
      description: `All selections won. ${amount.toLocaleString()} tokens will be credited to your wallet immediately.`,
      confirmText: "Cash out now",
    });
    if (!ok) return;
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("user_cashout_bet", { _bet_id: betId });
    setBusy(false);
    if (error) toast.error("Cash-out failed", { description: error.message });
    else toast.success("Cashed out!", { description: `+${Number(data?.credited ?? amount).toLocaleString()} tokens credited. New balance: ${Number(data?.balance ?? 0).toLocaleString()}.` });
  }
  return (
    <button onClick={go} disabled={busy}
      className="w-full rounded-xl py-3 btn-luxury font-black tracking-widest text-base flex items-center justify-center gap-2 disabled:opacity-60">
      <Trophy className="h-5 w-5" />{busy ? "Processing…" : `Cash out ${amount.toLocaleString()} tokens`}
    </button>
  );
}

/* ================= SUPPORT TICKET (real-time chat with admin) ================= */
function SupportTicketView({ ticket, userId, isMod }: { ticket: any; userId: string; isMod: boolean }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { name: string }>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    supabase.from("ticket_messages").select("*").eq("ticket_id", ticket.id).order("created_at", { ascending: true })
      .then(async ({ data }) => {
        setMsgs(data ?? []);
        await loadProfiles((data ?? []).map((m: any) => m.user_id));
      });
    const ch = supabase.channel(`tm-${ticket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` },
        async (p) => { setMsgs((prev) => [...prev, p.new]); await loadProfiles([(p.new as any).user_id]); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` },
        (p) => setMsgs((prev) => prev.filter((m) => m.id !== (p.old as any).id)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function loadProfiles(ids: string[]) {
    const need = Array.from(new Set(ids)).filter((id) => id && !profiles[id]);
    if (need.length === 0) return;
    const { data } = await supabase.from("profiles").select("id,full_name").in("id", need);
    const next = { ...profiles };
    (data ?? []).forEach((p: any) => { next[p.id] = { name: p.full_name }; });
    setProfiles(next);
  }

  async function send() {
    if (!text.trim() || ticket.status === "closed") return;
    const content = text.trim(); setText(""); setSending(true);
    const { error } = await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, user_id: userId, content });
    if (error) { toast.error(error.message); setSending(false); return; }
    // AI only auto-replies to a non-mod user. Admin replies are human.
    if (!isMod) {
      try {
        const { data: ai } = await supabase.functions.invoke("ai-support", { body: { subject: ticket.subject, message: content } });
        if (ai?.reply) await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, user_id: userId, content: ai.reply, is_ai: true });
      } catch {/*ignore*/}
    }
    setSending(false);
  }

  async function pickImage(file: File) {
    const path = `${ticket.id}/${Date.now()}-${file.name}`;
    const { error: ue } = await supabase.storage.from("ticket-uploads").upload(path, file);
    if (ue) { toast.error(ue.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("ticket-uploads").getPublicUrl(path);
    await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, user_id: userId, image_url: publicUrl });
  }

  async function deleteMsg(id: string) {
    if (!await confirm({ title: "Delete message?", tone: "danger", confirmText: "Delete" })) return;
    await supabase.from("ticket_messages").delete().eq("id", id);
  }

  async function closeTicket() {
    if (!await confirm({ title: "Close this ticket?", description: "Users can no longer reply.", confirmText: "Close ticket" })) return;
    await supabase.from("support_tickets").update({ status: "closed" }).eq("id", ticket.id);
    toast.success("Ticket closed");
  }
  async function reopen() {
    await supabase.from("support_tickets").update({ status: "open" }).eq("id", ticket.id);
    toast.success("Reopened");
  }
  async function deleteTicket() {
    if (!await confirm({ title: "Delete this ticket?", description: "This cannot be undone.", tone: "danger", confirmText: "Delete forever" })) return;
    await supabase.from("ticket_messages").delete().eq("ticket_id", ticket.id);
    await supabase.from("support_tickets").delete().eq("id", ticket.id);
    toast.success("Ticket deleted");
    window.location.href = "/support";
  }

  const closed = ticket.status === "closed";

  return (
    <Layout>
      <div className="container py-10 max-w-3xl">
        <Link to="/support" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary"><ArrowLeft className="h-4 w-4" />All tickets</Link>
        <Card className="glass-strong p-5 mt-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-2xl font-bold flex items-center gap-2"><TicketIcon className="h-5 w-5 text-primary" />{ticket.subject}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">{ticket.status}</Badge>
              {isMod && (
                <>
                  {closed
                    ? <Button size="sm" variant="outline" onClick={reopen}>Reopen</Button>
                    : <Button size="sm" variant="outline" onClick={closeTicket}>Close</Button>}
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={deleteTicket}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="glass mt-3 flex flex-col h-[60vh]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.map((m) => {
              const mine = m.user_id === userId && !m.is_ai;
              const author = profiles[m.user_id]?.name ?? "User";
              return (
                <div key={m.id} className={`flex ${m.is_ai ? "justify-start" : mine ? "justify-end" : "justify-start"} group`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.is_ai ? "bg-accent/20 border border-accent/40" : mine ? "bg-primary/20 border border-primary/40" : "bg-secondary"}`}>
                    <div className="text-[10px] mb-1 opacity-70 flex items-center gap-1">
                      {m.is_ai ? <><Sparkles className="h-3 w-3" />AI Assistant</> : author}
                      <span className="ml-2">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                    {m.image_url && <img src={m.image_url} alt="" className="mt-1 rounded max-h-64 border border-border" />}
                  </div>
                  {(isMod || mine) && (
                    <button onClick={() => deleteMsg(m.id)} className="opacity-0 group-hover:opacity-100 text-xs text-destructive ml-1 self-center"><X className="h-3 w-3" /></button>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {closed ? (
            <div className="p-3 border-t border-border text-center text-sm text-muted-foreground">This ticket is closed.</div>
          ) : (
            <div className="p-3 border-t border-border flex gap-2">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])} />
              <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()} title="Attach image"><ImageIcon className="h-4 w-4" /></Button>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={isMod ? "Reply to user…" : "Reply…"} onKeyDown={(e) => e.key === "Enter" && send()} />
              <Button onClick={send} className="btn-luxury" disabled={sending}><Send className="h-4 w-4" /></Button>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
