import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ComponentType } from "react";
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
        <div className="container py-6 sm:py-10 space-y-8">
          <header className="virtual-hero-shell text-center relative p-5 sm:p-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-[10px] uppercase tracking-[0.3em] text-primary mb-3">
              <Dice5 className="h-3.5 w-3.5" /> Instant Virtuals · Auto-Play
            </div>
            <h1 className="text-4xl sm:text-6xl font-black gradient-gold-text">Gang vs Gang</h1>
            <p className="text-muted-foreground mt-3 text-sm sm:text-base max-w-2xl mx-auto">
              Stake one or many markets. Watch one featured live feed while every active match score
              updates to the same final result used on vouchers.
            </p>
            <div className="mt-4 flex justify-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={
                  cycle.running
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }
              >
                {cycle.running ? (
                  <>
                    <Zap className="h-3 w-3 mr-1" />
                    Cycle running
                  </>
                ) : (
                  <>
                    <PauseCircle className="h-3 w-3 mr-1" />
                    Cycle paused
                  </>
                )}
              </Badge>
              <Link to="/virtual/history">
                <Button variant="outline" size="sm">
                  <History className="h-3.5 w-3.5 mr-1" />
                  Rounds & Claims
                </Button>
              </Link>
            </div>
          </header>

          {live.length === 0 && upcoming.length === 0 ? (
            <Card className="virtual-match-card p-8 text-center text-muted-foreground">
              <Dice5 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-semibold">
                {cycle.running
                  ? "Spinning up the next round…"
                  : "No virtual rounds active right now."}
              </p>
              <p className="text-xs mt-1">
                {cycle.running
                  ? "New round appears within seconds."
                  : "Admin will start the cycle shortly."}
              </p>
            </Card>
          ) : (
            <>
              {live.length === 0 && upcoming.length > 0 && (
                <section>
                  <SectionTitle
                    icon={Clock}
                    label={`Open · stake before lock (${Math.round(cycle.durSec / 60)} min window · ${cycle.perRound} matches)`}
                    color="text-primary"
                  />
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {upcoming.map((m) => (
                      <VirtualRoundCard key={m.id} match={m} animSec={cycle.animSec} />
                    ))}
                  </div>
                </section>
              )}

              {live.length > 0 && (
                <section>
                  <SectionTitle
                    icon={Flame}
                    label="Playing out · watch live"
                    color="text-destructive"
                  />
                  <LiveFeedSection matches={live} animSec={cycle.animSec} />
                </section>
              )}
            </>
          )}

          {recent.length > 0 && (
            <section>
              <SectionTitle icon={Trophy} label="Recent results" color="text-emerald-400" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {recent.map((m) => {
                  const outcome =
                    m.home_score > m.away_score
                      ? `${m.home_team?.name} WIN`
                      : m.away_score > m.home_score
                        ? `${m.away_team?.name} WIN`
                        : "DRAW";
                  return (
                    <Card key={m.id} className="virtual-result-card p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">
                        {m.name}
                      </div>
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <TeamLogo
                            name={m.home_team?.name ?? ""}
                            url={m.home_team?.logo_url ?? null}
                            size={22}
                            rounded="full"
                          />
                          <span className="text-xs font-bold truncate">{m.home_team?.name}</span>
                        </div>
                        <span className="font-mono font-black text-base text-primary tabular-nums">
                          {m.home_score} - {m.away_score}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0 flex-row-reverse">
                          <TeamLogo
                            name={m.away_team?.name ?? ""}
                            url={m.away_team?.logo_url ?? null}
                            size={22}
                            rounded="full"
                          />
                          <span className="text-xs font-bold truncate">{m.away_team?.name}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-center text-[10px] font-bold tracking-widest text-emerald-400">
                        {outcome}
                      </div>
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

function VirtualRoundCard({ match, animSec }: { match: VirtualMatch; animSec: number }) {
  const { add, setOpen, selections } = useBetSlip();
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
    setOpen(true);
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
          <span className="text-emerald-400 font-bold flex items-center justify-center gap-1">
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
    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
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
          <div className="text-[8px] font-bold text-emerald-400 tracking-widest">FINAL</div>
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
        <div className="font-mono font-black text-xl text-emerald-400 tabular-nums">
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

function LiveMatchTicker({ match, animSec }: { match: VirtualMatch; animSec: number }) {
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
    <div className="mt-3 rounded-xl border border-primary/40 bg-background/50 overflow-hidden shadow-gold">
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
              <span className="ml-2 text-[9px] font-bold text-emerald-400 tracking-widest align-middle">
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
