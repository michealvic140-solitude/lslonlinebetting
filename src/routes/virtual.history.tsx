import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";
import { ArrowLeft, Coins, Trophy, History as HistoryIcon } from "lucide-react";

export const Route = createFileRoute("/virtual/history")({
  head: () => ({
    meta: [
      { title: "Virtual Gangs · Rounds History | LSL" },
      { name: "description", content: "All resolved Virtual Gangs rounds with outcomes and payouts." },
    ],
  }),
  component: HistoryPage,
});

type Row = {
  id: string; name: string; status: string; start_time: string; settled_at: string | null;
  home_score: number; away_score: number; virtual_first_blood_team_id: string | null;
  home_team: { name: string; logo_url: string | null } | null;
  away_team: { name: string; logo_url: string | null } | null;
};

function HistoryPage() {
  const [rounds, setRounds] = useState<Row[]>([]);
  const [payouts, setPayouts] = useState<Record<string, { bets: number; total_payout: number; winners: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: rs } = await supabase.from("matches")
        .select("id,name,status,start_time,settled_at,home_score,away_score,virtual_first_blood_team_id,home_team:teams!home_team_id(name,logo_url),away_team:teams!away_team_id(name,logo_url)")
        .eq("is_virtual", true).eq("status", "ended").order("settled_at", { ascending: false }).limit(100);
      const rows = (rs ?? []) as unknown as Row[];
      setRounds(rows);
      if (rows.length) {
        const ids = rows.map((r) => r.id);
        const { data: bs } = await supabase.from("bet_selections")
          .select("match_id,bet:bets!bet_id(status,potential_payout)").in("match_id", ids);
        const agg: Record<string, { bets: number; total_payout: number; winners: number }> = {};
        (bs ?? []).forEach((row: any) => {
          const k = row.match_id;
          if (!agg[k]) agg[k] = { bets: 0, total_payout: 0, winners: 0 };
          agg[k].bets++;
          if (row.bet?.status === "won") { agg[k].winners++; agg[k].total_payout += Number(row.bet.potential_payout || 0); }
        });
        setPayouts(agg);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <Layout>
      <PageShell tone="default">
        <div className="container py-6 sm:py-10 space-y-6">
          <div className="flex items-center justify-between">
            <Link to="/virtual"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-[10px] uppercase tracking-[0.3em] text-primary">
              <HistoryIcon className="h-3.5 w-3.5" /> Rounds history
            </div>
            <div className="w-12" />
          </div>
          <header className="text-center">
            <h1 className="text-3xl sm:text-4xl font-black gradient-gold-text">Virtual Gangs · Results</h1>
            <p className="text-muted-foreground mt-2 text-sm">Every settled round, outcome, and total payout credited to winners.</p>
          </header>

          {loading ? (
            <Card className="glass p-8 text-center text-muted-foreground">Loading…</Card>
          ) : rounds.length === 0 ? (
            <Card className="glass p-8 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No resolved rounds yet.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {rounds.map((r) => {
                const p = payouts[r.id] ?? { bets: 0, total_payout: 0, winners: 0 };
                const fb = r.virtual_first_blood_team_id;
                const fbName = fb ? (fb === (r as any).home_team?.id ? r.home_team?.name : r.away_team?.name) : null;
                return (
                  <Card key={r.id} className="glass p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <TeamLogo name={r.home_team?.name ?? ""} url={r.home_team?.logo_url ?? null} size={36} rounded="full" />
                        <div className="min-w-0">
                          <div className="font-black text-sm truncate">{r.home_team?.name}</div>
                          <div className="text-[10px] text-muted-foreground">Home</div>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="font-mono font-black text-2xl text-primary tabular-nums">{r.home_score}-{r.away_score}</div>
                        <Badge variant="outline" className="bg-emerald-500/15 border-emerald-500/40 text-emerald-400 text-[9px]">SETTLED</Badge>
                      </div>
                      <div className="flex items-center gap-2 min-w-0 flex-1 flex-row-reverse text-right">
                        <TeamLogo name={r.away_team?.name ?? ""} url={r.away_team?.logo_url ?? null} size={36} rounded="full" />
                        <div className="min-w-0">
                          <div className="font-black text-sm truncate">{r.away_team?.name}</div>
                          <div className="text-[10px] text-muted-foreground">Away</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <Stat label="Settled" value={r.settled_at ? new Date(r.settled_at).toLocaleString() : "—"} />
                      {fbName && <Stat label="First blood" value={fbName} />}
                      <Stat label="Bets placed" value={p.bets.toString()} />
                      <Stat label="Winners paid" value={`${p.winners} · ${p.total_payout.toLocaleString()}`} icon={<Coins className="h-3 w-3 text-accent" />} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </PageShell>
    </Layout>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-bold text-xs flex items-center gap-1 truncate">{icon}{value}</div>
    </div>
  );
}
