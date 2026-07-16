import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Circle, Trophy, ArrowRight, Crosshair } from "lucide-react";

type LiveEvent = { at: number; minute: number; type: string; side?: "a" | "b"; text: string };
type Row = {
  id: string; round_name: string; slot: number;
  participant_a_id: string | null; participant_b_id: string | null;
  score_a: number | null; score_b: number | null;
  winner_id: string | null; status: string | null; updated_at: string | null;
  live_events: LiveEvent[] | null;
};
type Team = { id: string; name: string; logo_url: string | null };

const STAGE_LABEL: Record<string, string> = { R16: "Round of 16", QF: "Quarterfinal", SF: "Semifinal", F: "Final" };

/** Mini shootout arena — muzzle flash, tracer round, and reticle. Used for the
 *  generic (gang) championship so the live-feed vibe matches the shootout theme. */
function ShootoutMini({ scoreA, scoreB, nameA, nameB, seed }: { scoreA: number; scoreB: number; nameA: string; nameB: string; seed: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => (t + 1) % 240), 90);
    return () => clearInterval(iv);
  }, []);
  const h = Array.from(seed).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  // Fire cycle: 0-6 charge, 7 flash, 8-14 tracer travel, 15-19 cooldown
  const cycle = (tick + (h % 20)) % 20;
  const flash = cycle === 7;
  const tracing = cycle >= 8 && cycle <= 14;
  const tracerX = 60 + ((cycle - 8) / 6) * 180; // 60 → 240
  const dir = (h & 1) === 0 ? 1 : -1; // A shoots at B (right) or B at A (left)
  const fromX = dir === 1 ? 60 : 240;
  const toX = dir === 1 ? tracerX : 300 - tracerX;
  return (
    <div className="relative w-full rounded-md overflow-hidden border border-red-500/40" style={{ aspectRatio: "3 / 1" }}>
      <svg viewBox="0 0 300 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`arena-${seed}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1a0a0a" />
            <stop offset="1" stopColor="#0a0a0a" />
          </linearGradient>
          <radialGradient id={`spot-${seed}`} cx="0.5" cy="0" r="0.9">
            <stop offset="0" stopColor="rgba(239,68,68,0.25)" />
            <stop offset="1" stopColor="transparent" />
          </radialGradient>
        </defs>
        <rect width="300" height="100" fill={`url(#arena-${seed})`} />
        <rect width="300" height="100" fill={`url(#spot-${seed})`} />
        {/* concrete floor grid */}
        {[15, 35, 55, 75, 95].map((y) => (
          <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(239,68,68,0.06)" strokeWidth="0.5" />
        ))}
        {/* center reticle */}
        <g opacity="0.65">
          <circle cx="150" cy="50" r="14" fill="none" stroke="rgba(239,68,68,0.55)" strokeWidth="1" />
          <line x1="130" y1="50" x2="170" y2="50" stroke="rgba(239,68,68,0.55)" strokeWidth="0.6" />
          <line x1="150" y1="30" x2="150" y2="70" stroke="rgba(239,68,68,0.55)" strokeWidth="0.6" />
        </g>
        {/* Shooter A (left) */}
        <g>
          <circle cx="30" cy="50" r="8" fill="#7f1d1d" stroke="#ef4444" strokeWidth="1" />
          <rect x="38" y="47" width="16" height="4" fill="#f87171" rx="1" />
          {flash && dir === 1 && (
            <circle cx="60" cy="49" r="6" fill="#fde68a" opacity="0.95" />
          )}
        </g>
        {/* Shooter B (right) */}
        <g>
          <circle cx="270" cy="50" r="8" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="1" />
          <rect x="246" y="47" width="16" height="4" fill="#7dd3fc" rx="1" />
          {flash && dir === -1 && (
            <circle cx="240" cy="49" r="6" fill="#fde68a" opacity="0.95" />
          )}
        </g>
        {/* Tracer bullet */}
        {tracing && (
          <>
            <line x1={fromX} y1="49" x2={toX} y2="49" stroke="#fef08a" strokeWidth="2" opacity="0.85" />
            <circle cx={toX} cy="49" r="2" fill="#fef3c7" />
          </>
        )}
        {/* Sparks on impact */}
        {cycle === 14 && (
          <g>
            {[0, 1, 2, 3].map((i) => (
              <circle key={i} cx={dir === 1 ? 258 : 42} cy={40 + i * 5} r="1.4" fill="#fbbf24" opacity="0.8" />
            ))}
          </g>
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-black">
        <span className="truncate max-w-[35%] text-red-200 drop-shadow">{nameA}</span>
        <span className="text-amber-300 tabular-nums text-sm drop-shadow">{scoreA} – {scoreB}</span>
        <span className="truncate max-w-[35%] text-sky-200 text-right drop-shadow">{nameB}</span>
      </div>
      <div className="absolute top-1 left-1 text-[8px] uppercase tracking-widest bg-red-500/30 text-red-100 px-1 rounded flex items-center gap-0.5">
        <Crosshair className="h-2.5 w-2.5" /> LIVE
      </div>
    </div>
  );
}

/** Mini football pitch SVG with a bouncing ball; purely decorative live-arena feel. */
function PitchMini({ scoreA, scoreB, nameA, nameB, seed, football }: { scoreA: number; scoreB: number; nameA: string; nameB: string; seed: string; football: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => (t + 1) % 6000), 80);
    return () => clearInterval(iv);
  }, []);
  // deterministic seeded per-match noise
  const h = Array.from(seed).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  // 4-3-3-ish formations, 11 per side (GK + 4 DEF + 3 MID + 3 FWD).
  const formA: Array<[number, number]> = [
    [8, 50],
    [30, 20], [30, 40], [30, 60], [30, 80],
    [70, 28], [70, 50], [70, 72],
    [115, 30], [120, 50], [115, 70],
  ];
  const formB: Array<[number, number]> = [
    [292, 50],
    [270, 20], [270, 40], [270, 60], [270, 80],
    [230, 28], [230, 50], [230, 72],
    [185, 30], [180, 50], [185, 70],
  ];
  const jitter = (i: number, axis: number) =>
    Math.sin((tick + h * 0.017 + i * 1.7 + axis * 3.1) * 0.09) * 6 +
    Math.cos((tick + h * 0.023 + i * 2.3 + axis * 1.9) * 0.13) * 4;
  const posA = formA.map(([x, y], i) => [x + jitter(i, 0), y + jitter(i, 1)] as const);
  const posB = formB.map(([x, y], i) => [x + jitter(i + 20, 0), y + jitter(i + 20, 1)] as const);
  // Ball is carried by rotating players; switch carrier every ~11 ticks.
  const phase = Math.floor(tick / 11);
  const attackA = phase % 2 === 0;
  const carrierIdx = (h + phase * 7) % 11;
  const nextIdx = (h + (phase + 1) * 7) % 11;
  const from = attackA ? posA[carrierIdx] : posB[carrierIdx];
  const to = attackA ? posA[nextIdx] : posB[nextIdx];
  // Shots roughly every 6 phases: ball rockets to the opposing goal mouth.
  const isShot = phase % 6 === 5;
  const shotTarget: readonly [number, number] = attackA ? [296, 50] : [4, 50];
  const dest = isShot ? shotTarget : to;
  const lerp = ((tick % 11) / 11);
  const bx = from[0] + (dest[0] - from[0]) * lerp;
  const by = from[1] + (dest[1] - from[1]) * lerp - Math.sin(lerp * Math.PI) * (isShot ? 8 : 4);
  return (
    <div className="relative w-full rounded-md overflow-hidden border border-emerald-500/30" style={{ aspectRatio: "3 / 1" }}>
      <svg viewBox="0 0 300 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        {/* pitch */}
        <defs>
          <linearGradient id="pitch" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#052e16" />
            <stop offset="1" stopColor="#022c22" />
          </linearGradient>
          <pattern id="stripes" width="20" height="100" patternUnits="userSpaceOnUse">
            <rect width="10" height="100" fill="rgba(16,185,129,0.08)" />
          </pattern>
        </defs>
        <rect width="300" height="100" fill="url(#pitch)" />
        <rect width="300" height="100" fill="url(#stripes)" />
        {/* center line + circle */}
        <line x1="150" y1="0" x2="150" y2="100" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        <circle cx="150" cy="50" r="14" fill="none" stroke="rgba(255,255,255,0.35)" />
        {/* goals */}
        <rect x="0" y="35" width="8" height="30" fill="none" stroke="rgba(255,255,255,0.45)" />
        <rect x="292" y="35" width="8" height="30" fill="none" stroke="rgba(255,255,255,0.45)" />
        {/* penalty boxes */}
        <rect x="0" y="20" width="40" height="60" fill="none" stroke="rgba(255,255,255,0.25)" />
        <rect x="260" y="20" width="40" height="60" fill="none" stroke="rgba(255,255,255,0.25)" />
        {/* players — 11 v 11 */}
        {posA.map(([x, y], i) => (
          <circle key={`a${i}`} cx={x} cy={y} r={i === 0 ? 2.8 : 2.4} fill={i === 0 ? "#fbbf24" : "#ef4444"} stroke="rgba(0,0,0,0.5)" strokeWidth="0.4" />
        ))}
        {posB.map(([x, y], i) => (
          <circle key={`b${i}`} cx={x} cy={y} r={i === 0 ? 2.8 : 2.4} fill={i === 0 ? "#fbbf24" : "#38bdf8"} stroke="rgba(0,0,0,0.5)" strokeWidth="0.4" />
        ))}
        {/* ball */}
        <circle cx={bx} cy={by} r="2.6" fill="#fef3c7" stroke="#0f172a" strokeWidth="0.6" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-black">
        <span className="truncate max-w-[35%] text-red-200 drop-shadow">{nameA}</span>
        <span className="text-amber-300 tabular-nums text-sm drop-shadow">{scoreA} – {scoreB}</span>
        <span className="truncate max-w-[35%] text-sky-200 text-right drop-shadow">{nameB}</span>
      </div>
      {football && (
        <div className="absolute top-1 left-1 text-[8px] uppercase tracking-widest bg-emerald-500/30 text-emerald-100 px-1 rounded">⚽ LIVE</div>
      )}
    </div>
  );
}

