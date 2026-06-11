import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Trophy, Crown } from "lucide-react";

export const Route = createFileRoute("/tournaments/$id")({
  component: TournamentPage,
  head: () => ({ meta: [{ title: "Knockout Bracket — Lomita Shooters League" }, { name: "description", content: "Live tournament bracket — track every round, every shooter, every champion." }] }),
});

type Tournament = { id: string; name: string; subtitle: string | null; opening_round_size: number; total_rounds: number; background_image_url: string | null; champion_participant_id: string | null; tournament_date: string | null };
type Participant = { id: string; name: string; avatar_url: string | null; is_champion: boolean; eliminated_round: number | null };
type BMatch = { id: string; round: number; slot: number; match_code: string | null; participant1_id: string | null; participant2_id: string | null; score1: number | null; score2: number | null; winner_participant_id: string | null };

function TournamentPage() {
  const { id } = Route.useParams();
  const [t, setT] = useState<Tournament | null>(null);
  const [parts, setParts] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<BMatch[]>([]);

  async function load() {
    const [{ data: tt }, { data: pp }, { data: mm }] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
      supabase.from("tournament_participants").select("*").eq("tournament_id", id).order("seed"),
      supabase.from("tournament_matches").select("*").eq("tournament_id", id).order("round").order("slot"),
    ]);
    setT(tt as any); setParts((pp ?? []) as any); setMatches((mm ?? []) as any);
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const ch = supabase.channel(`bracket-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter: `tournament_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  if (!t) return <Layout><div className="p-8 text-center text-muted-foreground">Loading bracket…</div></Layout>;

  return (
    <Layout>
      <BracketView tournament={t} participants={parts} matches={matches} />
    </Layout>
  );
}

