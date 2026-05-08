import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/Countdown";
import { fetchMatch, type MatchRow } from "@/lib/queries";
import { TeamLogo } from "@/components/TeamLogo";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { ArrowLeft, MapPin, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/matches/$matchId")({
  head: ({ params }) => ({ meta: [{ title: `Match ${params.matchId} — LSL` }, { name: "description", content: "Match details, markets and odds." }] }),
  component: Page,
});

function Page() {
  const { matchId } = Route.useParams();
  const [m, setM] = useState<MatchRow | null>(null);
  const [loading, setLoading] = useState(true);
  const { selections, add, remove } = useBetSlip();

  useEffect(() => {
    fetchMatch(matchId).then(setM).finally(() => setLoading(false));
    const ch = supabase.channel(`m-${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, () => fetchMatch(matchId).then(setM))
      .on("postgres_changes", { event: "*", schema: "public", table: "odds" }, () => fetchMatch(matchId).then(setM))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId]);

  if (loading) return <Layout><div className="container py-10">Loading…</div></Layout>;
  if (!m) return <Layout><div className="container py-10">Match not found. <Link to="/matches" className="text-primary underline">Back</Link></div></Layout>;

  const home = m.home_team?.name ?? "Home";
  const away = m.away_team?.name ?? "Away";
  const selectedOdd = selections.find((s) => s.match_id === m.id)?.odd_id;

  return (
    <Layout>
      <div className="container py-10 max-w-5xl">
        <Link to="/matches" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary"><ArrowLeft className="h-4 w-4" />All matches</Link>
        <Card className="glass-strong p-6 mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{m.name}</span>
            <span className="flex items-center gap-3">
              {m.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.location}</span>}
              {m.is_featured && <Badge variant="outline" className="border-primary/40 text-primary">Featured</Badge>}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 mt-6">
            <Side name={home} logo={m.home_team?.logo_url} score={m.home_score} status={m.status} />
            <div className="text-center">
              <div className="text-[10px] tracking-widest text-muted-foreground">{m.status.toUpperCase()}</div>
              {m.status === "scheduled" ? <Countdown target={m.start_time} /> : <div className="text-xl font-bold gradient-gold-text">{m.home_score} — {m.away_score}</div>}
            </div>
            <Side name={away} logo={m.away_team?.logo_url} score={m.away_score} status={m.status} align="right" />
          </div>
        </Card>

        <h2 className="text-xl font-bold mt-8 mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" />Markets</h2>
        {m.markets.length === 0 && <p className="text-muted-foreground text-sm">No markets yet.</p>}
        <div className="space-y-3">
          {m.markets.map((mk) => (
            <Card key={mk.id} className="glass p-4">
              <div className="flex items-center justify-between">
                <div className="font-bold">{mk.name}</div>
                <Badge variant="outline" className={mk.is_open ? "border-accent/40 text-accent" : "border-muted text-muted-foreground"}>
                  {mk.is_open ? "Open" : "Closed"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {mk.odds.map((o) => {
                  const sel = selectedOdd === o.id;
                  const locked = !mk.is_open || m.status !== "scheduled";
                  return (
                    <Button key={o.id} variant={sel ? "default" : "outline"} disabled={locked}
                      onClick={() => sel ? remove(o.id) : add({ match_id: m.id, match_name: `${home} vs ${away}`, market_id: mk.id, market_name: mk.name, odd_id: o.id, selection_label: o.label, odds: Number(o.value) })}>
                      <span className="text-xs">{o.label}</span>
                      <span className="ml-2 font-mono">{Number(o.value).toFixed(2)}</span>
                      {o.is_winner && <Badge className="ml-2 bg-accent text-accent-foreground">W</Badge>}
                    </Button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}

function Side({ name, score, status, logo, align = "left" }: { name: string; score: number; status: string; logo?: string | null; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo name={name} url={logo} size={56} rounded="md" />
      <div className="min-w-0">
        <div className="font-bold truncate text-lg">{name}</div>
        <div className="text-xs text-muted-foreground">{status === "scheduled" ? "—" : `Score ${score}`}</div>
      </div>
    </div>
  );
}
