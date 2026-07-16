import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy, Clock, Radio, Sparkles } from "lucide-react";
import { BracketBoard } from "@/components/BracketBoard";
import { ChampionshipBetPanel } from "@/components/ChampionshipBetPanel";
import { ChampionshipLiveFeed } from "@/components/ChampionshipLiveFeed";

export const Route = createFileRoute("/virtual/championship")({
  head: () => ({
    meta: [
      { title: "Championship Virtual — 16-team Knockout | ECB" },
      { name: "description", content: "16-team virtual knockout tournament. Bet on champions, stage reachers, and per-match winners." },
    ],
  }),
  component: ChampionshipPage,
});

type Tournament = {
  id: string; name: string | null; starts_at: string | null; status: string | null;
  current_stage: string | null; next_stage_at: string | null; team_ids: string[] | null;
  champion_team_id: string | null;
  booking_closes_at: string | null; stage_live_ends_at: string | null;
};

function ChampionshipPage() {
  const [enabled, setEnabled] = useState(true);
  const [active, setActive] = useState<Tournament | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = async () => {
      const sb = supabase as any;
      // Heartbeat: advance the engine if a stage is due (RPC is idempotent and no-op when not due).
      try { await sb.rpc("championship_tick"); } catch { /* noop */ }
      const { data: s } = await sb.from("app_settings").select("virtual_championship_enabled").eq("id", 1).maybeSingle();
      setEnabled(!!s?.virtual_championship_enabled);
      const { data: t } = await sb
        .from("tournaments")
        .select("id,name,starts_at,status,current_stage,next_stage_at,team_ids,champion_team_id,booking_closes_at,stage_live_ends_at")
        .eq("kind", "championship_virtual")
        .in("status", ["scheduled", "booking", "live", "completed"])
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setActive((t ?? null) as Tournament | null);
    };
    load();
    const t = setInterval(load, 3_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, []);

  const { targetAt, label } = pickTarget(active);
  const cd = targetAt ? Math.max(0, Math.floor((targetAt - now) / 1000)) : null;
  const mm = cd != null ? String(Math.floor(cd / 60)).padStart(2, "0") : "--";
  const ss = cd != null ? String(cd % 60).padStart(2, "0") : "--";

  return (
    <Layout>
      <PageShell tone="default">
        <div className="container py-6 sm:py-10 space-y-6 max-w-6xl">
          <div className="flex items-center justify-start">
            <Link to="/virtual"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
          </div>

          <ArenaHeader
            tag="Championship Virtual"
            title="Knockout Tournament"
            description="16 gangs. 4 knockout rounds. Bet on champions, quarter/semi/final reachers, per-match winners, and specific stage eliminations. Auto-scheduled by the house."
            accent="from-amber-500/40 via-amber-600/10"
            statusLabel={statusBadge(enabled, active)}
            statusTone={statusTone(enabled, active)}
            nextAt={active?.starts_at ?? null}
            countdown={active && active.status !== "scheduled" ? { mm, ss, label } : null}
          />

          {!enabled ? (
            <Card className="glass p-10 text-center text-muted-foreground border-primary/30">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">Championship Virtual is currently closed.</p>
            </Card>
          ) : !active ? (
            <Card className="glass p-10 text-center text-muted-foreground border-primary/30">
              <Sparkles className="h-10 w-10 mx-auto mb-3 text-primary/50" />
              <p className="font-semibold">No championship scheduled right now.</p>
            </Card>
          ) : active.status === "scheduled" ? (
            <Card className="glass p-8 border-primary/30 text-center">
              <div className="text-[10px] uppercase tracking-[0.35em] text-amber-300 mb-2">Next tournament kicks off in</div>
              <div className="text-6xl sm:text-7xl font-black gradient-gold-text tabular-nums leading-none">{mm}:{ss}</div>
              <div className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" /> {active.starts_at ? new Date(active.starts_at).toLocaleString() : ""}
              </div>
              <div className="mt-6 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Lock your picks in: outright champion, stage reachers (Final / Semi / Quarter), per-match winners, and stage eliminations.
              </div>
            </Card>
          ) : active.status === "completed" ? (
            <Card className="glass p-6 border-primary/30 space-y-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-amber-300 mb-2">
                  <Trophy className="h-5 w-5" />
                  <span className="font-black uppercase tracking-widest">Champion crowned</span>
                </div>
                <div className="font-display text-2xl font-black">{active.name}</div>
              </div>
              <ChampionshipLiveFeed tournamentId={active.id} sport="generic" currentStage={active.current_stage} />
              <BracketBoard tournamentId={active.id} currentStage={active.current_stage} />
            </Card>
          ) : (
            <Card className="glass p-6 border-primary/30 space-y-4">
              <div className="text-center">
                <div className="font-display text-2xl font-black">{active.name ?? "Championship"}</div>
                <p className="text-xs text-muted-foreground mt-1">Current stage: {active.current_stage ?? "R16"}</p>
              </div>
              <ChampionshipLiveFeed tournamentId={active.id} sport="generic" currentStage={active.current_stage} />
              <BracketBoard tournamentId={active.id} currentStage={active.current_stage} />
            </Card>
          )}

          {active && active.status === "booking" && (active.team_ids?.length ?? 0) > 0 && (
            <ChampionshipBetPanel
              tournamentId={active.id}
              teamIds={active.team_ids ?? []}
              currentStage={active.current_stage}
              status={active.status}
            />
          )}
        </div>
      </PageShell>
    </Layout>
  );
}

