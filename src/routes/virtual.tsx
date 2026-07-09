import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Crosshair,
  History,
  ChevronLeft,
  ChevronRight,
  Lock,
  Trophy,
  Target,
  Radio,
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
type Phase = "idle" | "pre" | "live";

export const Route = createFileRoute("/virtual")({
  head: () => ({
    meta: [
      { title: "Virtual Gang League — Instant Shootouts | LSL" },
      {
        name: "description",
        content:
          "Gang vs gang instant shootout rounds. Watch the live shootout feed, line-ups, and previous scores — auto-played every round.",
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
  const [round, setRound] = useState<VirtualMatch[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [recent, setRecent] = useState<VirtualMatch[]>([]);
  const [cycle, setCycle] = useState<CycleState>({
    running: false,
    animSec: 40,
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
            .limit(30),
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

      // A live shootout ALWAYS wins over an upcoming round. Previously the
      // "newest batch by lock time" could be the *next* scheduled round, which
      // silently hid the shootout that was actively playing.
      const liveBatch = newestVirtualBatch((liveRows ?? []) as unknown as VirtualMatch[]);
      const upBatch = newestVirtualBatch((upRows ?? []) as unknown as VirtualMatch[]);
      if (liveBatch.length) {
        setRound(liveBatch.map((m) => ({ ...m, status: "live" })));
        setPhase("live");
      } else if (upBatch.length) {
        setRound(upBatch);
        setPhase("pre");
      } else {
        setRound([]);
        setPhase("idle");
      }
      setRecent((recRows ?? []) as unknown as VirtualMatch[]);
      if (cfg) {
        const s = cfg as VirtualSettings;
        setCycle({
          running: !!s.virtual_cycle_running,
          animSec: Number(s.virtual_animation_seconds ?? 40),
          durSec: Number(s.virtual_round_duration_seconds ?? 120),
          perRound: Number(s.virtual_matches_per_round ?? 5),
          maxScore: Number(s.virtual_max_score ?? 8),
        });
      }
    };
    load();
    const t = setInterval(load, 1000);
    const ping = setInterval(() => {
      supabase.rpc("virtual_tick").then(() => {}, () => {});
    }, 8000);
    supabase.rpc("virtual_tick").then(() => {}, () => {});
    const ch = supabase
      .channel("virtual-rounds-v3")
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

  const featured = round[0];

  return (
    <Layout>
      <div className="virtual-page min-h-[calc(100vh-4rem)]">
        <div className="container py-4 sm:py-6 space-y-4">
          <RoundHeader featured={featured} phase={phase} round={round} />

          {!featured ? (
            <Card className="virtual-panel p-10 text-center text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-semibold">
                {cycle.running ? "Spinning up the next shootout…" : "No virtual round active right now."}
              </p>
              <p className="text-xs mt-1">
                {cycle.running ? "The next round appears within seconds." : "The cycle will start shortly."}
              </p>
            </Card>
          ) : (
            <>
              <ShootoutStage featured={featured} phase={phase} animSec={cycle.animSec} recent={recent} />
              <ScoresTable matches={round} phase={phase} />
              <MarketBoard matches={round} phase={phase} />
            </>
          )}

          <RecentResults recent={recent} />
        </div>
      </div>
    </Layout>
  );
}

/* ============================ HEADER ============================ */

function statusLabel(phase: Phase, featured?: VirtualMatch) {
  if (!featured) return "IDLE";
  if (phase === "live") return "MATCH";
  return "PRE MATCH";
}

function roundCode(featured?: VirtualMatch) {
  const id = featured?.virtual_round_batch_id ?? featured?.id ?? "00000";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (10000 + (h % 89999)).toString();
}

function RoundHeader({ featured, phase, round }: { featured?: VirtualMatch; phase: Phase; round: VirtualMatch[] }) {
  const label = statusLabel(phase, featured);
  const tone =
    label === "MATCH"
      ? "bg-destructive/20 border-destructive/50 text-destructive"
      : "bg-amber-500/15 border-amber-500/40 text-amber-400";
  return (
    <Card className="virtual-panel px-4 py-3">
      <div className="flex items-center justify-between">
        <Link to="/virtual" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="text-center">
          <div className="text-sm sm:text-base font-black tracking-wide gradient-gold-text">
            LSL Virtual Gang League
          </div>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground font-mono">
              {roundCode(featured)} / Round {round.length} matches
            </span>
            <Badge variant="outline" className={`text-[9px] font-black tracking-widest ${tone}`}>
              {label}
            </Badge>
          </div>
        </div>
        <Link to="/virtual/history" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[10px] uppercase tracking-widest">
          <History className="h-3.5 w-3.5" /> Rounds
        </Link>
      </div>
    </Card>
  );
}

/* ============================ STAGE ============================ */

function ShootoutStage({
  featured,
  phase,
  animSec,
  recent,
}: {
  featured: VirtualMatch;
  phase: Phase;
  animSec: number;
  recent: VirtualMatch[];
}) {
  const home = featured.home_team?.name ?? "Gang A";
  const away = featured.away_team?.name ?? "Gang B";
  const cd = useCountdown(featured.lock_time);
  const live = phase === "live";
  const { h, a } = useLiveScore(featured, animSec);

  return (
    <div className="space-y-3">
      {/* Featured teams strip */}
      <Card className="virtual-panel px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_#ff4d4d]" />
            <TeamLogo name={home} url={featured.home_team?.logo_url ?? null} size={24} rounded="full" />
            <span className="text-xs font-black truncate">{home}</span>
          </div>
          <div className="font-mono font-black text-lg tabular-nums text-primary shrink-0">
            {live ? `${h}:${a}` : "—"}
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-row-reverse text-right">
            <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_#4dd2ff]" />
            <TeamLogo name={away} url={featured.away_team?.logo_url ?? null} size={24} rounded="full" />
            <span className="text-xs font-black truncate">{away}</span>
          </div>
        </div>
      </Card>

      {/* Center arena */}
      {live ? (
        <LiveMatchTicker match={featured} animSec={animSec} />
      ) : (
        <Card className="virtual-panel virtual-arena grid place-items-center py-10">
          <div className="relative grid place-items-center">
            <div className="h-40 w-40 rounded-full border border-primary/25 grid place-items-center bg-[radial-gradient(circle,rgba(0,0,0,0.6),transparent_70%)]">
              <div className="h-24 w-24 rounded-full border border-primary/40 grid place-items-center animate-pulse">
                <Crosshair className="h-9 w-9 text-primary" />
              </div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <div className="text-[11px] font-black tracking-[0.3em] text-primary">▼ PLACE YOUR BETS ▼</div>
            <div className="text-xs text-muted-foreground mt-1">Gang vs gang shootout begins at lock</div>
          </div>
        </Card>
      )}

      {/* Countdown (left) + Previous scores (right) */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="virtual-panel p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80 mb-1">
            {live ? "Shootout live" : "Round locks in"}
          </div>
          {live ? (
            <div className="flex items-center gap-2 text-destructive font-black">
              <Radio className="h-5 w-5 animate-pulse" />
              <span className="text-lg">In progress</span>
            </div>
          ) : (
            <>
              <div className="text-3xl sm:text-4xl font-black tabular-nums gradient-gold-text leading-none">
                {cd.mm}:{cd.ss}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-primary transition-all"
                  style={{ width: `${Math.min(100, 100 - (cd.secs / Math.max(1, cd.secs + 1)) * 0)}%` }}
                />
              </div>
            </>
          )}
          <div className="mt-2 text-[10px] text-muted-foreground truncate">
            {home} vs {away}
          </div>
        </Card>

        <Card className="virtual-panel p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80 mb-2">
            Previous scores
          </div>
          <div className="space-y-1.5">
            {recent.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-[11px]">
                <div className="min-w-0 leading-tight">
                  <div className="truncate">{r.home_team?.name}</div>
                  <div className="truncate text-muted-foreground">{r.away_team?.name}</div>
                </div>
                <div className="font-mono font-black text-primary tabular-nums shrink-0">
                  {r.home_score}:{r.away_score}
                </div>
              </div>
            ))}
            {recent.length === 0 && <div className="text-[11px] text-muted-foreground">No history yet.</div>}
          </div>
        </Card>
      </div>

      {/* Line ups (left) + Opposing line (right) */}
      <div className="grid grid-cols-2 gap-3">
        <LineUp title="Line ups" team={home} accent="red" />
        <LineUp title="Opposing line" team={away} accent="sky" align="right" />
      </div>
    </div>
  );
}

const ROLES = ["Ace", "Shot Caller", "Lookout", "Runner", "Enforcer", "Driver"];
const RATINGS = [9, 8, 7, 6, 5, 4];

function LineUp({
  title,
  team,
  accent,
  align,
}: {
  title: string;
  team: string;
  accent: "red" | "sky";
  align?: "right";
}) {
  const dot = accent === "red" ? "bg-red-500" : "bg-sky-400";
  return (
    <Card className="virtual-panel p-3">
      <div className={`text-[10px] font-black uppercase tracking-[0.25em] text-primary/80 mb-2 ${align === "right" ? "text-right" : ""}`}>
        {title}
      </div>
      <div className="space-y-1.5">
        {ROLES.map((role, i) => (
          <div
            key={role}
            className={`flex items-center gap-2 text-[11px] ${align === "right" ? "flex-row-reverse text-right" : ""}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dot} shrink-0`} />
            <span className="text-muted-foreground w-3 shrink-0 tabular-nums">{i + 1}</span>
            <span className="truncate flex-1">
              <span className="font-semibold">{team}</span> {role} {i + 1}
            </span>
            <span className="font-mono font-black text-primary tabular-nums shrink-0">{RATINGS[i]}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============================ SCORES TABLE ============================ */

function ScoresTable({ matches, phase }: { matches: VirtualMatch[]; phase: Phase }) {
  if (matches.length === 0) return null;
  const live = phase === "live";
  return (
    <Card className="virtual-panel p-0 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted-foreground border-b border-primary/20 bg-black/30">
        <span>Team</span>
        <span>{live ? "Score" : "FT"}</span>
      </div>
      <div className="divide-y divide-primary/10">
        {matches.map((m) => (
          <ScoreRow key={m.id} match={m} live={live} />
        ))}
      </div>
    </Card>
  );
}

function ScoreRow({ match, live }: { match: VirtualMatch; live: boolean }) {
  const { h, a } = useLiveScore(match, 40);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center px-3 py-2 gap-3">
      <div className="min-w-0 leading-tight">
        <div className="text-xs font-semibold truncate">{match.home_team?.name}</div>
        <div className="text-xs text-muted-foreground truncate">{match.away_team?.name}</div>
      </div>
      <div className="text-right font-mono font-black tabular-nums text-primary">
        {live ? (
          <div className="leading-tight">
            <div>{h}</div>
            <div>{a}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

/* ============================ MARKET BOARD (place your bets) ============================ */

function marketOrder(n: string) {
  return /match\s*winner/i.test(n)
    ? 0
    : /first\s*blood/i.test(n)
      ? 1
      : /total/i.test(n)
        ? 2
        : /correct\s*score/i.test(n)
          ? 3
          : 4;
}

function MarketBoard({ matches, phase }: { matches: VirtualMatch[]; phase: Phase }) {
  const { add, remove, selections } = useBetSlip();
  const locked = phase === "live";

  const marketNames = useMemo(() => {
    const set = new Map<string, number>();
    matches.forEach((m) =>
      (m.markets ?? []).forEach((mk) => {
        if (/total\s*kills?/i.test(mk.name) || /correct\s*score/i.test(mk.name)) return;
        set.set(mk.name, marketOrder(mk.name));
      }),
    );
    return [...set.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  }, [matches]);

  const [idx, setIdx] = useState(0);
  const activeMarket = marketNames[Math.min(idx, Math.max(0, marketNames.length - 1))] ?? "";
  const isPicked = (oddId: string) => selections.some((s) => s.odd_id === oddId);

  function pick(match: VirtualMatch, mk: MarketRow, o: OddRow) {
    if (locked || !mk.is_open) return;
    if (isPicked(o.id)) {
      remove(o.id);
      return;
    }
    if (selections.length > 0 && selections.some((s) => !s.is_virtual)) {
      toast.error("Your slip has non-virtual bets. Clear it before adding virtual selections.");
      return;
    }
    add({
      match_id: match.id,
      match_name: `${match.home_team?.name ?? "Gang A"} vs ${match.away_team?.name ?? "Gang B"}`,
      market_id: mk.id,
      market_name: mk.name,
      odd_id: o.id,
      selection_label: o.label,
      odds: Number(o.value),
      is_virtual: true,
      virtual_round_batch_id: match.virtual_round_batch_id ?? match.id,
    });
    // NOTE: intentionally do NOT open the bet slip here — the user keeps
    // selecting matches and opens the slip themselves when ready.
    toast.success("Added to bet slip");
  }

  if (marketNames.length === 0) return null;

  return (
    <Card className="virtual-panel p-0 overflow-hidden">
      <div className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.3em] text-primary/80 border-b border-primary/20 bg-black/30">
        Place your bets
      </div>
      {/* Market carousel selector */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-primary/15">
        <button
          onClick={() => setIdx((i) => (i - 1 + marketNames.length) % marketNames.length)}
          className="text-muted-foreground hover:text-primary p-1"
          aria-label="Previous market"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="text-sm font-black">{activeMarket}</div>
          <div className="flex items-center justify-center gap-1 mt-1">
            {marketNames.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() => setIdx((i) => (i + 1) % marketNames.length)}
          className="text-muted-foreground hover:text-primary p-1"
          aria-label="Next market"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="divide-y divide-primary/10">
        {matches.map((m) => {
          const mk = (m.markets ?? []).find((x) => x.name === activeMarket);
          if (!mk) return null;
          const odds = mk.odds.slice(0, 6);
          return (
            <div key={m.id} className="px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0 leading-tight text-[11px]">
                  <div className="font-semibold truncate">{m.home_team?.name}</div>
                  <div className="text-muted-foreground truncate">{m.away_team?.name}</div>
                </div>
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
                      onClick={() => pick(m, mk, o)}
                      className={`rounded-md py-2 text-center transition-all border ${
                        locked || !mk.is_open
                          ? "bg-secondary/20 text-muted-foreground cursor-not-allowed border-transparent"
                          : picked
                            ? "bg-primary/25 border-primary text-primary shadow-gold"
                            : "bg-emerald-600/80 border-emerald-500/40 text-white hover:bg-emerald-500"
                      }`}
                    >
                      <div className="text-[9px] uppercase tracking-wider opacity-90 truncate">{o.label}</div>
                      <div className="text-sm font-black flex items-center justify-center gap-1">
                        {(locked || !mk.is_open) && <Lock className="h-3 w-3" />}
                        {Number(o.value).toFixed(2)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ============================ RECENT RESULTS ============================ */

function RecentResults({ recent }: { recent: VirtualMatch[] }) {
  if (recent.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="h-4 w-4 text-amber-400" />
        <h2 className="text-xs font-black uppercase tracking-[0.2em]">Recent results</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
        <Link to="/virtual/history" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary">
          Full history
        </Link>
      </div>
      <Card className="virtual-panel p-0 overflow-hidden">
        <div className="divide-y divide-primary/10">
          {recent.slice(0, 8).map((m) => {
            const win =
              m.home_score > m.away_score ? "1" : m.away_score > m.home_score ? "2" : "X";
            return (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 gap-3">
                <div className="min-w-0 leading-tight text-[11px]">
                  <div className="font-semibold truncate">{m.home_team?.name}</div>
                  <div className="text-muted-foreground truncate">{m.away_team?.name}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-black text-primary tabular-nums">
                    {m.home_score}:{m.away_score}
                  </span>
                  <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400 bg-amber-500/10">
                    {win}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

/* ============================ TIME / SCORE HELPERS ============================ */

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

function newestVirtualBatch(rows: VirtualMatch[]): VirtualMatch[] {
  if (rows.length === 0) return [];
  const groups = new Map<string, VirtualMatch[]>();
  rows.forEach((row) => {
    const key = row.virtual_round_batch_id ?? row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return (
    [...groups.values()].sort((a, b) => {
      const newestA = Math.max(...a.map((m) => new Date(m.lock_time ?? m.start_time).getTime()));
      const newestB = Math.max(...b.map((m) => new Date(m.lock_time ?? m.start_time).getTime()));
      return newestB - newestA;
    })[0] ?? []
  );
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

/* ============================ LIVE SHOOTOUT ARENA ============================ */

type Fighter = { x: number; y: number; side: "h" | "a"; alive: boolean; flash: number; vx: number; vy: number };
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

      setFighters((prev) => {
        const next = prev.map((f) => {
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

      if (Math.random() < 0.55) {
        setTracers((prev) => {
          const alive = fightersRef.current.filter((f) => f.alive);
          if (alive.length < 2) return prev;
          const shooter = alive[Math.floor(Math.random() * alive.length)];
          const enemies = alive.filter((f) => f.side !== shooter.side);
          if (!enemies.length) return prev;
          const b = enemies[Math.floor(Math.random() * enemies.length)];
          const next = [...prev, { x1: shooter.x, y1: shooter.y, x2: b.x, y2: b.y, side: shooter.side, born: now }];
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
        const line = KILL_LINES[Math.abs((match.id.charCodeAt(i % match.id.length) + i * 7) % KILL_LINES.length)];
        surfaced.unshift(`${match.home_team?.name}: ${line}`);
      }
      for (let i = 0; i < fa; i++) {
        const line = KILL_LINES[Math.abs((match.id.charCodeAt((i + 5) % match.id.length) + i * 11) % KILL_LINES.length)];
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

  return (
    <Card className="virtual-panel overflow-hidden shadow-gold p-0">
      <div className="relative w-full aspect-[16/10] overflow-hidden bg-[#07090a]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
            radial-gradient(circle at 20% 30%, rgba(80,60,40,0.35), transparent 40%),
            radial-gradient(circle at 75% 70%, rgba(60,40,30,0.4), transparent 45%),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 22px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 22px),
            linear-gradient(180deg, #14100c 0%, #08060a 100%)`,
          }}
        />
        <div className="absolute bg-black/70 border border-white/10 rounded-sm" style={{ left: "18%", top: "18%", width: "14%", height: "22%" }} />
        <div className="absolute bg-black/70 border border-white/10 rounded-sm" style={{ left: "42%", top: "55%", width: "16%", height: "20%" }} />
        <div className="absolute bg-black/70 border border-white/10 rounded-sm" style={{ left: "68%", top: "20%", width: "12%", height: "28%" }} />
        <div className="absolute bg-black/70 border border-white/10 rounded-sm" style={{ left: "8%", top: "70%", width: "12%", height: "16%" }} />
        <div className="absolute left-1/2 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-amber-400/40 to-transparent" />

        <div className="absolute top-1 left-2 text-[9px] font-black tracking-widest text-red-400 drop-shadow">
          RED · {homeName.toUpperCase()}
        </div>
        <div className="absolute top-1 right-2 text-[9px] font-black tracking-widest text-sky-400 drop-shadow">
          {awayName.toUpperCase()} · BLUE
        </div>
        <div className="absolute bottom-1 left-2 text-[9px] font-mono text-red-300/80">ALIVE {aliveH}</div>
        <div className="absolute bottom-1 right-2 text-[9px] font-mono text-sky-300/80">ALIVE {aliveA}</div>

        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
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

        {blasts.map((b, i) => (
          <div key={`${b.born}-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
            <div className="rounded-full bg-amber-300/80 animate-ping" style={{ width: b.size, height: b.size, animationDuration: "0.75s" }} />
            <div className="absolute inset-1 rounded-full bg-orange-500/70 blur-sm" />
          </div>
        ))}

        {fighters.map((f, i) => (
          <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-linear" style={{ left: `${f.x}%`, top: `${f.y}%` }}>
            {f.alive ? (
              <div className="relative">
                <div className={`relative h-3.5 w-3.5 rounded-full border ${f.side === "h" ? "bg-red-500 border-red-200 shadow-[0_0_8px_#ff5252]" : "bg-sky-400 border-sky-100 shadow-[0_0_8px_#4dd2ff]"}`}>
                  <span className="absolute left-1/2 top-[-5px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-foreground/85" />
                  <span className={`absolute top-1/2 h-[2px] w-3 -translate-y-1/2 ${f.side === "h" ? "left-2 bg-red-200" : "right-2 bg-sky-100"}`} />
                </div>
                {f.flash > 0.2 && <div className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-amber-300/80 animate-ping" style={{ animationDuration: "0.6s" }} />}
              </div>
            ) : (
              <div className="text-[10px] leading-none text-muted-foreground/70">✕</div>
            )}
          </div>
        ))}

        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)" }} />
      </div>

      <div className="p-3 bg-gradient-to-r from-black/80 via-black/60 to-black/80">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-destructive font-bold flex items-center gap-1">
            <Radio className="h-3 w-3 animate-pulse" /> Live shootout
          </div>
          <div className="font-mono font-black text-2xl tabular-nums text-primary tracking-widest">
            {liveH} - {liveA}
          </div>
        </div>
        <div className="h-1 rounded-full bg-background overflow-hidden mb-2">
          <div className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-sky-400 transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="space-y-1 min-h-[56px]">
          {feed.length === 0 && <div className="text-[10px] text-muted-foreground">Gangs locking & loading…</div>}
          {feed.map((line, i) => (
            <div key={i} className="text-[11px] text-foreground/90 animate-fade-in flex items-start gap-1.5">
              <span className="text-destructive">▸</span>
              {line}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