export function BracketView({ tournament: t, participants: parts, matches }: { tournament: Tournament; participants: Participant[]; matches: BMatch[] }) {
  const champion = parts.find((p) => p.id === t.champion_participant_id);
  const roundsArr = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
  const roundLabel = (r: number) => {
    if (r === 1) return { top: "OPENING ROUND", sub: `ROUND OF ${t.opening_round_size}` };
    const size = matches.filter((m) => m.round === r).length * 2;
    if (size === 16) return { top: "ROUND OF 16", sub: "16 PLAYERS" };
    if (size === 8) return { top: "QUARTERFINALS", sub: "8 PLAYERS" };
    if (size === 4) return { top: "SEMIFINALS", sub: "4 PLAYERS" };
    if (size === 2) return { top: "GRAND FINAL", sub: "2 PLAYERS" };
    return { top: `ROUND OF ${size}`, sub: `${size} PLAYERS` };
  };
  const findP = (id: string | null) => (id ? parts.find((p) => p.id === id) : null);

  return (
    <div
      className="relative w-full min-h-[calc(100vh-4rem)] overflow-hidden"
      style={t.background_image_url ? { backgroundImage: `linear-gradient(rgba(8,6,2,0.86), rgba(8,6,2,0.94)), url(${t.background_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "radial-gradient(circle at 20% 10%, oklch(0.18 0.04 60) 0%, oklch(0.06 0.01 50) 50%, #0a0805 100%)" }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.6) 100%)" }} />
      <div className="relative z-10 mx-auto max-w-[1600px] p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-700 grid place-items-center shadow-gold border border-yellow-400/60">
              <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-black" />
            </div>
            <div className="min-w-0">
              <div className="text-[8px] sm:text-[10px] uppercase tracking-[0.3em] text-yellow-200/80 truncate">{t.subtitle ?? "ONE LEAGUE"}</div>
              <div className="text-base sm:text-2xl font-black uppercase truncate" style={{ background: "linear-gradient(180deg,#fff7d6 0%,#e6c46c 60%,#a87b1e 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "0.02em" }}>{t.name}</div>
            </div>
          </div>
          {t.tournament_date && <div className="hidden sm:block rounded border border-yellow-500/40 px-2 py-1 text-[10px] text-yellow-200/90 font-bold">{new Date(t.tournament_date).toLocaleDateString()}</div>}
        </div>
        <div className="text-center text-[9px] sm:text-xs uppercase tracking-[0.32em] font-bold mb-3" style={{ color: "#d9b04a" }}>KNOCKOUT BRACKET</div>

        {/* Bracket */}
        <div className="overflow-x-auto pb-3">
          <div className="grid gap-2 sm:gap-3 min-w-[860px]" style={{ gridTemplateColumns: `repeat(${roundsArr.length + 1}, minmax(0, 1fr))` }}>
            {roundsArr.map((r) => {
              const lbl = roundLabel(r);
              const ms = matches.filter((m) => m.round === r);
              return (
                <div key={r} className="flex flex-col">
                  <div className="text-center mb-2">
                    <div className="text-[9px] sm:text-[11px] font-black tracking-[0.18em]" style={{ color: "#e6c46c" }}>{lbl.top}</div>
                    <div className="text-[8px] sm:text-[9px] text-yellow-200/60 font-bold tracking-wider">{lbl.sub}</div>
                  </div>
                  <div className="flex-1 flex flex-col justify-around gap-1.5">
                    {ms.map((m) => {
                      const p1 = findP(m.participant1_id);
                      const p2 = findP(m.participant2_id);
                      const w = m.winner_participant_id;
                      return (
                        <div key={m.id} className="relative">
                          <div className="absolute -left-3 sm:-left-4 top-1/2 text-[7px] sm:text-[9px] font-bold text-yellow-200/60 -translate-y-1/2">{m.match_code}</div>
                          <div className="rounded border border-yellow-500/40 bg-black/70 backdrop-blur-sm shadow-[0_0_10px_rgba(230,196,108,0.15)] overflow-hidden">
                            <div className={`flex items-center justify-between px-2 py-1 text-[8px] sm:text-[10px] font-bold border-b border-yellow-500/20 ${w && w === p1?.id ? "bg-yellow-500/15 text-yellow-200" : "text-white/80"}`}>
                              <span className="truncate">{p1?.name ?? "—"}</span>
                              {m.score1 != null && <span className="ml-1 text-yellow-300 tabular-nums">{m.score1}</span>}
                            </div>
                            <div className="text-center text-[7px] sm:text-[8px] text-yellow-400/70 font-bold py-0.5">VS</div>
                            <div className={`flex items-center justify-between px-2 py-1 text-[8px] sm:text-[10px] font-bold border-t border-yellow-500/20 ${w && w === p2?.id ? "bg-yellow-500/15 text-yellow-200" : "text-white/80"}`}>
                              <span className="truncate">{p2?.name ?? "—"}</span>
                              {m.score2 != null && <span className="ml-1 text-yellow-300 tabular-nums">{m.score2}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-center mt-2 text-[8px] sm:text-[10px] font-bold text-green-400/80 tracking-wider">{ms.length} WINNERS ADVANCE</div>
                </div>
              );
            })}
            {/* Trophy column */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-[10px] sm:text-[13px] font-black tracking-[0.2em] mb-2" style={{ color: "#e6c46c" }}>FINAL</div>
              <div className="relative grid place-items-center">
                <div className="text-6xl sm:text-8xl" style={{ filter: "drop-shadow(0 0 16px rgba(230,196,108,0.7))" }}>🏆</div>
              </div>
              <div className="mt-2 text-center">
                <div className="text-[10px] sm:text-sm font-black tracking-[0.18em]" style={{ color: "#e6c46c" }}>CHAMPION</div>
                {champion && <div className="text-[9px] sm:text-xs text-yellow-200/90 font-bold mt-0.5 truncate max-w-[120px]">{champion.name}</div>}
                <div className="text-yellow-400 mt-1 text-xs">★ ★ ★</div>
              </div>
            </div>
          </div>
        </div>

        {/* Format strip */}
        <div className="mt-4 rounded border border-yellow-500/40 bg-black/60 backdrop-blur p-3">
          <div className="text-center text-[10px] sm:text-xs font-black tracking-[0.32em] mb-2" style={{ color: "#e6c46c" }}>TOURNAMENT FORMAT</div>
          <div className="flex items-center justify-around text-[8px] sm:text-[10px] text-yellow-100/80 font-bold gap-1 overflow-x-auto">
            {roundsArr.map((r) => {
              const lbl = roundLabel(r);
              const size = matches.filter((m) => m.round === r).length * 2;
              return (
                <div key={r} className="flex items-center gap-1 shrink-0">
                  <div className="text-center">
                    <div>{lbl.top}</div>
                    <div className="text-yellow-200/60">{size} PLAYERS</div>
                  </div>
                  <span className="text-yellow-500/60">→</span>
                </div>
              );
            })}
            <Crown className="h-4 w-4 text-yellow-400" />
            <span>CHAMPION</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[8px] sm:text-[10px] text-yellow-100/70 font-bold uppercase tracking-wider text-center">
            <div className="flex items-center justify-center gap-1"><Trophy className="h-3 w-3 text-yellow-400" />One League. No Mercy.</div>
            <div className="flex items-center justify-center gap-1"><Crown className="h-3 w-3 text-yellow-400" />Respect the Game.</div>
            <div className="flex items-center justify-center gap-1"><Trophy className="h-3 w-3 text-yellow-400" />Only One King.</div>
          </div>
        </div>
      </div>
    </div>
  );
}