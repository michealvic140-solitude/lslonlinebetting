import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/TeamLogo";
import { useConfirm } from "@/components/ConfirmDialog";
import { Sparkles, Send, ArrowLeft, Ticket as TicketIcon, Copy, Check, X, Image as ImageIcon, Share2, Trash2, Lock as LockIcon, Clock as ClockIcon, ShieldCheck, Trophy } from "lucide-react";
import { GangLogo } from "@/components/GangLogo";
import { toast } from "sonner";

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
      .select("*, bet_selections(*, matches!match_id(name, status, home_score, away_score, home_team:teams!home_team_id(name,logo_url), away_team:teams!away_team_id(name,logo_url)), markets!market_id(name))")
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
      <div className="container py-10 max-w-xl">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />My bets</Link>
        <BetVoucher bet={bet} sels={sels} statusBadge={statusBadge} allWon={allWon} copy={copy} shareCode={shareCode} />

        {!isOwner && (
          <Card className="glass mt-4 p-3 text-xs text-muted-foreground">
            Viewing a shared booking. Use the booking code on the home page to copy these picks to your own slip.
          </Card>
        )}
      </div>
    </Layout>
  );
}

/* ====== Premium Glassmorphism Bet Voucher ====== */
export function BetVoucher({ bet, sels, statusBadge, allWon, copy, shareCode }: {
  bet: any; sels: any[]; statusBadge: { label: string; cls: string; Icon: any }; allWon: boolean;
  copy: (t: string) => void; shareCode: () => void;
}) {
  const StatusIcon = statusBadge.Icon;
  return (
    <div className="relative px-1 py-6">
      {/* Outer ambient glow */}
      <div className="absolute -inset-6 rounded-[40px] bg-[radial-gradient(circle_at_30%_20%,oklch(0.85_0.22_152/0.30),transparent_60%),radial-gradient(circle_at_80%_80%,oklch(0.82_0.17_90/0.22),transparent_60%)] blur-3xl pointer-events-none" />

      <div className="relative mx-auto rounded-[28px] voucher-frame voucher-bg overflow-hidden">
        {/* Holographic top tab */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 rounded-b-2xl overflow-hidden">
          <div className="absolute inset-0 voucher-holo" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
        </div>
        {/* Holographic bottom tab */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-7 rounded-t-2xl overflow-hidden">
          <div className="absolute inset-0 voucher-holo" />
          <div className="absolute inset-0 bg-gradient-to-t from-transparent to-black/30" />
        </div>
        {/* Holographic side patches (corners only, like reference) */}
        <div className="absolute left-2 top-3 w-4 h-10 rounded voucher-holo opacity-80" />
        <div className="absolute right-2 top-3 w-4 h-10 rounded voucher-holo opacity-80" />
        <div className="absolute left-2 bottom-3 w-4 h-10 rounded voucher-holo opacity-80" />
        <div className="absolute right-2 bottom-3 w-4 h-10 rounded voucher-holo opacity-80" />
        {/* Circuit pattern */}
        <div className="absolute inset-0 voucher-circuit pointer-events-none" />

        <div className="relative px-7 pt-12 pb-8 space-y-6">
          {/* HEADER */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <GangLogo size={26} withGlow={false} />
              <span className="text-[11px] tracking-[0.35em] text-muted-foreground font-bold">LOMITA SHOOTERS LEAGUE</span>
            </div>
            <h2 className="font-display text-4xl font-black tracking-[0.08em] gold-foil neon-green inline-block">
              <span className="gold-foil">BET</span> <span className="neon-green">VOUCHER</span>
            </h2>
            <div className="mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
          </div>

          {/* CODES */}
          <div className="rounded-2xl voucher-inner p-4 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Booking Code</div>
              <button onClick={() => copy(bet.booking_code)} className="mt-1 inline-flex items-center gap-2 font-mono font-black text-2xl gold-foil hover:opacity-80 truncate max-w-full">
                {bet.booking_code} <Copy className="h-4 w-4 text-primary shrink-0" />
              </button>
              <button onClick={shareCode} className="mt-1 text-xs neon-green inline-flex items-center gap-1 hover:underline">
                <Share2 className="h-3 w-3" />Share booking
              </button>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Tracking ID</div>
              <button onClick={() => copy(bet.tracking_id)} className="mt-1 inline-flex items-center gap-1 ml-auto font-mono font-black text-lg gold-foil hover:opacity-80 max-w-full truncate">
                {bet.tracking_id} <Copy className="h-3 w-3 text-primary shrink-0" />
              </button>
              {bet.profiles?.full_name && <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">By {bet.profiles.full_name}</div>}
            </div>
          </div>

          {/* SELECTIONS */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Selections ({sels.length})</div>
            {sels.map((s: any) => {
              const m = s.matches;
              const live = m?.status === "live";
              const ended = m?.status === "ended";
              const won = s.result === "won";
              const lost = s.result === "lost";
              const sBadge = won ? "neon-green-border text-emerald-300 bg-emerald-500/15"
                : lost ? "border border-destructive/40 text-destructive bg-destructive/10"
                : "neon-green-border text-emerald-300 bg-emerald-500/10";
              const sLabel = won ? "WON" : lost ? "LOST" : live ? "LIVE" : ended ? "—" : "PENDING";
              const SIcon = won ? Trophy : lost ? X : live ? ClockIcon : ClockIcon;
              return (
                <div key={s.id} className="relative rounded-2xl voucher-inner p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-muted-foreground">{s.markets?.name}</div>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${sBadge}`}>
                      {sLabel} <SIcon className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="mt-2 font-extrabold text-lg flex items-center gap-2">
                    <TeamLogo name={m?.home_team?.name} url={m?.home_team?.logo_url} size={22} rounded="full" />
                    <span className="truncate">{m?.home_team?.name} <span className="text-muted-foreground font-normal">vs</span> {m?.away_team?.name}</span>
                    <TeamLogo name={m?.away_team?.name} url={m?.away_team?.logo_url} size={22} rounded="full" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 items-end">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pick</div>
                      <div className="font-extrabold text-base">{s.selection_label}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{ended ? "Final" : live ? "Live" : "Score"}</div>
                      <div className={`font-mono font-extrabold text-base ${live ? "neon-green animate-pulse" : ""}`}>{m ? `${m.home_score}-${m.away_score}` : "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Odds</div>
                      <div className="font-mono font-black text-2xl gold-foil">{Number(s.locked_odds).toFixed(2)}</div>
                    </div>
                  </div>
                  {/* Status orb */}
                  <span className="absolute top-3 right-3 hidden">{statusBadge.label}</span>
                </div>
              );
            })}
          </div>

          {/* Status pill */}
          <div className="flex justify-center">
            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black tracking-[0.25em] ${statusBadge.cls}`}>
              {statusBadge.label} <StatusIcon className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* TOTALS */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl voucher-inner p-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Stake</div>
              <div className="font-display font-black text-2xl mt-1">{Number(bet.stake).toLocaleString()}</div>
            </div>
            <div className="rounded-xl voucher-inner p-3" style={{ boxShadow: "inset 0 0 18px oklch(0.85 0.22 152 / 0.20), 0 0 0 1px oklch(0.85 0.22 152 / 0.6)" }}>
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Total Odds</div>
              <div className="font-display font-black text-2xl mt-1 neon-green">{Number(bet.total_odds).toFixed(2)}</div>
            </div>
            <div className="rounded-xl voucher-inner p-3" style={{ boxShadow: "inset 0 0 18px oklch(0.82 0.17 90 / 0.20), 0 0 0 1px oklch(0.82 0.17 90 / 0.6)" }}>
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Potential</div>
              <div className="font-display font-black text-2xl mt-1 gold-foil">{Number(bet.potential_payout).toLocaleString()}</div>
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Booked {new Date(bet.created_at).toLocaleString()}</span>
            {bet.settled_at && <span>Settled {new Date(bet.settled_at).toLocaleString()}</span>}
          </div>

          {bet.status === "won" && allWon && (
            <div className="rounded-xl py-3 neon-green-border bg-emerald-500/10 text-center font-extrabold text-emerald-300 flex items-center justify-center gap-2"><Check className="h-5 w-5" />Tokens credited to your wallet</div>
          )}
          {bet.status === "lost" && (
            <div className="rounded-xl py-3 border border-destructive/40 bg-destructive/10 text-center font-extrabold text-destructive flex items-center justify-center gap-2"><X className="h-5 w-5" />Better luck next round</div>
          )}
          {bet.status === "open" && (
            <div className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
              <LockIcon className="h-3 w-3" />Cash-out is disabled. Bets ride to settlement.
            </div>
          )}
        </div>
      </div>
    </div>
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