/** Live commentary + score feed for a championship bracket. Streams live-stage
 * events per match, shows just-settled scores, and previews next-round line-up
 * during the between-stage gap. Football vs generic just flavours the copy. */
export function ChampionshipLiveFeed({ tournamentId, sport, currentStage }: { tournamentId: string; sport: "football" | "generic"; currentStage?: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase as any)
        .from("tournament_matches")
        .select("id,round_name,slot,participant_a_id,participant_b_id,score_a,score_b,winner_id,status,updated_at,live_events")
        .eq("tournament_id", tournamentId)
        .order("round", { ascending: false })
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      const rs = (data ?? []) as Row[];
      setRows(rs);
      const ids = Array.from(new Set(rs.flatMap((r) => [r.participant_a_id, r.participant_b_id]).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: ts } = await (supabase as any).from("teams").select("id,name,logo_url").in("id", ids);
        if (!cancelled) setTeams(Object.fromEntries((ts ?? []).map((t: Team) => [t.id, t])));
      }
    };
    load();
    const ch = (supabase as any)
      .channel(`champ-feed:${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${tournamentId}` }, load)
      .subscribe();
    const iv = setInterval(load, 2500);
    return () => { cancelled = true; clearInterval(iv); try { (supabase as any).removeChannel(ch); } catch { /* noop */ } };
  }, [tournamentId]);

  const nameOf = (id: string | null) => (id ? teams[id]?.name ?? "?" : "?");
  const live = rows.filter((r) => r.status === "live");
  const pendingNext = currentStage ? rows.filter((r) => r.status === "pending" && r.round_name === currentStage) : [];
  const completed = rows.filter((r) => r.status === "completed").slice(0, 16);

  if (live.length === 0 && completed.length === 0 && pendingNext.length === 0) {
    return (
      <div className="rounded-lg border border-primary/20 bg-background/40 p-4 text-center text-xs text-muted-foreground">
        <Radio className="h-4 w-4 mx-auto mb-1 opacity-40" />
        Live feed will appear here as soon as the first stage kicks off.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(live.length > 0 || pendingNext.length > 0) && (
        <div className="rounded-lg border border-primary/20 bg-background/40 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-primary font-black">
            <Radio className="h-3 w-3 animate-pulse text-destructive" />
            Live feed{sport === "football" ? " · Football" : ""}
          </div>
      {live.length > 0 && (
        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-destructive font-black flex items-center gap-1">
            <Circle className="h-2 w-2 fill-destructive text-destructive animate-pulse" /> Live now — {STAGE_LABEL[live[0].round_name] ?? live[0].round_name}
          </div>
          <div className="grid gap-2">
            {live.slice(0, 1).map((r) => {
              const ev = (r.live_events ?? []).slice(-3).reverse();
              const nameA = nameOf(r.participant_a_id);
              const nameB = nameOf(r.participant_b_id);
              return (
                <div key={r.id} className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  {sport === "football" ? (
                    <PitchMini
                      scoreA={r.score_a ?? 0}
                      scoreB={r.score_b ?? 0}
                      nameA={nameA}
                      nameB={nameB}
                      seed={r.id}
                      football
                    />
                  ) : (
                    <ShootoutMini
                      scoreA={r.score_a ?? 0}
                      scoreB={r.score_b ?? 0}
                      nameA={nameA}
                      nameB={nameB}
                      seed={r.id}
                    />
                  )}
                  {ev.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-muted-foreground">
                      {ev.map((e, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="tabular-nums text-primary/70 shrink-0">{e.minute}'</span>
                          <span className={e.type === "goal" ? "text-emerald-300 font-bold" : ""}>{e.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {live.length > 1 && (
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">
                +{live.length - 1} other match{live.length - 1 > 1 ? "es" : ""} playing simultaneously · see bracket below
              </div>
            )}
          </div>
        </section>
      )}

      {live.length === 0 && pendingNext.length > 0 && (
        <section className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-amber-300 font-black flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Next up — {STAGE_LABEL[pendingNext[0].round_name] ?? pendingNext[0].round_name} line-up
          </div>
          <div className="grid gap-1 text-xs">
            {pendingNext.map((r) => (
              <div key={r.id} className="flex items-center gap-2 border-b border-border/40 pb-1 last:border-0">
                <span className="font-bold truncate flex-1">{nameOf(r.participant_a_id)}</span>
                <span className="text-[10px] text-muted-foreground">vs</span>
                <span className="font-bold truncate flex-1 text-right">{nameOf(r.participant_b_id)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
        </div>
      )}

      {completed.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-background/40 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80 mb-2 flex items-center gap-1">
            <Trophy className="h-3 w-3" /> Previous scores
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {completed.map((r) => {
              const a = nameOf(r.participant_a_id), b = nameOf(r.participant_b_id);
              const sa = r.score_a ?? 0, sb = r.score_b ?? 0;
              const stage = STAGE_LABEL[r.round_name] ?? r.round_name;
              return (
                <div key={r.id} className="flex items-center justify-between text-[11px] gap-2">
                  <div className="min-w-0 leading-tight flex-1">
                    <div className="truncate">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground mr-1">{stage}</span>
                      {a}
                    </div>
                    <div className="truncate text-muted-foreground">{b}</div>
                  </div>
                  <div className="font-mono font-black text-primary tabular-nums shrink-0">
                    {sa}:{sb}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
