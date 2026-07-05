import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Layout } from "@/components/Layout";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dice5,
  Lock,
  Flame,
  Trophy,
  Clock,
  History,
  Crosshair,
  Zap,
  CheckCircle2,
  PauseCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";
import type { MarketRow, MatchRow, OddRow } from "@/lib/queries";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { toast } from "sonner";

type VirtualMatch = MatchRow & {
  lock_time?: string | null;
  locked_at?: string | null;
  virtual_round_batch_id?: string | null;
};

type VirtualSettings = {
  virtual_cycle_running?: boolean | null;
  virtual_animation_seconds?: number | null;
  virtual_round_duration_seconds?: number | null;
  virtual_matches_per_round?: number | null;
  virtual_max_score?: number | null;
};

type CycleState = { running: boolean; animSec: number; durSec: number; perRound: number; maxScore: number };

export const Route = createFileRoute("/virtual")({
  head: () => ({
    meta: [
      { title: "Virtual Gangs — Instant Rounds | LSL" },
      {
        name: "description",
        content:
          "Quick gang vs gang instant rounds. Stake winners, scores, and first blood — auto-played every 2 minutes.",
      },
    ],
  }),
  component: VirtualPage,
});

const matchSelect = `
  id,name,status,start_time,location,is_featured,home_score,away_score,is_virtual,lock_time,locked_at,virtual_round_batch_id,
  home_team:teams!home_team_id(id,name,logo_url,gang_type),
  away_team:teams!away_team_id(id,name,logo_url,gang_type),
  markets(id,name,is_open,odds(id,label,value,is_winner,market_id))
`;

function VirtualPage() {
  const [live, setLive] = useState<MatchRow[]>([]);
  const [upcoming, setUpcoming] = useState<MatchRow[]>([]);
  const [recent, setRecent] = useState<MatchRow[]>([]);
  const [cycle, setCycle] = useState<CycleState>({
    running: false,
    animSec: 30,
    durSec: 120,
    perRound: 5,
    maxScore: 8,
  });

  useEffect(() => {
    const load = async () => {
      await syncServerOffset();
      const [{ data: liveRows }, { data: upRows }, { data: recRows }, { data: cfg }] =
        await Promise.all([
          supabase
            .from("matches")
            .select(matchSelect)
            .eq("is_virtual", true)
            .eq("status", "live")
            .order("start_time", { ascending: false })
            .limit(20),
          supabase
            .from("matches")
            .select(matchSelect)
            .eq("is_virtual", true)
            .eq("status", "scheduled")
            .order("start_time", { ascending: true })
            .limit(40),
          supabase
            .from("matches")
            .select(matchSelect)
            .eq("is_virtual", true)
            .eq("status", "ended")
            .order("settled_at", { ascending: false })
            .limit(16),
          supabase
            .from("app_settings")
            .select(
              "virtual_cycle_running,virtual_animation_seconds,virtual_round_duration_seconds,virtual_matches_per_round,virtual_max_score",
            )
            .eq("id", 1)
            .maybeSingle(),
        ]);
      const activeRows = [...((liveRows ?? []) as unknown as VirtualMatch[]), ...((upRows ?? []) as unknown as VirtualMatch[])];
      const activeBatch = newestVirtualBatch(activeRows);
      const batchIsLive = activeBatch.some((m) => m.status === "live");
      setLive(batchIsLive ? activeBatch.map((m) => ({ ...m, status: "live" })) : []);
      setUpcoming(batchIsLive ? [] : activeBatch.filter((m) => m.status === "scheduled"));
      setRecent((recRows ?? []) as unknown as VirtualMatch[]);
      if (cfg) {
        const settings = cfg as VirtualSettings;
        setCycle({
          running: !!settings.virtual_cycle_running,
          animSec: Number(settings.virtual_animation_seconds ?? 30),
          durSec: Number(settings.virtual_round_duration_seconds ?? 120),
          perRound: Number(settings.virtual_matches_per_round ?? 5),
          maxScore: Number(settings.virtual_max_score ?? 8),
        });
      }
    };
    load();
    const t = setInterval(load, 1000);
    // Fallback ping while signed in, in case the scheduled backend tick lags.
    const ping = setInterval(() => {
      supabase.rpc("virtual_tick").then(
        () => {},
        () => {},
      );
    }, 8000);
    supabase.rpc("virtual_tick").then(
      () => {},
      () => {},
    );
    const ch = supabase
      .channel("virtual-rounds-v2")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: "is_virtual=eq.true" },
        load,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, load)
      .subscribe();
    return () => {
      clearInterval(t);
      clearInterval(ping);
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <Layout>
      <PageShell tone="default">
        <VirtualStadium
          live={live}
          upcoming={upcoming}
          recent={recent}
          cycle={cycle}
        />
      </PageShell>
    </Layout>
  );
}

function SectionTitle({
  icon: Icon,
  label,
  color,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`h-4 w-4 ${color}`} />
      <h2 className="text-xs sm:text-sm font-black uppercase tracking-[0.2em]">{label}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
    </div>
  );
}

function newestVirtualBatch(rows: VirtualMatch[]) {
  if (rows.length === 0) return [];
  const groups = new Map<string, VirtualMatch[]>();
  rows.forEach((row) => {
    const key = row.virtual_round_batch_id ?? row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return [...groups.values()].sort((a, b) => {
    const newestA = Math.max(...a.map((m) => new Date(m.lock_time ?? m.start_time).getTime()));
    const newestB = Math.max(...b.map((m) => new Date(m.lock_time ?? m.start_time).getTime()));
    return newestB - newestA;
  })[0] ?? [];
}

// Server-time offset so every client agrees with the DB clock (not their local time).
let __serverOffsetMs = 0;
async function syncServerOffset() {
  const t0 = Date.now();
  const { data, error } = await supabase.rpc("server_now");
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
function serverNow() {
  return Date.now() + __serverOffsetMs;
}

function useCountdown(target: string | null | undefined) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(t);
  }, []);
  if (!target) return { secs: 0, mm: "0", ss: "00", done: true };
  const diff = Math.max(0, new Date(target).getTime() - now);
  const secs = Math.floor(diff / 1000);
  const mm = String(Math.floor(secs / 60));
  const ss = String(secs % 60).padStart(2, "0");
  return { secs, mm, ss, done: secs <= 0 };
}

