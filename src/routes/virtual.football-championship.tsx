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
import { ArenaHeader } from "./virtual.championship";

// Football Championship — same engine as virtual.championship but filters
// tournaments by kind='championship_football'. Auto-restart is honored by
// championship_tick on the server.

export const Route = createFileRoute("/virtual/football-championship")({
  head: () => ({
    meta: [
      { title: "Championship E-Football — 16-team Football Cup | ECB" },
      { name: "description", content: "16-team virtual football knockout cup. Auto-restarts a new tournament as soon as one ends." },
    ],
  }),
  component: FootballChampPage,
  errorComponent: ({ error }) => <Layout><div className="container py-12 text-center text-destructive">{error.message}</div></Layout>,
  notFoundComponent: () => <Layout><div className="container py-12 text-center text-muted-foreground">Not found.</div></Layout>,
});

type Tournament = {
  id: string; name: string | null; starts_at: string | null; status: string | null;
  current_stage: string | null; next_stage_at: string | null; team_ids: string[] | null;
  champion_team_id: string | null;
  booking_closes_at: string | null; stage_live_ends_at: string | null;
};

function FootballChampPage() {
  const [enabled, setEnabled] = useState(true);
  const [active, setActive] = useState<Tournament | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = async () => {
      const sb = supabase as any;
      try { await sb.rpc("championship_tick"); } catch { /* noop */ }
      const { data: s } = await sb.from("app_settings").select("virtual_championship_football_enabled").eq("id", 1).maybeSingle();
      setEnabled(!!s?.virtual_championship_football_enabled);
      const { data: t } = await sb
        .from("tournaments")
        .select("id,name,starts_at,status,current_stage,next_stage_at,team_ids,champion_team_id,booking_closes_at,stage_live_ends_at")
        .eq("kind", "championship_football")
        .in("status", ["scheduled", "booking", "live", "completed"])
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setActive((t ?? null) as Tournament | null);
    };
    load();
    const t = setInterval(load, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, []);

  const { targetAt, label } = pickFbTarget(active);
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
            tag="Championship E-Football"
            title="Football Knockout Cup"
            description="16 football teams. Round of 16 → Quarters → Semis → Final. Auto-restarts a new cup as soon as one crowns its champion."
            accent="from-emerald-500/40 via-teal-600/10"
            statusLabel={!enabled ? "Closed by admin" : !active ? "Waiting" : active.status === "scheduled" ? "Scheduled" : active.status === "booking" ? "Booking open" : active.status === "live" ? "Live" : "Completed"}
            statusTone={!enabled ? "closed" : active?.status === "live" ? "live" : active?.status === "completed" ? "done" : "open"}
            nextAt={active?.starts_at ?? null}
            countdown={active && active.status !== "scheduled" ? { mm, ss, label } : null}
          />

          {!enabled ? (
            <Card className="glass p-10 text-center text-muted-foreground border-primary/30">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">Championship E-Football is currently closed.</p>
            </Card>
          ) : !active ? (
            <Card className="glass p-10 text-center text-muted-foreground border-primary/30">
              <Sparkles className="h-10 w-10 mx-auto mb-3 text-primary/50" />
              <p className="font-semibold">No football cup scheduled right now.</p>
              <p className="text-xs mt-2">Admins can schedule one from the admin panel, or the previous cup's auto-restart will spawn a new one shortly.</p>
            </Card>
          ) : active.status === "scheduled" ? (
            <Card className="glass p-8 border-primary/30 text-center">
              <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-300 mb-2">Next cup kicks off in</div>
              <div className="text-6xl sm:text-7xl font-black gradient-gold-text tabular-nums leading-none">{mm}:{ss}</div>
              <div className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" /> {active.starts_at ? new Date(active.starts_at).toLocaleString() : ""}
              </div>
            </Card>
          ) : active.status === "completed" ? (
            <Card className="glass p-6 border-primary/30 space-y-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-emerald-300 mb-2">
                  <Trophy className="h-5 w-5" />
                  <span className="font-black uppercase tracking-widest">Champion crowned — next cup drafting</span>
                </div>
                <div className="font-display text-2xl font-black">{active.name}</div>
              </div>
              <ChampionshipLiveFeed tournamentId={active.id} sport="football" currentStage={active.current_stage} />
              <BracketBoard tournamentId={active.id} currentStage={active.current_stage} />
            </Card>
          ) : (
            <Card className="glass p-6 border-primary/30 space-y-4">
              <div className="text-center">
                <div className="font-display text-2xl font-black">{active.name ?? "Football Cup"}</div>
                <p className="text-xs text-muted-foreground mt-1">Current stage: {active.current_stage ?? "R16"}</p>
              </div>
              <ChampionshipLiveFeed tournamentId={active.id} sport="football" currentStage={active.current_stage} />
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

function pickFbTarget(active: Tournament | null): { targetAt: number | null; label: string } {
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