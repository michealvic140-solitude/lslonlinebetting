import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { Countdown } from "./Countdown";
import { Crosshair, Lock, MapPin, Target } from "lucide-react";
import type { MatchRow } from "@/lib/queries";
import { TeamLogo } from "@/components/TeamLogo";
import { useBetSlip } from "@/contexts/BetSlipContext";

export function MatchCardLive({ match }: { match: MatchRow }) {
  const { selections, add, remove } = useBetSlip();
  // Prefer the Match Winner / 1X2 market for inline odds, but surface the Correct Score market as its own CTA.
  const csMarket = match.markets?.find((m) => /correct\s*score/i.test(m.name));
  const mainMarket = match.markets?.find((m) => !/correct\s*score/i.test(m.name)) ?? match.markets?.[0];
  const market = mainMarket;
  const locked = match.status !== "scheduled" || !market?.is_open;
  const selectedOdd = selections.find((s) => s.match_id === match.id)?.odd_id;
  const homeName = match.home_team?.name ?? "Home";
  const awayName = match.away_team?.name ?? "Away";

  return (
    <Card className="glass p-4 hover:border-primary/60 transition-all relative overflow-hidden">
      {match.status === "live" && (
        <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold tracking-widest text-destructive-foreground bg-destructive rounded-bl-md">
          ● LIVE
        </div>
      )}
      <Link to="/matches/$matchId" params={{ matchId: match.id }} className="block">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground gap-2">
          <span className="truncate">{match.name}</span>
          {match.location && <span className="flex items-center gap-1 shrink-0"><MapPin className="h-3 w-3" />{match.location}</span>}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-3">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo name={homeName} url={match.home_team?.logo_url} size={36} rounded="full" />
            <div className="min-w-0"><div className="font-bold truncate text-sm">{homeName}</div><div className="text-[10px] text-muted-foreground">{match.status === "scheduled" ? "—" : match.home_score}</div></div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">VS</div>
            <Crosshair className="h-5 w-5 text-primary mx-auto" />
          </div>
          <div className="flex items-center gap-2 flex-row-reverse text-right min-w-0">
            <TeamLogo name={awayName} url={match.away_team?.logo_url} size={36} rounded="full" />
            <div className="min-w-0"><div className="font-bold truncate text-sm">{awayName}</div><div className="text-[10px] text-muted-foreground">{match.status === "scheduled" ? "—" : match.away_score}</div></div>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground text-center">
          {match.status === "scheduled" && <>Starts in <Countdown target={match.start_time} /></>}
          {match.status === "live" && <span className="text-destructive font-bold">Round in progress</span>}
          {match.status === "ended" && <span>Final · {new Date(match.start_time).toLocaleDateString()}</span>}
        </div>
      </Link>

      {market && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {market.odds.slice(0, 3).map((o) => {
            const selected = selectedOdd === o.id;
            return (
              <button
                key={o.id}
                disabled={locked}
                onClick={() => {
                  if (selected) remove(o.id);
                  else add({
                    match_id: match.id, match_name: `${homeName} vs ${awayName}`,
                    market_id: market.id, market_name: market.name,
                    odd_id: o.id, selection_label: o.label, odds: Number(o.value),
                  });
                }}
                className={`px-2 py-2 rounded-md text-xs font-bold transition-all border ${
                  locked ? "bg-secondary/30 text-muted-foreground cursor-not-allowed border-transparent"
                  : selected ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-secondary/40 border-border hover:border-primary/60"
                }`}
              >
                <div className="text-[9px] uppercase tracking-wider opacity-80 truncate">{o.label}</div>
                <div className="text-sm flex items-center justify-center gap-1">
                  {locked && <Lock className="h-3 w-3" />}{Number(o.value).toFixed(2)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {csMarket && csMarket.odds.length > 0 && (
        <Link
          to="/matches/$matchId"
          params={{ matchId: match.id }}
          hash="correct-score"
          className="mt-2 flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5" />
            Correct Score · {csMarket.odds.length} options
          </span>
          <span className="text-[10px] uppercase tracking-widest opacity-80">Tap to pick →</span>
        </Link>
      )}

      <div className="mt-2 flex items-center justify-between">
        <Badge variant="outline" className="text-[10px]">{market?.name ?? "TBA"}</Badge>
        {match.is_featured && <Badge className="text-[10px] bg-primary/20 text-primary border-primary/40" variant="outline">Featured</Badge>}
      </div>
    </Card>
  );
}