function useNowTick(interval = 500) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

function VirtualRoundCard({ match, animSec }: { match: VirtualMatch; animSec: number }) {
  const { add, selections } = useBetSlip();
  const home = match.home_team?.name ?? "Home";
  const away = match.away_team?.name ?? "Away";
  const lockTime = match.lock_time;
  const cd = useCountdown(lockTime);
  const settled = match.status === "ended";
  const playing = match.status === "live";
  const locked = settled || playing || cd.done;
  const isPicked = (oddId: string) => selections.some((s) => s.odd_id === oddId);

  const order = (n: string) =>
    /match\s*winner/i.test(n)
      ? 0
      : /first\s*blood/i.test(n)
        ? 1
        : /total/i.test(n)
          ? 2
          : /correct\s*score/i.test(n)
            ? 3
            : 4;
  // Hide Total Kills and Correct Score markets from the virtual marketing UI.
  const markets = [...(match.markets ?? [])]
    .filter((mk) => !/total\s*kills?/i.test(mk.name) && !/correct\s*score/i.test(mk.name))
    .sort((a, b) => order(a.name) - order(b.name));

  function pick(mk: MarketRow, o: OddRow) {
    if (locked) return;
    if (selections.length > 0 && selections.some((s) => !s.is_virtual)) {
      toast.error("Your slip has regular bets. Clear it before adding virtual selections.");
      return;
    }
    add({
      match_id: match.id,
      match_name: `${home} vs ${away}`,
      market_id: mk.id,
      market_name: mk.name,
      odd_id: o.id,
      selection_label: o.label,
      odds: Number(o.value),
      is_virtual: true,
      virtual_round_batch_id: match.virtual_round_batch_id ?? match.id,
    });
    toast.success("Selection added to bet slip");
  }

  return (
    <Card className="virtual-match-card p-4 relative overflow-hidden">
      <StatusBadge settled={settled} playing={playing} locked={locked} />
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Instant Virtual
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-2">
        <TeamSide name={home} url={match.home_team?.logo_url ?? null} side="Gang A" />
        <CenterDial match={match} playing={playing} settled={settled} animSec={animSec} />
        <TeamSide name={away} url={match.away_team?.logo_url ?? null} side="Gang B" reverse />
      </div>

      <div className="mt-3 text-center text-xs">
        {settled ? (
          <span className="text-amber-400 font-bold flex items-center justify-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Final {match.home_score}-{match.away_score}
          </span>
        ) : playing ? (
          <span className="text-destructive font-bold flex items-center justify-center gap-1 animate-pulse">
            <Crosshair className="h-3 w-3" />
            Match in progress…
          </span>
        ) : locked ? (
          <span className="text-destructive font-bold flex items-center justify-center gap-1">
            <Lock className="h-3 w-3" />
            Starting…
          </span>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="text-muted-foreground text-[10px] uppercase tracking-widest">
              Locks in
            </span>
            <span className="font-black text-2xl tabular-nums gradient-gold-text">
              {cd.mm}:{cd.ss}
            </span>
          </div>
        )}
      </div>

      {!settled && !playing && (
        <div className="mt-3 space-y-2">
          {markets.map((mk) => {
            const isCS = /correct\s*score/i.test(mk.name);
            const odds = isCS ? mk.odds.slice(0, 6) : mk.odds;
            return (
              <div
                key={mk.id}
                className="rounded-lg border border-primary/25 bg-background/40 p-2.5 shadow-inner"
              >
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  {mk.name}
                </div>
                <div
                  className={`grid gap-1.5 ${odds.length <= 3 ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}
                >
                  {odds.map((o) => {
                    const picked = isPicked(o.id);
                    return (
                      <button
                        key={o.id}
                        disabled={locked || !mk.is_open}
                        onClick={() => pick(mk, o)}
                        className={`px-1.5 py-1.5 rounded-md text-[11px] font-bold transition-all border ${
                          locked
                            ? "bg-secondary/30 text-muted-foreground cursor-not-allowed border-transparent"
                            : picked
                              ? "bg-primary/25 border-primary text-primary shadow-gold"
                              : "bg-secondary/50 border-primary/20 hover:border-primary/70 hover:bg-primary/15"
                        }`}
                      >
                        <div className="text-[9px] uppercase tracking-wider opacity-80 truncate">
                          {o.label}
                        </div>
                        <div className="text-[12px]">{Number(o.value).toFixed(2)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {markets.length === 0 && (
            <Badge variant="outline" className="text-[10px]">
              No markets yet
            </Badge>
          )}
        </div>
      )}

      {playing && <LiveMatchTicker match={match} animSec={animSec} />}
    </Card>
  );
}

function StatusBadge({
  settled,
  playing,
  locked,
}: {
  settled: boolean;
  playing: boolean;
  locked: boolean;
}) {
  const tone = settled
    ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
    : playing
      ? "bg-destructive/15 border-destructive/40 text-destructive animate-pulse"
      : locked
        ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
        : "bg-primary/15 border-primary/40 text-primary";
  const label = settled ? "● SETTLED" : playing ? "● LIVE" : locked ? "● LOCKED" : "● OPEN";
  return (
    <div
      className={`absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold tracking-widest rounded-bl-md border ${tone}`}
    >
      {label}
    </div>
  );
}

// Deterministic progressive score for a live virtual match. Starts 0-0 and ramps up smoothly
// over `animSec`, ending at the simulated total. The DB writes the authoritative final when
// the round resolves — at that point the card flips to status `ended` and shows the DB value.
function useLiveScore(match: VirtualMatch, animSec: number) {
  const lockMs = match.locked_at
    ? new Date(match.locked_at).getTime()
    : match.lock_time
      ? new Date(match.lock_time).getTime()
      : Date.now();
  const endMs = lockMs + animSec * 1000;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  const now = serverNow();
  const ratio = Math.min(1, Math.max(0, (now - lockMs) / Math.max(1, endMs - lockMs)));
  const targetH = Math.max(0, Number(match.home_score ?? 0));
  const targetA = Math.max(0, Number(match.away_score ?? 0));
  const { h, a } = progressiveScore(match.id, ratio, targetH, targetA);
  void tick;
  return { h, a, ratio };
}

function LiveFeedSection({ matches, animSec }: { matches: VirtualMatch[]; animSec: number }) {
  // Feature the most recently started live match; the rest get compact scorecards underneath.
  const featured = matches[0];
  const rest = matches.slice(1);
  return (
    <div className="space-y-4">
      <VirtualRoundCard match={featured} animSec={animSec} />
      {rest.length > 0 && (
        <Card className="virtual-live-list p-0 overflow-hidden">
          <div className="px-4 py-3 bg-destructive/10 border-b border-primary/30 flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-destructive" />
            <div className="text-[10px] font-black tracking-widest uppercase text-destructive">
              Other live matches · {rest.length}
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border/50">
            {rest.map((m) => (
              <LiveScoreRow key={m.id} match={m} animSec={animSec} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function LiveScoreRow({ match, animSec }: { match: VirtualMatch; animSec: number }) {
  const { h, a, ratio } = useLiveScore(match, animSec);
  const settled = match.status === "ended";
  const home = match.home_team?.name ?? "Home";
  const away = match.away_team?.name ?? "Away";
  const showH = settled ? match.home_score : h;
  const showA = settled ? match.away_score : a;
  return (
    <div className="px-3 py-2.5 flex items-center gap-3 hover:bg-primary/5 transition-colors">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <TeamLogo name={home} url={match.home_team?.logo_url ?? null} size={26} rounded="full" />
        <span className="text-xs font-bold truncate">{home}</span>
      </div>
      <div className="text-center min-w-[68px]">
        <div className="font-mono font-black text-base tabular-nums text-primary">
          {showH} - {showA}
        </div>
        {!settled ? (
          <div className="h-0.5 mt-0.5 rounded-full bg-background overflow-hidden">
            <div
              className="h-full bg-destructive transition-all"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        ) : (
          <div className="text-[8px] font-bold text-amber-400 tracking-widest">FINAL</div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0 flex-row-reverse text-right">
        <TeamLogo name={away} url={match.away_team?.logo_url ?? null} size={26} rounded="full" />
        <span className="text-xs font-bold truncate">{away}</span>
      </div>
    </div>
  );
}

function TeamSide({
  name,
  url,
  side,
  reverse,
}: {
  name: string;
  url: string | null;
  side: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${reverse ? "flex-row-reverse text-right" : ""}`}
    >
      <TeamLogo name={name} url={url} size={42} rounded="full" />
      <div className="min-w-0">
        <div className="font-black truncate text-sm">{name}</div>
        <div className="text-[10px] text-muted-foreground">{side}</div>
      </div>
    </div>
  );
}

function CenterDial({
  match,
  playing,
  settled,
  animSec,
}: {
  match: MatchRow;
  playing: boolean;
  settled: boolean;
  animSec: number;
}) {
  if (settled) {
    return (
      <div className="text-center">
        <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Final</div>
        <div className="font-mono font-black text-xl text-amber-400 tabular-nums">
          {match.home_score}-{match.away_score}
        </div>
      </div>
    );
  }
  if (playing) {
    return (
      <div className="text-center">
        <div className="text-[9px] text-destructive uppercase tracking-widest animate-pulse">
          LIVE
        </div>
        <Crosshair
          className="h-7 w-7 text-destructive mx-auto animate-spin"
          style={{ animationDuration: "2s" }}
        />
      </div>
    );
  }
  return (
    <div className="text-center">
      <div className="text-[9px] text-muted-foreground uppercase tracking-widest">VS</div>
      <Dice5 className="h-7 w-7 text-primary mx-auto animate-pulse" />
    </div>
  );
}

const KILL_LINES = [
  "⚔ Ambush in the alley!",
  "💥 Headshot — clean drop!",
  "🔫 Drive-by on the block!",
  "🎯 Sniper from the rooftop!",
  "⚡ Point-blank takedown!",
  "🧨 Molotov on the corner store!",
  "🏃 Flanked through the backstreet!",
  "🛡 Bodyguard down at the warehouse!",
  "🚗 Getaway car under fire!",
  "🔪 Close-quarters knife kill!",
];

// Deterministic pseudo-random based on match id + index — keeps positions stable per round.
function seedRand(seed: string, i: number) {
  const s = `${seed}:${i}`;
  let h = 0;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) % 1000003;
  return (h % 10000) / 10000;
}

function progressiveScore(matchId: string, ratio: number, finalHome = 0, finalAway = 0) {
  const eventCount = Math.max(1, finalHome + finalAway);
  let h = 0;
  let a = 0;
  for (let i = 0; i < eventCount; i++) {
    const eventAt = 0.06 + ((i + 1) / (eventCount + 1)) * 0.88 + (seedRand(matchId, 920 + i) - 0.5) * 0.05;
    if (ratio >= eventAt) {
      const homeQuota = finalHome / Math.max(1, eventCount);
      const expectedHome = Math.round((i + 1) * homeQuota);
      if (h < finalHome && (h < expectedHome || a >= finalAway)) h += 1;
      else if (a < finalAway) a += 1;
    }
  }
  return { h: ratio >= 1 ? finalHome : h, a: ratio >= 1 ? finalAway : a };
}

type Fighter = {
  x: number;
  y: number;
  side: "h" | "a";
  alive: boolean;
  flash: number;
  vx: number;
  vy: number;
};
type Tracer = { x1: number; y1: number; x2: number; y2: number; side: "h" | "a"; born: number };
type Blast = { x: number; y: number; born: number; size: number };

function LiveMatchTicker({ match, animSec, embedded = false }: { match: VirtualMatch; animSec: number; embedded?: boolean }) {
  const lockMs = match.locked_at
    ? new Date(match.locked_at).getTime()
    : match.lock_time
      ? new Date(match.lock_time).getTime()
      : Date.now();
  const endMs = lockMs + animSec * 1000;
  const [feed, setFeed] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [fighters, setFighters] = useState<Fighter[]>(() => {
    const arr: Fighter[] = [];
    for (let i = 0; i < 8; i++)
      arr.push({
        x: 8 + seedRand(match.id, i) * 25,
        y: 10 + seedRand(match.id, i + 100) * 80,
        side: "h",
        alive: true,
        flash: 0,
        vx: 0.22 + seedRand(match.id, i + 400) * 0.28,
        vy: -0.18 + seedRand(match.id, i + 500) * 0.36,
      });
    for (let i = 0; i < 8; i++)
      arr.push({
        x: 67 + seedRand(match.id, i + 200) * 25,
        y: 10 + seedRand(match.id, i + 300) * 80,
        side: "a",
        alive: true,
        flash: 0,
        vx: -0.22 - seedRand(match.id, i + 600) * 0.28,
        vy: -0.18 + seedRand(match.id, i + 700) * 0.36,
      });
    return arr;
  });
  const [tracers, setTracers] = useState<Tracer[]>([]);
  const [blasts, setBlasts] = useState<Blast[]>([]);
  const fightersRef = useRef(fighters);

  useEffect(() => {
    const tick = () => {
      const now = serverNow();
      const ratio = Math.min(1, Math.max(0, (now - lockMs) / Math.max(1, endMs - lockMs)));
      setProgress(ratio);
      const { h: fh, a: fa } = progressiveScore(
        match.id,
        ratio,
        Math.max(0, Number(match.home_score ?? 0)),
        Math.max(0, Number(match.away_score ?? 0)),
      );

      // Move fighters through the block, exchange fire, and drop casualties as the simulated score climbs.
      setFighters((prev) => {
        const next = prev.map((f, idx) => {
          const jitterX = (Math.random() - 0.5) * 0.85;
          const jitterY = (Math.random() - 0.5) * 0.95;
          const targetAlive =
            f.side === "h" ? Math.max(0, 8 - Math.min(8, fa)) : Math.max(0, 8 - Math.min(8, fh));
          const sideArr = prev.filter((p) => p.side === f.side);
          const myRank = sideArr.indexOf(f);
          const stillAlive = myRank < targetAlive;
          let nx = f.x + f.vx + jitterX;
          let ny = f.y + f.vy + jitterY;
          let nvx = f.vx;
          let nvy = f.vy;
          if (nx < 4 || nx > 96) nvx = -nvx;
          if (ny < 7 || ny > 93) nvy = -nvy;
          nx = Math.max(4, Math.min(96, nx));
          ny = Math.max(7, Math.min(93, ny));
          return {
            ...f,
            x: nx,
            y: ny,
            vx: nvx,
            vy: nvy,
            alive: stillAlive,
            flash: Math.max(0, f.flash - 0.18 + (stillAlive && Math.random() < 0.18 ? 1 : 0)),
          };
        });
        fightersRef.current = next;
        return next;
      });

      // Spawn tracer between random alive opponents.
      if (Math.random() < 0.55) {
        setTracers((prev) => {
          const alive = fightersRef.current.filter((f) => f.alive);
          if (alive.length < 2) return prev;
          const a = alive[Math.floor(Math.random() * alive.length)];
          const enemies = alive.filter((f) => f.side !== a.side);
          if (!enemies.length) return prev;
          const b = enemies[Math.floor(Math.random() * enemies.length)];
          const next = [...prev, { x1: a.x, y1: a.y, x2: b.x, y2: b.y, side: a.side, born: now }];
          if (Math.random() < 0.18)
            setBlasts((old) =>
              [...old, { x: b.x, y: b.y, born: now, size: 18 + Math.random() * 18 }]
                .filter((v) => now - v.born < 900)
                .slice(-5),
            );
          return next.filter((t) => now - t.born < 450).slice(-8);
        });
      } else {
        setTracers((prev) => prev.filter((t) => now - t.born < 450));
      }
      setBlasts((prev) => prev.filter((b) => now - b.born < 900));

      const surfaced: string[] = [];
      for (let i = 0; i < fh; i++) {
        const line =
          KILL_LINES[
            Math.abs((match.id.charCodeAt(i % match.id.length) + i * 7) % KILL_LINES.length)
          ];
        surfaced.unshift(`${match.home_team?.name}: ${line}`);
      }
      for (let i = 0; i < fa; i++) {
        const line =
          KILL_LINES[
            Math.abs((match.id.charCodeAt((i + 5) % match.id.length) + i * 11) % KILL_LINES.length)
          ];
        surfaced.unshift(`${match.away_team?.name}: ${line}`);
      }
      setFeed(surfaced.slice(0, 4));
    };
    tick();
    const t = setInterval(tick, 220);
    return () => clearInterval(t);
  }, [lockMs, endMs, match.id, match.status, match.home_team?.name, match.away_team?.name]);

  const homeName = match.home_team?.name ?? "Gang A";
  const awayName = match.away_team?.name ?? "Gang B";
  const aliveH = fighters.filter((f) => f.side === "h" && f.alive).length;
  const aliveA = fighters.filter((f) => f.side === "a" && f.alive).length;
  const { h: liveH, a: liveA } = useLiveScore(match, animSec);
  const settled = match.status === "ended";
  const showH = settled ? match.home_score : liveH;
  const showA = settled ? match.away_score : liveA;

  return (
    <div className={`${embedded ? "mt-0 rounded-none border-x-0 border-b-0" : "mt-3 rounded-xl"} border border-primary/40 bg-background/50 overflow-hidden shadow-gold`}>
      {/* Top-down combat zone (gang shooting battlefield) */}
      <div className="relative w-full aspect-[16/9] overflow-hidden bg-[#0b0f0a]">
        {/* Urban ground texture */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
            radial-gradient(circle at 20% 30%, rgba(80,60,40,0.35), transparent 40%),
            radial-gradient(circle at 75% 70%, rgba(60,40,30,0.4), transparent 45%),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 22px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 22px),
            linear-gradient(180deg, #1a1410 0%, #0d0a08 100%)`,
          }}
        />
        {/* Buildings / cover blocks */}
        <div
          className="absolute bg-black/70 border border-white/10 rounded-sm"
          style={{ left: "18%", top: "18%", width: "14%", height: "22%" }}
        />
        <div
          className="absolute bg-black/70 border border-white/10 rounded-sm"
          style={{ left: "42%", top: "55%", width: "16%", height: "20%" }}
        />
        <div
          className="absolute bg-black/70 border border-white/10 rounded-sm"
          style={{ left: "68%", top: "20%", width: "12%", height: "28%" }}
        />
        <div
          className="absolute bg-black/70 border border-white/10 rounded-sm"
          style={{ left: "8%", top: "70%", width: "12%", height: "16%" }}
        />
        {/* Street median line */}
        <div className="absolute left-1/2 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-amber-400/40 to-transparent" />

        {/* Side labels */}
        <div className="absolute top-1 left-2 text-[9px] font-black tracking-widest text-red-400 drop-shadow">
          RED · {homeName.toUpperCase()}
        </div>
        <div className="absolute top-1 right-2 text-[9px] font-black tracking-widest text-sky-400 drop-shadow">
          {awayName.toUpperCase()} · BLUE
        </div>
        <div className="absolute bottom-1 left-2 text-[9px] font-mono text-red-300/80">
          ALIVE {aliveH}
        </div>
        <div className="absolute bottom-1 right-2 text-[9px] font-mono text-sky-300/80">
          ALIVE {aliveA}
        </div>

        {/* Tracers (bullet paths) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <defs>
            <filter id={`glow-${match.id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {tracers.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.side === "h" ? "#ff5252" : "#4dd2ff"}
              strokeWidth="0.35"
              strokeLinecap="round"
              opacity={0.85}
              style={{ filter: `drop-shadow(0 0 1.2px ${t.side === "h" ? "#ff5252" : "#4dd2ff"})` }}
            />
          ))}
        </svg>

        {/* Bomb / impact bursts */}
        {blasts.map((b, i) => (
          <div
            key={`${b.born}-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
          >
            <div
              className="rounded-full bg-amber-300/80 animate-ping"
              style={{ width: b.size, height: b.size, animationDuration: "0.75s" }}
            />
            <div className="absolute inset-1 rounded-full bg-orange-500/70 blur-sm" />
          </div>
        ))}

        {/* Fighters */}
        {fighters.map((f, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-linear"
            style={{ left: `${f.x}%`, top: `${f.y}%` }}
          >
            {f.alive ? (
              <div className="relative">
                <div
                  className={`relative h-3.5 w-3.5 rounded-full border ${f.side === "h" ? "bg-red-500 border-red-200 shadow-[0_0_8px_#ff5252]" : "bg-sky-400 border-sky-100 shadow-[0_0_8px_#4dd2ff]"}`}
                >
                  <span className="absolute left-1/2 top-[-5px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-foreground/85" />
                  <span
                    className={`absolute top-1/2 h-[2px] w-3 -translate-y-1/2 ${f.side === "h" ? "left-2 bg-red-200" : "right-2 bg-sky-100"}`}
                  />
                </div>
                {f.flash > 0.2 && (
                  <div
                    className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-amber-300/80 animate-ping"
                    style={{ animationDuration: "0.6s" }}
                  />
                )}
              </div>
            ) : (
              <div className="text-[10px] leading-none text-muted-foreground/70">✕</div>
            )}
          </div>
        ))}

        {/* Smoke vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>

      {/* Scoreboard + ticker */}
      <div className="p-3 bg-gradient-to-r from-background/80 via-secondary/50 to-background/80">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-destructive font-bold flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Live shootout
          </div>
          <div className="font-mono font-black text-2xl tabular-nums text-primary tracking-widest">
            {showH} - {showA}
            {settled && (
              <span className="ml-2 text-[9px] font-bold text-amber-400 tracking-widest align-middle">
                FINAL
              </span>
            )}
          </div>
        </div>
        <div className="h-1 rounded-full bg-background overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-sky-400 transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="space-y-1 min-h-[56px]">
          {feed.length === 0 && (
            <div className="text-[10px] text-muted-foreground">Gangs locking & loading…</div>
          )}
          {feed.map((line, i) => (
            <div
              key={i}
              className="text-[11px] text-foreground/90 animate-fade-in flex items-start gap-1.5"
            >
              <span className="text-destructive">▸</span>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Bet9ja-style Virtual Stadium layout
// ============================================================================

type Phase = "pre" | "match" | "post";

function VirtualStadium({
  live,
  upcoming,
  recent,
  cycle,
}: {
  live: MatchRow[];
  upcoming: MatchRow[];
  recent: MatchRow[];
  cycle: CycleState;
}) {
  const activeBatch = (live.length ? live : upcoming) as VirtualMatch[];
  const featured = (live[0] ?? upcoming[0]) as VirtualMatch | undefined;
  const phase: Phase = live.length > 0 ? "match" : upcoming.length > 0 ? "pre" : "post";
  const roundNo = featured?.virtual_round_batch_id
    ? Math.abs(hashStr(featured.virtual_round_batch_id)) % 90000 + 10000
    : 45000;
  const matchDay = featured
    ? (Math.floor(new Date(featured.start_time).getTime() / (cycle.durSec * 1000)) % 20) + 1
    : 1;

  // Distinct market names across the batch, in preferred order.
  const marketNames = Array.from(
    new Set(activeBatch.flatMap((m) => (m.markets ?? []).map((mk) => mk.name))),
  ).sort((a, b) => marketOrder(a) - marketOrder(b));
  const [marketIdx, setMarketIdx] = useState(0);
  useEffect(() => {
    if (marketIdx >= marketNames.length) setMarketIdx(0);
  }, [marketNames.length, marketIdx]);
  const activeMarketName = marketNames[marketIdx] ?? "Match Winner";

  return (
      <div className="virtual-stadium max-w-5xl mx-auto pb-24">
      {/* Top control bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-background/80 border-b border-primary/30">
        <Link to="/" className="p-1.5 -ml-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="font-black tracking-wider text-primary text-lg gradient-gold-text">LSL</div>
        <Link to="/virtual/history" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <History className="h-3.5 w-3.5" /> Rounds
        </Link>
      </div>

      {/* Round header */}
      <div className="bg-secondary/60 border-b border-primary/20 px-4 py-3 text-center">
        <div className="text-sm font-black text-foreground">LSL Virtual Gang League</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-center gap-2">
          <span>{roundNo} / Match Day {matchDay}</span>
          <PhaseChip phase={phase} />
        </div>
      </div>

      {/* Video / animation stage */}
      <VideoStage featured={featured} matches={activeBatch} recent={recent as VirtualMatch[]} phase={phase} animSec={cycle.animSec} cycle={cycle} />

      {/* Fixtures preview grid */}
      <FixturesGrid matches={activeBatch} phase={phase} />

      {/* Place Your Bets divider + market pager */}
      <div className="bg-background/80 border-y border-primary/20 mt-1">
          <div className="text-center py-1.5 text-[11px] font-black tracking-[0.3em] uppercase text-primary bg-secondary/40 border-b border-primary/20">
          Place Your Bets
        </div>
        {marketNames.length > 0 && (
          <MarketPager
            names={marketNames}
            idx={marketIdx}
            setIdx={setMarketIdx}
          />
        )}
      </div>

      {/* Match Day group with bet rows */}
      {activeBatch.length > 0 ? (
        <MatchDayBoard
          label={`Match Day ${matchDay}`}
          countdownTarget={featured?.lock_time ?? null}
          matches={activeBatch}
          activeMarketName={activeMarketName}
          cycle={cycle}
        />
      ) : (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Dice5 className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {cycle.running ? "Spinning up next round…" : "Cycle paused — waiting for admin."}
        </div>
      )}

      {/* Recent results */}
      {recent.length > 0 && (
        <div className="mt-4 border-t border-primary/20">
          <div className="text-center py-1.5 text-[11px] font-black tracking-[0.3em] uppercase text-amber-400 bg-secondary/40 border-b border-primary/20">
            Recent Results
          </div>
          <div className="divide-y divide-border/40">
            {recent.slice(0, 8).map((m) => (
              <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 text-xs">
                <div className="truncate font-semibold">{m.home_team?.name}</div>
                <div className="font-mono font-black text-primary tabular-nums text-sm">
                  {m.home_score} - {m.away_score}
                </div>
                <div className="truncate font-semibold text-right">{m.away_team?.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseChip({ phase }: { phase: Phase }) {
  const label = phase === "match" ? "MATCH" : phase === "pre" ? "PRE MATCH" : "POST MATCH";
  const tone =
    phase === "match"
      ? "bg-destructive/20 text-destructive border-destructive/40"
      : phase === "pre"
        ? "bg-primary/20 text-primary border-primary/40"
        : "bg-amber-500/20 text-amber-400 border-amber-500/40";
  return (
    <span className={`px-1.5 py-0.5 rounded-sm border text-[10px] font-black tracking-widest ${tone}`}>
      {label}
    </span>
  );
}

const LINEUP_TAGS = ["Ace", "Shot Caller", "Lookout", "Runner", "Enforcer", "Driver", "Rookie", "Backup"];

function makeLineups(match: VirtualMatch | undefined) {
  const homeBase = match?.home_team?.name ?? "Gang A";
  const awayBase = match?.away_team?.name ?? "Gang B";
  return {
    home: LINEUP_TAGS.slice(0, 6).map((tag, i) => `${homeBase} ${tag} ${i + 1}`),
    away: LINEUP_TAGS.slice(0, 6).map((tag, i) => `${awayBase} ${tag} ${i + 1}`),
  };
}

function LineupList({ names, tone }: { names: string[]; tone: "home" | "away" }) {
  return (
    <div className="space-y-1.5">
      {names.map((name, idx) => (
        <div key={name} className="grid grid-cols-[18px_1fr_22px] items-center gap-2 border-b border-white/10 pb-1 text-[10px]">
          <span className={`font-mono ${tone === "home" ? "text-red-400" : "text-sky-400"}`}>{idx + 1}</span>
          <span className="truncate font-bold text-white/85">{name}</span>
          <span className="text-right font-mono text-primary">{Math.max(4, 9 - idx)}</span>
        </div>
      ))}
    </div>
  );
}

function PreviousScores({ matches, now }: { matches: VirtualMatch[]; now: number }) {
  void now;
  const rows = matches.slice(0, 6);
  if (rows.length === 0) {
    return <div className="py-4 text-center text-[11px] text-muted-foreground">No previous shootouts yet.</div>;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((m) => (
        <div key={m.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-white/10 pb-1 text-[10px]">
          <div className="min-w-0">
            <div className="truncate font-bold text-white/85">{m.home_team?.name ?? "Gang A"}</div>
            <div className="truncate text-muted-foreground">{m.away_team?.name ?? "Gang B"}</div>
          </div>
          <div className="font-mono font-black text-primary tabular-nums">
            {m.status === "ended" ? `${m.home_score}-${m.away_score}` : "--"}
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoStage({
  featured,
  matches,
  recent,
  phase,
  animSec,
  cycle,
}: {
  featured: VirtualMatch | undefined;
  matches: VirtualMatch[];
  recent: VirtualMatch[];
  phase: Phase;
  animSec: number;
  cycle: CycleState;
}) {
  const cd = useCountdown(featured?.lock_time ?? null);
  const now = useNowTick(500);
  const lineups = useMemo(() => makeLineups(featured), [featured?.id]);
  const countdownPct = featured?.lock_time
    ? Math.max(0, Math.min(1, 1 - cd.secs / Math.max(1, cycle.durSec)))
    : 0;
  const preTitle = featured
    ? `${featured.home_team?.name ?? "Gang A"} vs ${featured.away_team?.name ?? "Gang B"}`
    : "Next shootout";
  // While live, show the shooter battle animation as the stage
  if (phase === "match" && featured) {
    const liveScore = useLiveScore(featured, animSec);
    const minute = Math.min(90, Math.max(1, Math.floor(liveScore.ratio * 90)));
    return (
      <div className="bg-black">
        <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold bg-black/80 border-b border-primary/20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-1.5 py-0.5 bg-black/60 border border-white/10 rounded text-[10px] font-mono">
              {minute}&#39;
            </span>
            <TeamLogo name={featured.home_team?.name ?? ""} url={featured.home_team?.logo_url ?? null} size={18} rounded="md" />
            <span className="font-black truncate">{featured.home_team?.name}</span>
          </div>
          <span className="font-mono font-black tabular-nums text-primary px-2">
            {liveScore.h}:{liveScore.a}
          </span>
          <div className="flex items-center gap-2 min-w-0 flex-row-reverse text-right">
            <TeamLogo name={featured.away_team?.name ?? ""} url={featured.away_team?.logo_url ?? null} size={18} rounded="md" />
            <span className="font-black truncate">{featured.away_team?.name}</span>
          </div>
        </div>
        <LiveMatchTicker match={featured} animSec={animSec} embedded />
      </div>
    );
  }
  // Pre-match staging area — countdown left, recent scores right, lineups over the shootout field.
  return (
    <div className="relative bg-black aspect-[16/9] min-h-[360px] overflow-hidden">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(circle at 28% 42%, rgba(120,40,30,0.35), transparent 52%),
            radial-gradient(circle at 74% 54%, rgba(20,130,95,0.28), transparent 55%),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 28px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 34px),
            linear-gradient(180deg, rgba(24,15,10,0.95), rgba(5,5,6,0.98))`,
        }}
      />
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-2 py-1 text-[10px] font-black bg-black/75 border-b border-primary/20">
        <span className="truncate text-red-400">● {featured?.home_team?.name ?? "Gang A"}</span>
        <span className="font-mono text-primary tabular-nums">{featured ? "--" : "0:0"}</span>
        <span className="truncate text-right text-sky-400">{featured?.away_team?.name ?? "Gang B"} ●</span>
      </div>

      <div className="relative z-10 grid h-full grid-cols-1 md:grid-cols-[0.9fr_1.3fr_0.9fr] gap-3 p-4 pt-9">
        <div className="flex flex-col justify-center gap-4">
          <div className="rounded-md border border-primary/25 bg-black/55 p-4 shadow-luxury">
            <div className="text-[10px] uppercase tracking-[0.35em] text-primary/80">Round locks in</div>
            <div className="mt-2 font-mono text-5xl font-black tabular-nums text-primary leading-none">
              {featured?.lock_time && !cd.done ? `${cd.mm}:${cd.ss}` : cycle.running ? "0:00" : "--:--"}
            </div>
            <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-gold transition-all" style={{ width: `${countdownPct * 100}%` }} />
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground truncate">{preTitle}</div>
          </div>
          <div className="rounded-md border border-border/40 bg-black/45 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Line ups</div>
            <LineupList names={lineups.home} tone="home" />
          </div>
        </div>

        <div className="relative flex items-center justify-center min-h-[260px]">
          <div className="absolute inset-6 rounded-full border-[10px] border-white/10" />
          <div className="absolute inset-0 flex items-center justify-center opacity-25">
            <Play className="h-40 w-40 text-white fill-white" />
          </div>
          <div className="relative z-10 text-center">
            <div className="mx-auto grid h-28 w-28 place-items-center rounded-full border border-primary/70 bg-black/55 shadow-[0_0_55px_-12px_rgba(212,175,55,0.8)]">
              <Crosshair className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <div className="mt-5 text-[10px] font-black uppercase tracking-[0.35em] text-primary">
              ▼ Place your bets ▼
            </div>
            <div className="mt-2 text-xs text-white/70">Gang vs gang shootout begins at lock</div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4">
          <div className="rounded-md border border-border/40 bg-black/45 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Opposing line</div>
            <LineupList names={lineups.away} tone="away" />
          </div>
          <div className="rounded-md border border-primary/25 bg-black/55 p-3 shadow-luxury">
            <div className="mb-2 text-[10px] uppercase tracking-[0.28em] text-primary/80">Previous scores</div>
            <PreviousScores matches={recent.length ? recent : matches} now={now} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FixturesGrid({ matches, phase }: { matches: VirtualMatch[]; phase: Phase }) {
  // Two column table of all matches in the round (like the bet9ja stage table)
  const half = Math.ceil(matches.length / 2);
  const cols = [matches.slice(0, half), matches.slice(half)];
  return (
    <div className="bg-black/70 border-b border-primary/20 text-[10px]">
      <div className="grid grid-cols-2 divide-x divide-border/40">
        {cols.map((col, ci) => (
          <div key={ci}>
            <div className="grid grid-cols-[1fr_28px_28px] px-2 py-1 text-muted-foreground uppercase tracking-widest border-b border-border/40">
              <span>Team</span>
              <span className="text-center">FT</span>
              <span className="text-center">HT</span>
            </div>
            {col.map((m) => <FixtureScoreRow key={m.id} match={m} phase={phase} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function FixtureScoreRow({ match, phase }: { match: VirtualMatch; phase: Phase }) {
  const score = useLiveScore(match, 35);
  const ftH = phase === "pre" ? "-" : phase === "match" ? score.h : match.home_score;
  const ftA = phase === "pre" ? "-" : phase === "match" ? score.a : match.away_score;
  const halfH = phase === "pre" ? "-" : Math.floor(Number(ftH) * 0.45);
  const halfA = phase === "pre" ? "-" : Math.floor(Number(ftA) * 0.45);
  return (
    <div className="grid grid-cols-[1fr_28px_28px] px-2 py-1 border-b border-border/20">
      <div className="min-w-0">
        <div className="truncate">{match.home_team?.name ?? "Gang A"}</div>
        <div className="truncate">{match.away_team?.name ?? "Gang B"}</div>
      </div>
      <div className="text-center font-mono tabular-nums">
        <div>{ftH}</div>
        <div>{ftA}</div>
      </div>
      <div className="text-center font-mono tabular-nums text-muted-foreground">
        <div>{halfH}</div>
        <div>{halfA}</div>
      </div>
    </div>
  );
}

function MarketPager({ names, idx, setIdx }: { names: string[]; idx: number; setIdx: (n: number) => void }) {
  const cur = names[idx] ?? names[0];
  return (
    <div className="flex items-center px-2 py-2">
      <button
        onClick={() => setIdx((idx - 1 + names.length) % names.length)}
        className="p-1 text-muted-foreground hover:text-primary"
        aria-label="Previous market"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex-1 text-center">
        <div className="text-sm font-bold">{cur}</div>
        <div className="flex justify-center gap-1 mt-1">
          {names.map((_, i) => (
            <span
              key={i}
              className={`h-1 w-1 rounded-full ${i === idx ? "bg-primary" : "bg-muted-foreground/40"}`}
            />
          ))}
        </div>
      </div>
      <button
        onClick={() => setIdx((idx + 1) % names.length)}
        className="p-1 text-muted-foreground hover:text-primary"
        aria-label="Next market"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function MatchDayBoard({
  label,
  countdownTarget,
  matches,
  activeMarketName,
  cycle,
}: {
  label: string;
  countdownTarget: string | null;
  matches: VirtualMatch[];
  activeMarketName: string;
  cycle: CycleState;
}) {
  const cd = useCountdown(countdownTarget);
  return (
    <div>
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-secondary/50 border-b border-border/40 text-xs">
        <span className="font-bold">{label}</span>
        {countdownTarget && !cd.done && (
          <span className="px-1.5 py-0.5 bg-black rounded font-mono font-black tabular-nums text-primary text-[11px]">
            {cd.mm.padStart(2, "0")}:{cd.ss}
          </span>
        )}
      </div>
      <div className="divide-y divide-border/40">
        {matches.map((m) => (
          <VirtualBetRow key={m.id} match={m} marketName={activeMarketName} cycle={cycle} />
        ))}
      </div>
    </div>
  );
}

function VirtualBetRow({
  match,
  marketName,
  cycle,
}: {
  match: VirtualMatch;
  marketName: string;
  cycle: CycleState;
}) {
  const { add, selections } = useBetSlip();
  const home = match.home_team?.name ?? "Home";
  const away = match.away_team?.name ?? "Away";
  const cd = useCountdown(match.lock_time);
  const locked = match.status !== "scheduled" || cd.done;
  const market = (match.markets ?? []).find((mk) => mk.name === marketName) ?? match.markets?.[0];
  const isPicked = (oid: string) => selections.some((s) => s.odd_id === oid);

  const pick = (mk: MarketRow, o: OddRow) => {
    if (locked || !mk.is_open) return;
    if (selections.length > 0 && selections.some((s) => !s.is_virtual)) {
      toast.error("Clear your slip before adding virtual selections.");
      return;
    }
    add({
      match_id: match.id,
      match_name: `${home} vs ${away}`,
      market_id: mk.id,
      market_name: mk.name,
      odd_id: o.id,
      selection_label: o.label,
      odds: Number(o.value),
      is_virtual: true,
      virtual_round_batch_id: match.virtual_round_batch_id ?? match.id,
    });
    toast.success("Selection added to bet slip");
  };

  void cycle;
  const odds = (market?.odds ?? []).slice(0, 3);
  const labels = ["1", "X", "2"];

  return (
    <div className="grid grid-cols-[1fr_auto_28px] items-center gap-2 px-2 py-2 hover:bg-primary/5">
      <div className="min-w-0 text-[11px] leading-tight">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-mono w-4 text-right">{rankOf(match, "h")}</span>
          <TeamLogo name={home} url={match.home_team?.logo_url ?? null} size={16} rounded="md" />
          <span className="font-bold truncate">{home}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-mono w-4 text-right">{rankOf(match, "a")}</span>
          <TeamLogo name={away} url={match.away_team?.logo_url ?? null} size={16} rounded="md" />
          <span className="font-bold truncate">{away}</span>
        </div>
        <Link
          to="/matches/$matchId"
          params={{ matchId: match.id }}
          className="text-[9px] uppercase tracking-widest text-primary/80 hover:text-primary mt-0.5 inline-block"
        >
          More bets ›
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {odds.map((o, i) => {
          const picked = isPicked(o.id);
          return (
            <button
              key={o.id}
              disabled={locked || !market?.is_open}
              onClick={() => market && pick(market, o)}
              className={`h-11 min-w-[54px] rounded-md text-white font-bold flex flex-col items-center justify-center leading-none transition ${
                locked
                  ? "bg-muted/50 text-muted-foreground cursor-not-allowed"
                  : picked
                    ? "bg-primary text-primary-foreground shadow-gold"
                    : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              <span className="text-[9px] opacity-80">{labels[i] ?? o.label}</span>
              <span className="text-sm tabular-nums font-mono flex items-center gap-1">
                {locked && <Lock className="h-2.5 w-2.5" />}
                {Number(o.value).toFixed(2)}
              </span>
            </button>
          );
        })}
        {odds.length === 0 && (
          <div className="col-span-3 text-[10px] text-muted-foreground italic px-2">No odds</div>
        )}
      </div>
      <Link
        to="/matches/$matchId"
        params={{ matchId: match.id }}
        className="h-8 w-8 rounded-full border border-emerald-500/60 text-emerald-500 hover:bg-emerald-500/10 flex items-center justify-center"
        aria-label="More markets"
      >
        <BarChart3 className="h-4 w-4" />
      </Link>
    </div>
  );
}

function marketOrder(n: string) {
  if (/match\s*winner|1x2|3\s*way/i.test(n)) return 0;
  if (/double\s*chance/i.test(n)) return 1;
  if (/first\s*blood|first\s*(goal|kill)/i.test(n)) return 2;
  if (/total/i.test(n)) return 3;
  if (/correct\s*score/i.test(n)) return 4;
  return 9;
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function rankOf(m: VirtualMatch, side: "h" | "a") {
  const seed = (m.virtual_round_batch_id ?? m.id) + side;
  return (Math.abs(hashStr(seed)) % 16) + 1;
}
