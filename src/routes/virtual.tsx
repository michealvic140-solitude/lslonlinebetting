import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dice5, Lock, Flame, Trophy, Clock, History, Crosshair, Zap, CheckCircle2, PauseCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";
import type { MatchRow } from "@/lib/queries";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { toast } from "sonner";

export const Route = createFileRoute("/virtual")({
  head: () => ({
    meta: [
      { title: "Virtual Gangs — Instant Rounds | LSL" },
      { name: "description", content: "Quick gang vs gang instant rounds. Stake winners, scores, and first blood — auto-played every 2 minutes." },
    ],
  }),
  component: VirtualPage,
});

const matchSelect = `
  id,name,status,start_time,location,is_featured,home_score,away_score,is_virtual,lock_time,
  home_team:teams!home_team_id(id,name,logo_url,gang_type),
  away_team:teams!away_team_id(id,name,logo_url,gang_type),
  markets(id,name,is_open,odds(id,label,value,is_winner,market_id))
`;

function VirtualPage() {
  const [live, setLive] = useState<MatchRow[]>([]);
  const [upcoming, setUpcoming] = useState<MatchRow[]>([]);
  const [recent, setRecent] = useState<MatchRow[]>([]);
  const [cycle, setCycle] = useState<{ running: boolean; animSec: number; durSec: number }>({ running: false, animSec: 30, durSec: 120 });

  useEffect(() => {
    const load = async () => {
      await syncServerOffset();
      const [{ data: liveRows }, { data: upRows }, { data: recRows }, { data: cfg }] = await Promise.all([
        supabase.from("matches").select(matchSelect).eq("is_virtual", true).eq("status", "live").order("start_time", { ascending: false }).limit(20),
        supabase.from("matches").select(matchSelect).eq("is_virtual", true).eq("status", "scheduled").order("start_time", { ascending: true }).limit(40),
        supabase.from("matches").select(matchSelect).eq("is_virtual", true).eq("status", "ended").order("settled_at", { ascending: false }).limit(16),
        supabase.from("app_settings").select("virtual_cycle_running,virtual_animation_seconds,virtual_round_duration_seconds").eq("id", 1).maybeSingle(),
      ]);
      setLive((liveRows ?? []) as unknown as MatchRow[]);
      setUpcoming((upRows ?? []) as unknown as MatchRow[]);
      setRecent((recRows ?? []) as unknown as MatchRow[]);
      if (cfg) setCycle({
        running: !!(cfg as any).virtual_cycle_running,
        animSec: Number((cfg as any).virtual_animation_seconds ?? 30),
        durSec: Number((cfg as any).virtual_round_duration_seconds ?? 120),
      });
    };
    load();
    const t = setInterval(load, 1000);
    // Fast fallback ping so locking + ending isn't delayed by the 60s cron.
    const ping = setInterval(() => { supabase.rpc("virtual_tick").then(() => {}, () => {}); }, 3000);
    supabase.rpc("virtual_tick").then(() => {}, () => {});
    const ch = supabase.channel("virtual-rounds-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: "is_virtual=eq.true" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, load)
      .subscribe();
    return () => { clearInterval(t); clearInterval(ping); supabase.removeChannel(ch); };
  }, []);

  return (
    <Layout>
      <PageShell tone="default">
        <div className="container py-6 sm:py-10 space-y-8">
          <header className="text-center relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-[10px] uppercase tracking-[0.3em] text-primary mb-3">
              <Dice5 className="h-3.5 w-3.5" /> Instant Virtuals · Auto-Play
            </div>
            <h1 className="text-3xl sm:text-5xl font-black gradient-gold-text">Gang vs Gang</h1>
            <p className="text-muted-foreground mt-2 text-sm">Stake one or many markets. The bet slip handles multi-leg tickets. Wins require admin approval before claim.</p>
            <div className="mt-4 flex justify-center gap-2 flex-wrap">
              <Badge variant="outline" className={cycle.running ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" : "bg-muted text-muted-foreground"}>
                {cycle.running ? <><Zap className="h-3 w-3 mr-1" />Cycle running</> : <><PauseCircle className="h-3 w-3 mr-1" />Cycle paused</>}
              </Badge>
              <Link to="/virtual/history"><Button variant="outline" size="sm"><History className="h-3.5 w-3.5 mr-1" />Rounds & Claims</Button></Link>
            </div>
          </header>

          {live.length === 0 && upcoming.length === 0 ? (
            <Card className="glass p-8 text-center text-muted-foreground">
              <Dice5 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-semibold">{cycle.running ? "Spinning up the next round…" : "No virtual rounds active right now."}</p>
              <p className="text-xs mt-1">{cycle.running ? "New round appears within seconds." : "Admin will start the cycle shortly."}</p>
            </Card>
          ) : (
            <>
              {upcoming.length > 0 && (
                <section>
                  <SectionTitle icon={Clock} label={`Open · stake before lock (${cycle.durSec / 60} min window)`} color="text-primary" />
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {upcoming.map((m) => <VirtualRoundCard key={m.id} match={m} animSec={cycle.animSec} />)}
                  </div>
                </section>
              )}

              {live.length > 0 && (
                <section>
                  <SectionTitle icon={Flame} label="Playing out · watch live" color="text-destructive" />
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {live.map((m) => <VirtualRoundCard key={m.id} match={m} animSec={cycle.animSec} />)}
                  </div>
                </section>
              )}
            </>
          )}

          {recent.length > 0 && (
            <section>
              <SectionTitle icon={Trophy} label="Recent results" color="text-emerald-400" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {recent.map((m) => {
                  const outcome = m.home_score > m.away_score ? `${m.home_team?.name} WIN`
                    : m.away_score > m.home_score ? `${m.away_team?.name} WIN` : "DRAW";
                  return (
                    <Card key={m.id} className="glass p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{m.name}</div>
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <TeamLogo name={m.home_team?.name ?? ""} url={m.home_team?.logo_url ?? null} size={22} rounded="full" />
                          <span className="text-xs font-bold truncate">{m.home_team?.name}</span>
                        </div>
                        <span className="font-mono font-black text-base text-primary tabular-nums">{m.home_score} - {m.away_score}</span>
                        <div className="flex items-center gap-1.5 min-w-0 flex-row-reverse">
                          <TeamLogo name={m.away_team?.name ?? ""} url={m.away_team?.logo_url ?? null} size={22} rounded="full" />
                          <span className="text-xs font-bold truncate">{m.away_team?.name}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-center text-[10px] font-bold tracking-widest text-emerald-400">{outcome}</div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </PageShell>
    </Layout>
  );
}

function SectionTitle({ icon: Icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`h-4 w-4 ${color}`} />
      <h2 className="text-xs sm:text-sm font-black uppercase tracking-[0.2em]">{label}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
    </div>
  );
}

// Server-time offset so every client agrees with the DB clock (not their local time).
let __serverOffsetMs = 0;
async function syncServerOffset() {
  const t0 = Date.now();
  const { data, error } = await (supabase as any).rpc("server_now");
  const t1 = Date.now();
  if (error || !data) return;
  const serverMs = new Date(data as string).getTime();
  const rtt = (t1 - t0) / 2;
  __serverOffsetMs = serverMs - (t0 + rtt);
}
if (typeof window !== "undefined") {
  syncServerOffset();
  setInterval(syncServerOffset, 60000);
}
function serverNow() { return Date.now() + __serverOffsetMs; }

function useCountdown(target: string | null | undefined) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => { const t = setInterval(() => setNow(serverNow()), 500); return () => clearInterval(t); }, []);
  if (!target) return { secs: 0, mm: "0", ss: "00", done: true };
  const diff = Math.max(0, new Date(target).getTime() - now);
  const secs = Math.floor(diff / 1000);
  const mm = String(Math.floor(secs / 60));
  const ss = String(secs % 60).padStart(2, "0");
  return { secs, mm, ss, done: secs <= 0 };
}

function VirtualRoundCard({ match, animSec }: { match: MatchRow & { lock_time?: string | null }; animSec: number }) {
  const { add, setOpen, selections } = useBetSlip();
  const home = match.home_team?.name ?? "Home";
  const away = match.away_team?.name ?? "Away";
  const lockTime = (match as any).lock_time as string | null;
  const cd = useCountdown(lockTime);
  const settled = match.status === "ended";
  const playing = match.status === "live";
  const locked = settled || playing || cd.done;
  const isPicked = (oddId: string) => selections.some((s) => s.odd_id === oddId);
  const hasThisRound = selections.some((s) => s.match_id === match.id);

  // Virtual matches only support Win / Draw / Lose. Hide any legacy markets.
  const hideMk = (n: string) => /correct\s*score|total|first\s*blood/i.test(n);
  const markets = [...(match.markets ?? [])].filter((m) => !hideMk(m.name));

  function pick(mk: any, o: any) {
    if (locked) return;
    if (hasThisRound && !isPicked(o.id)) {
      toast.error("You can only select one market from the same virtual round.");
      return;
    }
    if (selections.length > 0 && selections.some((s) => !s.is_virtual)) {
      toast.error("Your slip has regular bets. Clear it before adding virtual selections.");
      return;
    }
    add({
      match_id: match.id, match_name: `${home} vs ${away}`,
      market_id: mk.id, market_name: mk.name,
      odd_id: o.id, selection_label: o.label, odds: Number(o.value),
      is_virtual: true,
    });
    setOpen(true);
  }

  return (
    <Card className="glass p-4 relative overflow-hidden border-primary/30">
      <StatusBadge settled={settled} playing={playing} locked={locked} />
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Instant Virtual</div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-2">
        <TeamSide name={home} url={match.home_team?.logo_url ?? null} side="Gang A" />
        <CenterDial match={match} playing={playing} settled={settled} animSec={animSec} />
        <TeamSide name={away} url={match.away_team?.logo_url ?? null} side="Gang B" reverse />
      </div>

      <div className="mt-3 text-center text-xs">
        {settled ? (
          <span className="text-emerald-400 font-bold flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" />Final {match.home_score}-{match.away_score}</span>
        ) : playing ? (
          <span className="text-destructive font-bold flex items-center justify-center gap-1 animate-pulse"><Crosshair className="h-3 w-3" />Match in progress…</span>
        ) : locked ? (
          <span className="text-destructive font-bold flex items-center justify-center gap-1"><Lock className="h-3 w-3" />Locking…</span>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="text-muted-foreground text-[10px] uppercase tracking-widest">Locks in</span>
            <span className="font-black text-2xl tabular-nums gradient-gold-text">{cd.mm}:{cd.ss}</span>
          </div>
        )}
      </div>

      {!settled && !playing && (
        <div className="mt-3 space-y-2">
          {markets.map((mk) => {
            const isCS = /correct\s*score/i.test(mk.name);
            const odds = isCS ? mk.odds.slice(0, 6) : mk.odds;
            return (
              <div key={mk.id} className="rounded-lg border border-border/50 bg-background/30 p-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{mk.name}</div>
                <div className={`grid gap-1.5 ${odds.length <= 3 ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
                  {odds.map((o) => {
                    const picked = isPicked(o.id);
                    return (
                      <button
                        key={o.id}
                        disabled={locked || !mk.is_open}
                        onClick={() => pick(mk, o)}
                        className={`px-1.5 py-1.5 rounded-md text-[11px] font-bold transition-all border ${
                          locked ? "bg-secondary/30 text-muted-foreground cursor-not-allowed border-transparent"
                          : picked ? "bg-primary/20 border-primary text-primary"
                          : "bg-secondary/40 border-border hover:border-primary/60 hover:bg-primary/10"
                        }`}
                      >
                        <div className="text-[9px] uppercase tracking-wider opacity-80 truncate">{o.label}</div>
                        <div className="text-[12px]">{Number(o.value).toFixed(2)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {markets.length === 0 && <Badge variant="outline" className="text-[10px]">No markets yet</Badge>}
        </div>
      )}

      {playing && <LiveMatchTicker match={match} animSec={animSec} />}
    </Card>
  );
}

function StatusBadge({ settled, playing, locked }: { settled: boolean; playing: boolean; locked: boolean }) {
  const tone = settled ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
    : playing ? "bg-destructive/15 border-destructive/40 text-destructive animate-pulse"
    : locked ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
    : "bg-primary/15 border-primary/40 text-primary";
  const label = settled ? "● SETTLED" : playing ? "● LIVE" : locked ? "● LOCKED" : "● OPEN";
  return <div className={`absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold tracking-widest rounded-bl-md border ${tone}`}>{label}</div>;
}

function TeamSide({ name, url, side, reverse }: { name: string; url: string | null; side: string; reverse?: boolean }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${reverse ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo name={name} url={url} size={42} rounded="full" />
      <div className="min-w-0">
        <div className="font-black truncate text-sm">{name}</div>
        <div className="text-[10px] text-muted-foreground">{side}</div>
      </div>
    </div>
  );
}

function CenterDial({ match, playing, settled, animSec }: { match: MatchRow; playing: boolean; settled: boolean; animSec: number }) {
  if (settled) {
    return <div className="text-center">
      <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Final</div>
      <div className="font-mono font-black text-xl text-emerald-400 tabular-nums">{match.home_score}-{match.away_score}</div>
    </div>;
  }
  if (playing) {
    return <div className="text-center">
      <div className="text-[9px] text-destructive uppercase tracking-widest animate-pulse">LIVE</div>
      <Crosshair className="h-7 w-7 text-destructive mx-auto animate-spin" style={{ animationDuration: "2s" }} />
    </div>;
  }
  return <div className="text-center">
    <div className="text-[9px] text-muted-foreground uppercase tracking-widest">VS</div>
    <Dice5 className="h-7 w-7 text-primary mx-auto animate-pulse" />
  </div>;
}

const KILL_LINES = [
  "headshot down range",
  "ambushed at the alley",
  "trade-kill on the rooftop",
  "wallbang from cover",
  "one-tap mid-block",
  "grenade wipes the corner",
  "clean flank executed",
  "clutch shot — gang down",
  "drive-by on the street",
  "scoped from the tower",
];

type Shot = { t: number; team: "h" | "a"; x: number; y: number; line: string };

// Deterministic pseudo-random so all clients see the same shot positions per match.
function seeded(seed: string, n: number) {
  let h = 2166136261;
  const s = `${seed}:${n}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return (h % 10000) / 10000;
}

function LiveMatchTicker({ match, animSec }: { match: MatchRow & { lock_time?: string | null }; animSec: number }) {
  const lockMs = (match as any).lock_time ? new Date((match as any).lock_time).getTime() : Date.now();
  const endMs = lockMs + animSec * 1000;
  const [shots, setShots] = useState<Shot[]>([]);
  const [tickScore, setTickScore] = useState<{ h: number; a: number }>({ h: 0, a: 0 });
  const [progress, setProgress] = useState(0);
  const [muzzle, setMuzzle] = useState<{ side: "h" | "a"; key: number } | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = serverNow();
      const ratio = Math.min(1, Math.max(0, (now - lockMs) / Math.max(1, endMs - lockMs)));
      setProgress(ratio);
      const fh = match.home_score ?? 0;
      const fa = match.away_score ?? 0;
      setTickScore({ h: fh, a: fa });
      const list: Shot[] = [];
      for (let i = 0; i < fh; i++) {
        list.push({
          t: i, team: "h",
          x: 10 + seeded(match.id + "hx", i) * 38,
          y: 12 + seeded(match.id + "hy", i) * 76,
          line: KILL_LINES[Math.floor(seeded(match.id + "hl", i) * KILL_LINES.length)],
        });
      }
      for (let i = 0; i < fa; i++) {
        list.push({
          t: i + 1000, team: "a",
          x: 52 + seeded(match.id + "ax", i) * 38,
          y: 12 + seeded(match.id + "ay", i) * 76,
          line: KILL_LINES[Math.floor(seeded(match.id + "al", i) * KILL_LINES.length)],
        });
      }
      setShots(list);
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [lockMs, endMs, match.id, match.status, match.home_score, match.away_score]);

  // Muzzle-flash burst whenever the score ticks up
  const prev = (typeof window !== "undefined") ? (window as any).__lslPrev ?? ((window as any).__lslPrev = new Map<string, { h: number; a: number }>()) : null;
  useEffect(() => {
    if (!prev) return;
    const last = prev.get(match.id) ?? { h: 0, a: 0 };
    if (tickScore.h > last.h) setMuzzle({ side: "h", key: Date.now() });
    else if (tickScore.a > last.a) setMuzzle({ side: "a", key: Date.now() });
    prev.set(match.id, tickScore);
    const id = setTimeout(() => setMuzzle(null), 420);
    return () => clearTimeout(id);
  }, [tickScore.h, tickScore.a, match.id]);

  const home = match.home_team?.name ?? "Home";
  const away = match.away_team?.name ?? "Away";
  const feed = [...shots].sort((a, b) => b.t - a.t).slice(0, 5);

  return (
    <div className="mt-3 rounded-lg overflow-hidden border border-destructive/40 bg-[oklch(0.18_0.02_30)]">
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-destructive/80 text-destructive-foreground">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.25em]">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          Live Gang War
        </div>
        <div className="text-[10px] font-mono opacity-90">Round {Math.max(1, Math.ceil(progress * 5))}/5</div>
      </div>

      {/* Battlefield arena */}
      <div
        className="relative h-44 w-full overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 50%, oklch(0.32 0.05 25 / 0.6), transparent 55%), radial-gradient(circle at 75% 50%, oklch(0.32 0.05 250 / 0.6), transparent 55%), linear-gradient(180deg, oklch(0.16 0.02 30), oklch(0.10 0.02 30))",
        }}
      >
        {/* Grid streetscape */}
        <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <pattern id="streetGrid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="oklch(0.7 0.05 30)" strokeWidth="0.2" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#streetGrid)" />
          {/* Center divider — no-man's-land */}
          <line x1="50" y1="0" x2="50" y2="100" stroke="oklch(0.82 0.17 90 / 0.4)" strokeWidth="0.4" strokeDasharray="2 2" />
          {/* Cover boxes */}
          <rect x="22" y="18" width="6" height="6" fill="oklch(0.4 0.04 30 / 0.6)" stroke="oklch(0.7 0.05 30 / 0.4)" strokeWidth="0.2" />
          <rect x="22" y="76" width="6" height="6" fill="oklch(0.4 0.04 30 / 0.6)" stroke="oklch(0.7 0.05 30 / 0.4)" strokeWidth="0.2" />
          <rect x="72" y="18" width="6" height="6" fill="oklch(0.4 0.04 250 / 0.6)" stroke="oklch(0.7 0.05 250 / 0.4)" strokeWidth="0.2" />
          <rect x="72" y="76" width="6" height="6" fill="oklch(0.4 0.04 250 / 0.6)" stroke="oklch(0.7 0.05 250 / 0.4)" strokeWidth="0.2" />
        </svg>

        {/* Side labels */}
        <div className="absolute top-1 left-2 text-[9px] font-black uppercase tracking-widest text-destructive/90 drop-shadow">{home}</div>
        <div className="absolute top-1 right-2 text-[9px] font-black uppercase tracking-widest text-sky-400 drop-shadow">{away}</div>

        {/* Gang member markers (kills/shots on the map) */}
        {shots.map((s) => (
          <div
            key={`${s.team}-${s.t}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
          >
            <span
              className={`block h-2 w-2 rounded-full ${s.team === "h" ? "bg-destructive" : "bg-sky-400"}`}
              style={{
                boxShadow: s.team === "h"
                  ? "0 0 8px oklch(0.6 0.22 25), 0 0 16px oklch(0.6 0.22 25 / 0.6)"
                  : "0 0 8px oklch(0.65 0.18 250), 0 0 16px oklch(0.65 0.18 250 / 0.6)",
              }}
            />
          </div>
        ))}

        {/* Muzzle flash burst on score change */}
        {muzzle && (
          <div
            key={muzzle.key}
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: muzzle.side === "h" ? "20%" : "75%",
              animation: "flash 420ms ease-out forwards",
            }}
          >
            <div
              className="h-20 w-20 rounded-full blur-xl"
              style={{ background: muzzle.side === "h" ? "oklch(0.85 0.22 60)" : "oklch(0.85 0.20 230)" }}
            />
          </div>
        )}

        {/* Scoreboard */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 rounded-md bg-black/70 border border-primary/50 backdrop-blur-sm">
          <span className="text-destructive font-mono font-black text-lg tabular-nums">{tickScore.h}</span>
          <span className="text-[9px] uppercase tracking-widest text-primary">KILLS</span>
          <span className="text-sky-400 font-mono font-black text-lg tabular-nums">{tickScore.a}</span>
        </div>
      </div>

      {/* Progress bar — round clock */}
      <div className="h-1 bg-black">
        <div className="h-full bg-gradient-to-r from-destructive via-primary to-sky-400 transition-all" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Kill feed (sportybet-style ticker) */}
      <div className="bg-[oklch(0.10_0.02_30)] divide-y divide-border/30">
        {feed.length === 0 && (
          <div className="px-3 py-2 text-[10px] text-muted-foreground italic">Gangs taking positions…</div>
        )}
        {feed.map((s) => (
          <div key={`feed-${s.team}-${s.t}`} className="flex items-center gap-2 px-3 py-1.5 text-[11px] animate-fade-in">
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${s.team === "h" ? "bg-destructive/20 text-destructive border border-destructive/40" : "bg-sky-500/20 text-sky-400 border border-sky-500/40"}`}
            >
              {s.team === "h" ? home : away}
            </span>
            <span className="text-foreground/85 truncate">— {s.line}</span>
            <span className="ml-auto text-[9px] font-mono text-muted-foreground">+1</span>
          </div>
        ))}
      </div>
    </div>
  );
}
