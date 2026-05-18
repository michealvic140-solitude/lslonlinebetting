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
  head: ({ params }) => ({
    meta: [
      { title: `Match ${params.matchId} — Lomita Shooters League` },
      { name: "description", content: "Live match details, team line-ups, real-time odds, and betting markets for this Lomita Shooters League fixture." },
      { property: "og:title", content: `Match ${params.matchId} — Lomita Shooters League` },
      { property: "og:description", content: "Live team line-ups, real-time odds, and betting markets for this LSL fixture." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `https://lslonlinebetting.lovable.app/matches/${params.matchId}` },
    ],
    links: [{ rel: "canonical", href: `https://lslonlinebetting.lovable.app/matches/${params.matchId}` }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: `Lomita Shooters League — Match ${params.matchId}`,
        sport: "Competitive Shooting",
        url: `https://lslonlinebetting.lovable.app/matches/${params.matchId}`,
        organizer: {
          "@type": "Organization",
          name: "Lomita Shooters League",
          url: "https://lslonlinebetting.lovable.app/",
        },
      }),
    }],
  }),
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
          {[...m.markets]
            .sort((a, b) => Number(/correct\s*score/i.test(b.name)) - Number(/correct\s*score/i.test(a.name)))
            .map((mk) => {
            const isCS = /correct\s*score/i.test(mk.name);
            return (
              <Card key={mk.id} id={isCS ? "correct-score" : undefined} className={`glass p-4 ${isCS ? "border-primary/40 ring-1 ring-primary/30" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="font-bold flex items-center gap-2">
                    {mk.name}
                    {isCS && <Badge className="bg-primary/20 text-primary border-primary/40" variant="outline">{mk.odds.length} scores</Badge>}
                  </div>
                  <Badge variant="outline" className={mk.is_open ? "border-accent/40 text-accent" : "border-muted text-muted-foreground"}>
                    {mk.is_open ? "Open" : "Closed"}
                  </Badge>
                </div>
                {isCS ? (
                  <CorrectScoreGrid market={mk} matchLocked={!mk.is_open || m.status !== "scheduled"} matchId={m.id} matchName={`${home} vs ${away}`} selectedOdd={selectedOdd} add={add} remove={remove} homeName={home} awayName={away} />
                ) : (
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
                )}
              </Card>
            );
          })}
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

import { Input } from "@/components/ui/input";
import { Search, Plus as PlusIcon } from "lucide-react";

function CorrectScoreGrid({ market, matchLocked, matchId, matchName, selectedOdd, add, remove, homeName, awayName }: {
  market: any; matchLocked: boolean; matchId: string; matchName: string;
  selectedOdd: string | undefined;
  add: (s: any) => void; remove: (id: string) => void;
  homeName: string; awayName: string;
}) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<"all" | "home" | "draw" | "away">("all");

  // Sort: by lowest total goals then home goals
  const sorted = [...(market.odds ?? [])].sort((a: any, b: any) => {
    const pa = parseScore(a.label); const pb = parseScore(b.label);
    return (pa.h + pa.a) - (pb.h + pb.a) || pa.h - pb.h || pa.a - pb.a;
  });

  const filteredByTab = sorted.filter((o: any) => {
    const p = parseScore(o.label);
    if (tab === "home") return p.h > p.a;
    if (tab === "away") return p.a > p.h;
    if (tab === "draw") return p.h === p.a;
    return true;
  });
  const filtered = filteredByTab.filter((o: any) => {
    if (!search.trim()) return true;
    const q = search.replace(/[-:\s]/g, "");
    return o.label.replace(/[-:]/g, "").includes(q);
  });

  const visible = showAll || search.trim() ? filtered : filtered.slice(0, 12);

  if (sorted.length === 0) {
    return <div className="mt-3 text-sm text-muted-foreground">No correct-score odds posted yet.</div>;
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-background/40 p-1 text-xs">
        {([
          { k: "all", label: "All" },
          { k: "home", label: `${homeName} wins` },
          { k: "draw", label: "Draw" },
          { k: "away", label: `${awayName} wins` },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`rounded-md px-2 py-1.5 font-bold transition truncate ${tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search score (e.g. 2-1, 21, 1:3)" className="pl-9" />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {visible.map((o: any) => {
          const sel = selectedOdd === o.id;
          return (
            <button
              key={o.id}
              disabled={matchLocked}
              onClick={() => sel
                ? remove(o.id)
                : add({ match_id: matchId, match_name: matchName, market_id: market.id, market_name: market.name, odd_id: o.id, selection_label: `Correct Score [${o.label}]`, odds: Number(o.value) })}
              className={`relative rounded-xl border p-2 text-center transition ${
                sel ? "border-primary bg-primary/15 shadow-gold" : "border-border bg-background/40 hover:border-primary/50"
              } ${matchLocked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Score</div>
              <div className="font-mono font-black text-lg">{o.label}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Odds</div>
              <div className="font-mono font-bold text-primary">{Number(o.value).toFixed(2)}</div>
              {o.is_winner && <Badge className="absolute top-1 right-1 bg-accent text-accent-foreground text-[9px] px-1">W</Badge>}
              {sel && <div className="absolute top-1 left-1 h-2 w-2 rounded-full bg-primary animate-pulse" />}
            </button>
          );
        })}
      </div>
      {!search.trim() && filtered.length > 12 && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
          <PlusIcon className="h-3 w-3 mr-1" />{showAll ? "Show less" : `Show more (${filtered.length - 12})`}
        </Button>
      )}
    </div>
  );
}

function parseScore(label: string): { h: number; a: number } {
  const parts = label.split(/[-:]/).map((s) => Number(s.trim()));
  return { h: isNaN(parts[0]) ? 99 : parts[0], a: isNaN(parts[1]) ? 99 : parts[1] };
}
