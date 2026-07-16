import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ticket as TicketIcon, ChevronRight, ArrowLeft, History as HistoryIcon, Dice5, Coins, Disc3, Gamepad2 } from "lucide-react";

export const Route = createFileRoute("/bet-history")({
  head: () => ({
    meta: [
      { title: "Bet History — ECB" },
      { name: "description", content: "All your sports bet slips, lottery tickets and arcade plays in one place." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BetHistoryPage,
});

function BetHistoryPage() {
  const { user } = useAuth();
  const [bets, setBets] = useState<any[]>([]);
  const [lottery, setLottery] = useState<any[]>([]);
  const [arcade, setArcade] = useState<any[]>([]);
  const [betFilter, setBetFilter] = useState<string>("all");
  const [betSearch, setBetSearch] = useState("");
  const [selectedLottery, setSelectedLottery] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    const loadBets = () => supabase.from("bets")
      .select("*, bet_selections(*, matches!match_id(name))")
      .eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setBets(data ?? []));
    const loadLottery = () => (supabase as any).from("lottery_tickets")
      .select("*, lottery_draws(title,winning_number,winning_numbers,multiplier,drawn_at,status,number_max)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)
      .then(({ data }: any) => setLottery(data ?? []));
    const loadArcade = () => (supabase as any).from("casino_plays")
      .select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)
      .then(({ data }: any) => setArcade(data ?? []));
    loadBets(); loadLottery(); loadArcade();
    const ch = supabase.channel(`hist-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter: `user_id=eq.${user.id}` }, loadBets)
      .on("postgres_changes", { event: "*", schema: "public", table: "lottery_tickets", filter: `user_id=eq.${user.id}` }, loadLottery)
      .on("postgres_changes", { event: "*", schema: "public", table: "casino_plays", filter: `user_id=eq.${user.id}` }, loadArcade)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!user) return <Layout><div className="container mx-auto px-4 py-16 text-center"><p>Please <Link to="/login" className="text-primary underline">sign in</Link>.</p></div></Layout>;

  const gameMeta: Record<string, { label: string; Icon: any }> = {
    coinflip: { label: "Coin Flip", Icon: Coins },
    wheel: { label: "Wheel of Fortune", Icon: Disc3 },
    scratch: { label: "Scratch Card", Icon: TicketIcon },
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Your activity</p>
          <h1 className="text-3xl md:text-4xl font-extrabold gradient-gold-text flex items-center gap-2 mt-1"><HistoryIcon className="h-7 w-7 text-primary" />Bet History</h1>
          <p className="text-sm text-muted-foreground mt-1">Sports slips, lottery tickets and arcade plays.</p>
        </div>

        <Tabs defaultValue="sports">
          <TabsList className="grid grid-cols-3 max-w-md">
            <TabsTrigger value="sports"><TicketIcon className="h-3.5 w-3.5 mr-1" />Sports ({bets.length})</TabsTrigger>
            <TabsTrigger value="lottery"><Dice5 className="h-3.5 w-3.5 mr-1" />Lottery ({lottery.length})</TabsTrigger>
            <TabsTrigger value="arcade"><Gamepad2 className="h-3.5 w-3.5 mr-1" />Arcade ({arcade.length})</TabsTrigger>
          </TabsList>

          {/* SPORTS */}
          <TabsContent value="sports" className="mt-4">
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
                      <button key={f.k} onClick={() => setBetFilter(f.k)}
                        className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${active ? "bg-primary/20 border-primary/60 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>
                        {f.label} <span className="opacity-70">({n})</span>
                      </button>
                    );
                  })}
                </div>
                <Input value={betSearch} onChange={(e) => setBetSearch(e.target.value)} placeholder="Search by tracking ID, booking code or match…" className="max-w-md" />
              </div>
            )}
            <div className="space-y-3">
              {bets.length === 0 && <p className="text-muted-foreground text-sm">No bets yet.</p>}
              {(() => {
                const q = betSearch.trim().toLowerCase();
                const filtered = bets.filter((b) => {
                  if (betFilter !== "all" && b.status !== betFilter) return false;
                  if (!q) return true;
                  const hay = [b.tracking_id, b.booking_code, ...(b.bet_selections ?? []).map((s: any) => s.matches?.name || s.selection_label)].join(" ").toLowerCase();
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
          </TabsContent>

          {/* LOTTERY */}
          <TabsContent value="lottery" className="mt-4 space-y-3">
            {lottery.length === 0 && <p className="text-muted-foreground text-sm">No lottery tickets yet.</p>}
            {lottery.map((t) => {
              const picks = Array.isArray(t.numbers) && t.numbers.length ? t.numbers : (t.number != null ? [t.number] : []);
              return (
                <button key={t.id} type="button" onClick={() => setSelectedLottery(t)} className="w-full text-left">
                  <Card className="p-3 flex items-center justify-between gap-3 hover:border-primary/60 transition group cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-bold text-sm flex items-center gap-1.5"><Dice5 className="h-4 w-4 text-primary" />{t.lottery_draws?.title || "Lottery"}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {picks.map((n: number, i: number) => (
                          <span key={i} className="grid h-6 min-w-6 px-1 place-items-center rounded-md bg-primary/15 border border-primary/30 text-primary text-[11px] font-black">{n}</span>
                        ))}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">stake {Number(t.stake).toLocaleString()} · {new Date(t.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <Badge variant="outline" className={t.status === "won" ? "border-emerald-500/50 text-emerald-300" : t.status === "lost" ? "border-destructive/50 text-destructive" : "border-amber-500/50 text-amber-300"}>
                          {String(t.status || "open").toUpperCase()}
                        </Badge>
                        {Number(t.payout) > 0 && <div className="text-[11px] text-emerald-300 mt-1">+{Number(t.payout).toLocaleString()}</div>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                    </div>
                  </Card>
                </button>
              );
            })}
            <LotteryTicketDialog ticket={selectedLottery} onClose={() => setSelectedLottery(null)} />
          </TabsContent>

          {/* ARCADE */}
          <TabsContent value="arcade" className="mt-4 space-y-3">
            {arcade.length === 0 && <p className="text-muted-foreground text-sm">No arcade plays yet.</p>}
            {arcade.map((r) => {
              const meta = gameMeta[r.game] ?? { label: r.game, Icon: Gamepad2 };
              const Icon = meta.Icon;
              const win = Number(r.payout) > 0;
              return (
                <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm flex items-center gap-1.5"><Icon className="h-4 w-4 text-primary" />{meta.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">{r.outcome ? `${r.outcome} · ` : ""}stake {Number(r.stake).toLocaleString()} · {new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className={win ? "border-emerald-500/50 text-emerald-300" : "border-destructive/50 text-destructive"}>
                      {win ? `+${Number(r.payout).toLocaleString()}` : "LOST"}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function LotteryTicketDialog({ ticket, onClose }: { ticket: any | null; onClose: () => void }) {
  if (!ticket) return null;
  const draw = ticket.lottery_draws ?? {};
  const picks: number[] = Array.isArray(ticket.numbers) && ticket.numbers.length ? ticket.numbers : (ticket.number != null ? [ticket.number] : []);
  const drawn: number[] = Array.isArray(draw.winning_numbers) && draw.winning_numbers.length
    ? draw.winning_numbers
    : (draw.winning_number != null ? [draw.winning_number] : []);
  const isDrawn = draw.status === "drawn" || drawn.length > 0;
  const overall = String(ticket.status || "open").toLowerCase();
  const overallMeta =
    overall === "won" ? { label: "WON", cls: "text-emerald-300 border-emerald-500/50 bg-emerald-500/10", glow: "shadow-[0_0_40px_-8px_rgba(16,185,129,0.6)]" }
    : overall === "lost" ? { label: "LOST", cls: "text-destructive border-destructive/50 bg-destructive/10", glow: "shadow-[0_0_40px_-8px_rgba(239,68,68,0.5)]" }
    : { label: "PENDING", cls: "text-amber-300 border-amber-500/50 bg-amber-500/10", glow: "shadow-[0_0_40px_-8px_rgba(245,158,11,0.5)]" };
  const hitCount = picks.filter((n) => drawn.includes(n)).length;

  return (
    <Dialog open={!!ticket} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-card/80 to-background/90 backdrop-blur-2xl shadow-[0_20px_80px_-20px_rgba(0,0,0,0.8)]">
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />
        <DialogHeader className="relative">
          <div className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Lottery ticket</div>
          <DialogTitle className="flex items-center gap-2 gradient-gold-text text-xl">
            <Dice5 className="h-5 w-5 text-primary" />{draw.title || "Lucky Numbers"}
          </DialogTitle>
        </DialogHeader>

        <div className="relative space-y-4">
          {/* Overall status banner */}
          <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between ${overallMeta.cls} ${overallMeta.glow}`}>
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-80">Overall result</div>
              <div className="text-2xl font-black leading-none mt-0.5">{overallMeta.label}</div>
            </div>
            <div className="text-right">
              {overall === "won" && Number(ticket.payout) > 0 ? (
                <>
                  <div className="text-[10px] uppercase tracking-widest opacity-80">Payout</div>
                  <div className="text-lg font-black">+{Number(ticket.payout).toLocaleString()}</div>
                </>
              ) : (
                <>
                  <div className="text-[10px] uppercase tracking-widest opacity-80">Multiplier</div>
                  <div className="text-lg font-black">x{draw.multiplier ?? "—"}</div>
                </>
              )}
            </div>
          </div>

          {/* Your numbers with per-number status */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Your numbers {isDrawn && <span className="text-primary">· {hitCount}/{picks.length} matched</span>}</div>
            <div className="flex flex-wrap gap-2">
              {picks.map((n, i) => {
                const hit = drawn.includes(n);
                const cls = !isDrawn
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                  : hit
                  ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-200 shadow-[0_0_18px_-4px_rgba(16,185,129,0.7)]"
                  : "bg-destructive/10 border-destructive/40 text-destructive/90";
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className={`grid h-11 w-11 place-items-center rounded-xl border text-base font-black ${cls}`}>{n}</span>
                    <span className={`text-[8px] uppercase tracking-widest ${!isDrawn ? "text-amber-300/80" : hit ? "text-emerald-300" : "text-destructive/70"}`}>{!isDrawn ? "Pending" : hit ? "Hit" : "Miss"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drawn numbers */}
          {isDrawn && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Winning numbers</div>
              <div className="flex flex-wrap gap-2">
                {drawn.map((n, i) => (
                  <span key={i} className="grid h-9 min-w-9 px-1 place-items-center rounded-lg bg-gradient-gold text-background text-sm font-black shadow-gold">{n}</span>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Stake</div>
              <div className="font-bold text-primary">{Number(ticket.stake).toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Placed</div>
              <div className="font-semibold">{new Date(ticket.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            {draw.drawn_at && (
              <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2 col-span-2">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Drawn at</div>
                <div className="font-semibold">{new Date(draw.drawn_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
