import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { Countdown } from "./Countdown";
import type { Match } from "@/lib/mock-data";
import { Crosshair, Lock, MapPin } from "lucide-react";

interface Props {
  match: Match;
  selectedOddIds?: Set<string>;
  onPick?: (matchId: string, oddId: string) => void;
}

export function MatchCard({ match, selectedOddIds, onPick }: Props) {
  const locked = match.status === "live" || match.status === "ended";
  return (
    <Card className="glass p-4 hover:border-[var(--gold)]/60 transition-all group relative overflow-hidden">
      {match.status === "live" && (
        <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold tracking-widest text-destructive-foreground bg-destructive rounded-bl-md">
          ● LIVE
        </div>
      )}
      <Link to="/matches/$matchId" params={{ matchId: match.id }} className="block">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{match.name}</span>
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{match.location}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-3">
          <Team name={match.home.name} color={match.home.color} score={match.homeScore} status={match.status} align="left" />
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">VS</div>
            <Crosshair className="h-5 w-5 text-gold mx-auto" />
          </div>
          <Team name={match.away.name} color={match.away.color} score={match.awayScore} status={match.status} align="right" />
        </div>
        <div className="mt-3 text-xs text-muted-foreground text-center">
          {match.status === "scheduled" && <>Starts in <Countdown target={match.startTime} /></>}
          {match.status === "live" && <span className="text-destructive font-bold">Round in progress</span>}
          {match.status === "ended" && <span>Final · {new Date(match.startTime).toLocaleDateString()}</span>}
        </div>
      </Link>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {match.odds.map((o) => {
          const selected = selectedOddIds?.has(o.id);
          return (
            <button
              key={o.id}
              disabled={locked}
              onClick={() => onPick?.(match.id, o.id)}
              className={`px-2 py-2 rounded-md text-xs font-bold transition-all border ${
                locked ? "bg-secondary/30 text-muted-foreground cursor-not-allowed border-transparent"
                : selected ? "bg-gradient-gold text-[var(--primary-foreground)] border-transparent shadow-gold"
                : "bg-secondary/40 text-foreground border-[var(--glass-border)] hover:border-[var(--gold)]/70 hover:bg-secondary/70"
              }`}
            >
              <div className="text-[9px] uppercase tracking-wider opacity-80">{o.label}</div>
              <div className="text-sm flex items-center justify-center gap-1">
                {locked && <Lock className="h-3 w-3" />}{o.value.toFixed(2)}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] border-[var(--glass-border)]">{match.market}</Badge>
        <span className="text-[10px] text-muted-foreground">{match.odds.length} markets</span>
      </div>
    </Card>
  );
}

function Team({ name, color, score, status, align }: { name: string; color: string; score: number; status: Match["status"]; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <div className="h-9 w-9 rounded-full ring-2 ring-[var(--glass-border)]" style={{ background: color }} />
      <div className="min-w-0">
        <div className="font-bold text-sm truncate">{name}</div>
        {status !== "scheduled" && <div className="text-lg font-bold gradient-gold-text">{score}</div>}
      </div>
    </div>
  );
}