function statusBadge(enabled: boolean, active: Tournament | null): string {
  if (!enabled) return "Closed by admin";
  if (!active) return "Waiting";
  if (active.status === "scheduled") return "Scheduled";
  if (active.status === "booking") return "Booking open";
  if (active.status === "live") return "Live";
  if (active.status === "completed") return "Completed";
  return "Waiting";
}
function statusTone(enabled: boolean, active: Tournament | null): "closed" | "open" | "live" | "done" {
  if (!enabled) return "closed";
  if (active?.status === "live") return "live";
  if (active?.status === "completed") return "done";
  return "open";
}

export function ArenaHeader({
  tag, title, description, accent, statusLabel, statusTone, nextAt, countdown,
}: {
  tag: string; title: string; description: string; accent: string;
  statusLabel: string; statusTone: "closed" | "open" | "live" | "done";
  nextAt: string | null; countdown: { mm: string; ss: string; label: string } | null;
}) {
  const badgeCls =
    statusTone === "live"
      ? "border-red-500/50 text-red-300 bg-red-500/15"
      : statusTone === "closed"
        ? "border-muted/50 text-muted-foreground bg-muted/20"
        : statusTone === "done"
          ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
          : "border-amber-500/40 text-amber-300 bg-amber-500/10";
  return (
    <Card className="relative overflow-hidden glass border-primary/30 p-7">
      <div className={`pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br ${accent} to-transparent blur-3xl opacity-70`} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-gold opacity-70" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="h-14 w-14 rounded-2xl bg-background/40 border border-primary/30 backdrop-blur-xl grid place-items-center text-primary shadow-inner">
          <Trophy className="h-8 w-8" />
        </div>
        <Badge variant="outline" className={`uppercase tracking-widest text-[10px] flex items-center gap-1 ${badgeCls}`}>
          {statusTone === "live" && <Radio className="h-3 w-3 animate-pulse" />}
          {statusLabel}
        </Badge>
      </div>
      <div className="relative mt-6 space-y-2">
        <div className="text-[10px] uppercase tracking-[0.35em] text-primary/80 font-black">{tag}</div>
        <h1 className="font-display text-3xl sm:text-4xl font-black leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        {countdown ? (
          <div className="pt-2 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{countdown.label}</span>
            <span className="text-2xl font-black tabular-nums gradient-gold-text leading-none">{countdown.mm}:{countdown.ss}</span>
          </div>
        ) : nextAt ? (
          <div className="pt-1 text-[11px] uppercase tracking-[0.25em] text-amber-300 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Next: {new Date(nextAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function pickTarget(active: Tournament | null): { targetAt: number | null; label: string } {
  if (!active) return { targetAt: null, label: "" };
  if (active.status === "booking" && active.booking_closes_at) {
    return { targetAt: new Date(active.booking_closes_at).getTime(), label: "Booking closes in" };
  }
  if (active.status === "live" && active.stage_live_ends_at) {
    return { targetAt: new Date(active.stage_live_ends_at).getTime(), label: "Stage ends in" };
  }
  if (active.status === "live" && active.next_stage_at) {
    return { targetAt: new Date(active.next_stage_at).getTime(), label: "Next stage in" };
  }
  if (active.starts_at) {
    return { targetAt: new Date(active.starts_at).getTime(), label: "Starts in" };
  }
  return { targetAt: null, label: "" };
}