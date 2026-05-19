import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
        supabase.from("matches").select(matchSelect).eq("is_virtual", true).eq("status", "live").order("start_time", { ascending: false }).limit(3),
        supabase.from("matches").select(matchSelect).eq("is_virtual", true).eq("status", "scheduled").order("start_time", { ascending: true }).limit(6),
        supabase.from("matches").select(matchSelect).eq("is_virtual", true).eq("status", "ended").order("settled_at", { ascending: false }).limit(8),
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
    const t = setInterval(load, 3000);
    // Fallback ping while signed in, in case the scheduled backend tick lags.
    const ping = setInterval(() => { supabase.rpc("virtual_tick").then(() => {}, () => {}); }, 8000);
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
                  <div className="grid gap-4 md:grid-cols-2">
                    {upcoming.map((m) => <VirtualRoundCard key={m.id} match={m} animSec={cycle.animSec} />)}
                  </div>
                </section>
              )}

              {live.length > 0 && (
                <section>
                  <SectionTitle icon={Flame} label="Playing out · watch live" color="text-destructive" />
                  <div className="grid gap-4 md:grid-cols-2">
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

  const order = (n: string) => /match\s*winner/i.test(n) ? 0 : /first\s*blood/i.test(n) ? 1 : /total/i.test(n) ? 2 : /correct\s*score/i.test(n) ? 3 : 4;
  const markets = [...(match.markets ?? [])].sort((a, b) => order(a.name) - order(b.name));

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
  "⚔ Ambush at A site!",
  "💥 Headshot — clean kill!",
  "🔫 Trade kill on bombsite!",
  "🎯 Wallbang for the assist!",
  "⚡ One-tap from mid!",
  "🧨 Grenade wipe!",
  "🏃 Flank successful!",
  "🛡 Clutch defuse incoming!",
];

// Deterministic PRNG so all viewers see same live scores per match
function seedFrom(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; };
}

function LiveMatchTicker({ match, animSec }: { match: MatchRow & { lock_time?: string | null }; animSec: number }) {
  const lockMs = (match as any).lock_time ? new Date((match as any).lock_time).getTime() : Date.now();
  const endMs = lockMs + animSec * 1000;
  const [feed, setFeed] = useState<string[]>([]);
  const [tickScore, setTickScore] = useState<{ h: number; a: number }>({ h: 0, a: 0 });
  const [progress, setProgress] = useState(0);

  // Pre-roll a fixed timeline of "kills" using a match-seeded RNG so every viewer agrees.
  // Dense schedule so something happens every couple of seconds across the live window.
  const timeline = useMemo(() => {
    const rnd = seedFrom(match.id);
    const maxPerSide = 8;
    const total = 6 + Math.floor(rnd() * 9); // 6..14 kills across the match
    const events: { t: number; side: "h" | "a" }[] = [];
    let h = 0, a = 0;
    for (let i = 0; i < total; i++) {
      // Spread events through 5%..95% of the window for a steady drumbeat
      const t = 0.05 + rnd() * 0.9;
      const side: "h" | "a" = rnd() < 0.5 ? "h" : "a";
      if (side === "h" && h >= maxPerSide) continue;
      if (side === "a" && a >= maxPerSide) continue;
      if (side === "h") h++; else a++;
      events.push({ t, side });
    }
    return events.sort((x, y) => x.t - y.t);
  }, [match.id]);

  useEffect(() => {
    const tick = () => {
      const now = serverNow();
      const ratio = Math.min(1, Math.max(0, (now - lockMs) / Math.max(1, endMs - lockMs)));
      setProgress(ratio);
      const fh = match.home_score ?? 0;
      const fa = match.away_score ?? 0;
      // Once settled, lock to final server scores
      if (match.status === "ended" && (fh || fa)) {
        setTickScore({ h: fh, a: fa });
        setProgress(1);
        return;
      }
      let h = 0, a = 0;
      const surfaced: string[] = [];
      for (const ev of timeline) {
        if (ev.t <= ratio) {
          if (ev.side === "h") h++; else a++;
          const team = ev.side === "h" ? match.home_team?.name : match.away_team?.name;
          const line = KILL_LINES[Math.floor((ev.t * 9973) % KILL_LINES.length)];
          surfaced.unshift(`${team}: ${line}`);
        }
      }
      // Prefer server-progressed scores when they exceed ticker estimate
      setTickScore({ h: Math.max(h, fh), a: Math.max(a, fa) });
      setFeed(surfaced.slice(0, 5));
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [lockMs, endMs, timeline, match.status, match.home_score, match.away_score, match.home_team?.name, match.away_team?.name]);

  return (
    <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-destructive font-bold flex items-center gap-1"><Sparkles className="h-3 w-3" />Live feed</div>
        <div className="font-mono font-black text-2xl tabular-nums text-foreground">{tickScore.h} <span className="text-muted-foreground text-base">·</span> {tickScore.a}</div>
      </div>
      <div className="h-1 rounded-full bg-background overflow-hidden mb-2">
        <div className="h-full bg-gradient-to-r from-primary to-destructive transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="space-y-1 min-h-[64px]">
        {feed.length === 0 && <div className="text-[10px] text-muted-foreground">Gangs entering site…</div>}
        {feed.map((line, i) => (
          <div key={i} className="text-[11px] text-foreground/90 animate-fade-in">{line}</div>
        ))}
      </div>
    </div>
  );
}
