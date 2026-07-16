import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export type BracketMatch = {
  id: string;
  round: number;
  round_name: string;
  slot: number;
  participant_a_id: string | null;
  participant_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  winner_id: string | null;
  status: string | null;
};

export type TeamInfo = { id: string; name: string | null; logo_url: string | null };

const STAGES: { name: string; label: string; round: number }[] = [
  { name: "R16", label: "Round of 16", round: 1 },
  { name: "QF", label: "Quarterfinals", round: 2 },
  { name: "SF", label: "Semifinals", round: 3 },
  { name: "F", label: "Final", round: 4 },
];

export function BracketBoard({ tournamentId, currentStage }: { tournamentId: string; currentStage: string | null }) {
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [teams, setTeams] = useState<Record<string, TeamInfo>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: m } = await (supabase as any)
        .from("tournament_matches")
        .select("id,round,round_name,slot,participant_a_id,participant_b_id,score_a,score_b,winner_id,status")
        .eq("tournament_id", tournamentId)
        .order("round").order("slot");
      if (cancelled) return;
      const ms = (m ?? []) as BracketMatch[];
      setMatches(ms);
      const ids = Array.from(new Set(ms.flatMap((r) => [r.participant_a_id, r.participant_b_id]).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: ts } = await (supabase as any).from("teams").select("id,name,logo_url").in("id", ids);
        if (!cancelled) setTeams(Object.fromEntries((ts ?? []).map((t: TeamInfo) => [t.id, t])));
      }
    };
    load();
    const ch = (supabase as any)
      .channel(`bracket:${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${tournamentId}` }, load)
      .subscribe();
    return () => { cancelled = true; (supabase as any).removeChannel(ch); };
  }, [tournamentId]);

  // Slots per round: R16=8, QF=4, SF=2, F=1
  const slotCounts = [8, 4, 2, 1];
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div className="min-w-[720px]">
        {/* Column headers */}
        <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          {STAGES.map((s) => {
            const isCurrent = currentStage === s.name;
            return (
              <div
                key={s.name}
                className={`text-[10px] uppercase tracking-[0.3em] font-black text-center py-1.5 rounded-md ${isCurrent ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              >
                {s.label}
              </div>
            );
          })}
        </div>
        {/* Tree grid — each round's matches stack vertically and draw L-shaped connectors that meet siblings at the midpoint into the next round. */}
        <div className="grid gap-0" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          {STAGES.map((s, colIdx) => {
            const rows = matches.filter((m) => m.round_name === s.name).sort((a, b) => a.slot - b.slot);
            const count = slotCounts[colIdx];
            const isLast = colIdx === STAGES.length - 1;
            const isFirst = colIdx === 0;
            return (
              <div key={s.name} className="flex flex-col justify-around relative px-3">
                {Array.from({ length: count }).map((_, idx) => {
                  const m = rows[idx];
                  const isFinal = s.name === "F";
                  const isTopOfPair = idx % 2 === 0;
                  return (
                    <div
                      key={m?.id ?? `${s.name}-${idx}`}
                      className="relative flex-1 flex items-center"
                    >
                      {/* incoming stub from previous round */}
                      {!isFirst && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -left-3 top-1/2 h-px w-3 bg-primary/40"
                        />
                      )}
                      <div className="w-full">
                        {m ? (
                          <BracketCard m={m} teams={teams} isFinal={isFinal} />
                        ) : (
                          <div className="rounded-md border border-dashed border-border/40 h-14 grid place-items-center text-[10px] text-muted-foreground bg-card/20">
                            TBD
                          </div>
                        )}
                      </div>
                      {/* outgoing connector to next round */}
                      {!isLast && (
                        <>
                          {/* horizontal stub from card center to the vertical joiner */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute -right-3 top-1/2 h-px w-3 bg-primary/40"
                          />
                          {/* vertical joiner: top-of-pair goes DOWN from center to bottom, bottom-of-pair goes UP from top to center */}
                          <span
                            aria-hidden
                            className={`pointer-events-none absolute -right-3 w-px bg-primary/40 ${
                              isTopOfPair ? "top-1/2 bottom-0" : "top-0 bottom-1/2"
                            }`}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BracketCard({ m, teams, isFinal }: { m: BracketMatch; teams: Record<string, TeamInfo>; isFinal: boolean }) {
  const a = m.participant_a_id ? teams[m.participant_a_id] : null;
  const b = m.participant_b_id ? teams[m.participant_b_id] : null;
  const done = m.status === "completed";
  return (
    <div className={`rounded-md border p-2 text-xs bg-card/40 backdrop-blur-sm ${done ? "border-primary/30" : "border-border/60"}`}>
      <Row team={a} score={m.score_a} isWinner={done && m.winner_id === m.participant_a_id} isFinal={isFinal} />
      <div className="h-px bg-border/50 my-1" />
      <Row team={b} score={m.score_b} isWinner={done && m.winner_id === m.participant_b_id} isFinal={isFinal} />
    </div>
  );
}

function Row({ team, score, isWinner, isFinal }: { team: TeamInfo | null; score: number | null; isWinner: boolean; isFinal: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${isWinner ? "text-primary font-black" : ""}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {isWinner && isFinal ? <Trophy className="h-3 w-3 shrink-0 text-amber-400" /> : null}
        <span className="truncate">{team?.name ?? "—"}</span>
      </div>
      <span className="tabular-nums opacity-80">{score ?? "-"}</span>
    </div>
  );
}