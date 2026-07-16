import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Dice5, Sparkles, Trophy, Ticket as TicketIcon } from "lucide-react";

export const Route = createFileRoute("/lottery")({
  head: () => ({
    meta: [
      { title: "Lucky Numbers Lottery — E-Football Competition Bet" },
      { name: "description", content: "Pick your lucky number, stake your tokens and win big on the ECB lottery draws." },
      { property: "og:title", content: "Lucky Numbers Lottery — ECB" },
      { property: "og:description", content: "Pick a number, stake tokens, win multiplied payouts." },
    ],
  }),
  component: LotteryPage,
});

function LotteryPage() {
  const { user, profile, refresh } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [intro, setIntro] = useState("");
  const [minStake, setMinStake] = useState(100000);
  const [maxStake, setMaxStake] = useState(50000000);
  const [draws, setDraws] = useState<any[]>([]);
  const [myTickets, setMyTickets] = useState<any[]>([]);

  async function load() {
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from("app_settings").select("lottery_enabled,lottery_intro,lottery_min_stake,lottery_max_stake").eq("id", 1).maybeSingle(),
      supabase.from("lottery_draws").select("*").order("created_at", { ascending: false }),
    ]);
    if (s) {
      setEnabled(!!(s as any).lottery_enabled);
      setIntro((s as any).lottery_intro ?? "");
      setMinStake(Number((s as any).lottery_min_stake ?? 100000));
      setMaxStake(Number((s as any).lottery_max_stake ?? 50000000));
    }
    setDraws(d ?? []);
    if (user) {
      const { data: t } = await supabase.from("lottery_tickets").select("*, lottery_draws(title,winning_number,status,multiplier)").eq("user_id", user.id).order("created_at", { ascending: false });
      setMyTickets(t ?? []);
    }
  }
  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    const ch = supabase.channel("lottery-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "lottery_draws" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const openDraws = draws.filter((d) => d.status === "open");
  const pastDraws = draws.filter((d) => d.status === "drawn");

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <div className="relative overflow-hidden rounded-3xl p-8 mb-8 border border-primary/30 bg-gradient-to-br from-amber-500/10 via-background to-background">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-2xl bg-gradient-gold grid place-items-center shadow-gold"><Dice5 className="h-7 w-7 text-background" /></div>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold gradient-gold-text">Lucky Numbers</h1>
              <p className="text-sm text-muted-foreground">{intro || "Pick your lucky number, stake your tokens and win big."}</p>
            </div>
          </div>
          {user && <p className="text-xs text-muted-foreground mt-2">Your balance: <span className="text-primary font-bold">{profile?.token_balance?.toLocaleString() ?? 0}</span> tokens</p>}
        </div>

        {!user && (
          <Card className="p-8 text-center"><p>Please <Link to="/login" className="text-primary underline">sign in</Link> to play the lottery.</p></Card>
        )}

        {user && !enabled && (
          <Card className="p-8 text-center text-muted-foreground"><Dice5 className="h-10 w-10 mx-auto mb-3 opacity-50" />The lottery is currently closed. Check back soon!</Card>
        )}

        {user && enabled && (
          <>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Open Draws</h2>
            {openDraws.length === 0 && <p className="text-sm text-muted-foreground mb-8">No open draws right now.</p>}
            <div className="grid gap-4 md:grid-cols-2 mb-10">
              {openDraws.map((dr) => (
                <DrawCard key={dr.id} draw={dr} minStake={minStake} maxStake={maxStake} onDone={() => { load(); refresh(); }} />
              ))}
            </div>
          </>
        )}

        {user && myTickets.length > 0 && (
          <>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><TicketIcon className="h-5 w-5 text-primary" />My Tickets</h2>
            <div className="space-y-2 mb-10">
              {myTickets.map((t) => (
                <Card key={t.id} className="p-3 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-bold text-sm">{t.lottery_draws?.title} · picked <span className="text-primary">{(Array.isArray(t.numbers) && t.numbers.length ? t.numbers : [t.number]).join(", ")}</span></div>
                    <div className="text-xs text-muted-foreground">Stake {Number(t.stake).toLocaleString()}{t.lottery_draws?.status === "drawn" && <> · winner was {t.lottery_draws?.winning_number}</>}</div>
                  </div>
                  <Badge variant="outline" className={t.status === "won" ? "border-emerald-500/50 text-emerald-300" : t.status === "lost" ? "border-destructive/50 text-destructive" : "border-primary/50 text-primary"}>
                    {t.status === "won" ? `WON ${Number(t.payout).toLocaleString()}` : t.status.toUpperCase()}
                  </Badge>
                </Card>
              ))}
            </div>
          </>
        )}

        {pastDraws.length > 0 && (
          <>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" />Recent Results</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {pastDraws.slice(0, 6).map((dr) => (
                <Card key={dr.id} className="p-4 text-center">
                  <div className="text-xs text-muted-foreground mb-1">{dr.title}</div>
                  <div className="text-4xl font-extrabold gradient-gold-text">{(Array.isArray(dr.winning_numbers) && dr.winning_numbers.length ? dr.winning_numbers : [dr.winning_number]).filter((n: any) => n !== null && n !== undefined).join(" · ")}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">x{dr.multiplier} payout</div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function DrawCard({ draw, minStake, maxStake, onDone }: { draw: any; minStake: number; maxStake: number; onDone: () => void }) {
  const picksNeeded = Math.max(1, Math.min(10, Number(draw.picks_count ?? 1)));
  const [picked, setPicked] = useState<number[]>([]);
  const [stake, setStake] = useState(minStake);
  const [submitting, setSubmitting] = useState(false);
  const numbers = Array.from({ length: draw.number_max + 1 }, (_, i) => i);

  function toggle(n: number) {
    setPicked((cur) => {
      if (cur.includes(n)) return cur.filter((x) => x !== n);
      if (cur.length >= picksNeeded) {
        toast.error(`Pick exactly ${picksNeeded} number${picksNeeded === 1 ? "" : "s"}`);
        return cur;
      }
      return [...cur, n];
    });
  }

  async function play() {
    if (picked.length !== picksNeeded) return toast.error(`Pick exactly ${picksNeeded} number${picksNeeded === 1 ? "" : "s"}`);
    if (stake < minStake) return toast.error(`Minimum stake is ${minStake.toLocaleString()}`);
    if (stake > maxStake) return toast.error(`Maximum stake is ${maxStake.toLocaleString()}`);
    setSubmitting(true);
    const sorted = [...picked].sort((a, b) => a - b);
    const { error } = picksNeeded === 1
      ? await (supabase.rpc as any)("place_lottery_ticket", { _draw_id: draw.id, _number: sorted[0], _stake: stake })
      : await (supabase.rpc as any)("place_lottery_ticket_multi", { _draw_id: draw.id, _numbers: sorted, _stake: stake });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Ticket placed on ${sorted.join(", ")}! Win x${draw.multiplier} if drawn.`);
    setPicked([]);
    onDone();
  }

  return (
    <Card className="p-5 border-primary/30">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold">{draw.title}</div>
        <Badge variant="outline" className="border-amber-500/50 text-amber-300">x{draw.multiplier}</Badge>
      </div>
      <div className="text-xs text-muted-foreground mb-3">Pick <span className="text-primary font-bold">{picksNeeded}</span> number{picksNeeded === 1 ? "" : "s"} from 0 to {draw.number_max} <span className="text-primary">({picked.length}/{picksNeeded} selected)</span></div>
      <div className="flex flex-wrap gap-2 mb-4">
        {numbers.map((n) => (
          <button
            key={n}
            onClick={() => toggle(n)}
            className={`h-11 w-11 rounded-xl font-bold border transition ${picked.includes(n) ? "bg-gradient-gold text-background border-primary shadow-gold scale-105" : "border-border text-foreground hover:border-primary/60"}`}
          >{n}</button>
        ))}
      </div>
      <label className="text-xs uppercase tracking-widest text-muted-foreground">Stake</label>
      <Input type="number" min={minStake} max={maxStake} value={stake} onChange={(e) => setStake(Number(e.target.value))} className="mb-3" />
      <div className="text-xs text-muted-foreground mb-3">Potential win: <span className="text-emerald-300 font-bold">{(stake * Number(draw.multiplier)).toLocaleString()}</span></div>
      <Button className="btn-luxury w-full" onClick={play} disabled={submitting}>{submitting ? "Placing…" : "Place Ticket"}</Button>
    </Card>
  );
}
