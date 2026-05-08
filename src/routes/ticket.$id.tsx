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
import { Sparkles, Send, ArrowLeft, Ticket as TicketIcon, Crosshair, Copy, Check, X, Image as ImageIcon, Share2, Trash2, Lock as LockIcon } from "lucide-react";
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
      .select("*, bet_selections(*, matches:match_id(name, status, home_score, away_score, home_team:home_team_id(name,logo_url), away_team:away_team_id(name,logo_url)), markets:market_id(name))")
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
    bet.status === "won" ? { label: "WON", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" }
    : bet.status === "lost" ? { label: "LOST", cls: "bg-destructive/20 text-destructive border-destructive/40" }
    : bet.status === "cashed_out" ? { label: "CASHED OUT", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" }
    : { label: "OPEN", cls: "bg-primary/20 text-primary border-primary/40" };

  const allWon = sels.length > 0 && sels.every((s: any) => s.result === "won");
  function copy(t: string) { navigator.clipboard.writeText(t); toast.success("Copied"); }

  async function shareCode() {
    const url = `${window.location.origin}/?code=${bet.booking_code}`;
    if (navigator.share) try { await navigator.share({ title: `LSL Booking ${bet.booking_code}`, url }); return; } catch {/*ignore*/}
    navigator.clipboard.writeText(url); toast.success("Share link copied");
  }

  return (
    <Layout>
      <div className="container py-10 max-w-2xl">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />My bets</Link>

        {/* Glassmorphism Voucher */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/20 to-primary/30 blur-2xl opacity-60" />
          <Card className="relative overflow-hidden border-primary/30 backdrop-blur-2xl bg-card/40 shadow-2xl rounded-3xl">
            {/* Notches */}
            <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-background border border-border" />
            <div className="absolute right-[-12px] top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-background border border-border" />

            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-primary/20 to-accent/20 border-b border-dashed border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crosshair className="h-7 w-7 text-primary" />
                  <div>
                    <div className="text-[10px] tracking-widest text-muted-foreground">LOMITA SHOOTERS LEAGUE</div>
                    <div className="font-extrabold text-xl tracking-wider gradient-gold-text">BET VOUCHER</div>
                  </div>
                </div>
                <Badge className={`text-sm font-bold px-3 py-1 border ${statusBadge.cls}`}>{statusBadge.label}</Badge>
              </div>
            </div>

            {/* Codes + share */}
            <div className="p-5 grid grid-cols-2 gap-3 border-b border-dashed border-border">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Booking code</div>
                <button onClick={() => copy(bet.booking_code)} className="font-mono font-bold text-2xl flex items-center gap-2 hover:text-primary">{bet.booking_code} <Copy className="h-4 w-4" /></button>
                <button onClick={shareCode} className="mt-1 text-xs text-accent inline-flex items-center gap-1 hover:underline"><Share2 className="h-3 w-3" />Share booking</button>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tracking ID</div>
                <button onClick={() => copy(bet.tracking_id)} className="font-mono font-bold flex items-center gap-1 ml-auto hover:text-primary">{bet.tracking_id} <Copy className="h-3 w-3" /></button>
                {bet.profiles?.full_name && <div className="text-[10px] text-muted-foreground mt-1">By {bet.profiles.full_name}</div>}
              </div>
            </div>

            {/* Selections */}
            <div className="p-5 space-y-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Selections ({sels.length})</div>
              {sels.map((s: any) => {
                const m = s.matches;
                const live = m?.status === "live";
                const ended = m?.status === "ended";
                const sBadge = s.result === "won" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : s.result === "lost" ? "bg-destructive/20 text-destructive border-destructive/40"
                  : live ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-muted text-muted-foreground border-border";
                const sLabel = s.result ? s.result.toUpperCase() : live ? "LIVE" : ended ? "—" : "PENDING";
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-background/40 backdrop-blur p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">{s.markets?.name}</div>
                      <Badge variant="outline" className={`text-[10px] ${sBadge}`}>{sLabel}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <TeamLogo name={m?.home_team?.name} url={m?.home_team?.logo_url} size={28} rounded="full" />
                      <div className="font-bold text-sm flex-1 truncate">{m?.home_team?.name} vs {m?.away_team?.name}</div>
                      <TeamLogo name={m?.away_team?.name} url={m?.away_team?.logo_url} size={28} rounded="full" />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-sm">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Pick</div>
                        <div className="font-bold">{s.selection_label}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">{ended ? "Final" : live ? "Live" : "Score"}</div>
                        <div className={`font-mono font-bold ${live ? "text-amber-300 animate-pulse" : ""}`}>{m ? `${m.home_score}–${m.away_score}` : "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">Odds</div>
                        <div className="font-mono font-bold text-primary">{Number(s.locked_odds).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="p-5 border-t border-dashed border-border grid grid-cols-3 gap-3 text-center">
              <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Stake</div><div className="font-bold text-lg">{bet.stake.toLocaleString()}</div></div>
              <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Odds</div><div className="font-bold text-lg gradient-gold-text">{Number(bet.total_odds).toFixed(2)}</div></div>
              <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Potential</div><div className="font-bold text-lg text-accent">{bet.potential_payout.toLocaleString()}</div></div>
            </div>

            <div className="px-5 pb-5 flex justify-between items-center text-[10px] text-muted-foreground">
              <span>Booked {new Date(bet.created_at).toLocaleString()}</span>
              {bet.settled_at && <span>Settled {new Date(bet.settled_at).toLocaleString()}</span>}
            </div>

            {bet.status === "won" && allWon && (
              <div className="p-4 border-t border-border bg-emerald-500/10 text-emerald-300 text-center font-bold flex items-center justify-center gap-2"><Check className="h-5 w-5" />Tokens credited</div>
            )}
            {bet.status === "lost" && (
              <div className="p-4 border-t border-border bg-destructive/10 text-destructive text-center font-bold flex items-center justify-center gap-2"><X className="h-5 w-5" />Better luck next round</div>
            )}
            {bet.status === "open" && (
              <div className="p-3 border-t border-border bg-background/40 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                <LockIcon className="h-3 w-3" />Cash-out is disabled. Bets ride to settlement.
              </div>
            )}
          </Card>
        </div>

        {!isOwner && (
          <Card className="glass mt-4 p-3 text-xs text-muted-foreground">
            Viewing a shared booking. Use the booking code on the home page to copy these picks to your own slip.
          </Card>
        )}
      </div>
    </Layout>
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
