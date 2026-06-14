import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal as MedalIcon } from "lucide-react";
import { loadStandings, type LbRow } from "@/lib/leaderboard";
import { supabase } from "@/integrations/supabase/client";
import leaderboardHeaderAsset from "@/assets/leaderboard-header.png.asset.json";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Lomita Shooters League" },
      { name: "description", content: "See the top shooters and top gangs ranked by total score, season points, wins, and tokens won across the Lomita Shooters League." },
      { property: "og:title", content: "LSL Leaderboard — Top Shooters & Gangs" },
      { property: "og:description", content: "Top shooters and gangs ranked by total score, season points, wins, and tokens won." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/leaderboard" },
    ],
    links: [{ rel: "canonical", href: "https://lslonlinebetting.lovable.app/leaderboard" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "LSL Leaderboard",
        description: "Top shooters and gangs in the Lomita Shooters League.",
        url: "https://lslonlinebetting.lovable.app/leaderboard",
      }),
    }],
  }),
  component: Page,
});

function Medal({ i }: { i: number }) {
  const tiers = ["from-amber-300 to-yellow-600", "from-slate-200 to-slate-400", "from-amber-600 to-orange-800"];
  const medalColors = ["text-yellow-300", "text-slate-200", "text-amber-600"];
  if (i < 3) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-grid place-items-center h-8 w-8 rounded-lg bg-gradient-to-b ${tiers[i]} text-black font-black text-sm shadow-[0_0_14px_-2px_rgba(212,175,55,0.6)] border border-white/30`}>
          {i + 1}
        </span>
        <MedalIcon className={`h-5 w-5 ${medalColors[i]} drop-shadow-[0_0_6px_rgba(212,175,55,0.6)]`} />
      </span>
    );
  }
  return <span className="text-sm font-bold text-muted-foreground tabular-nums">{i + 1}</span>;
}

function Page() {
  const [shooters, setShooters] = useState<LbRow[]>([]);
  const [gangs, setGangs] = useState<LbRow[]>([]);
  const [headerUrl, setHeaderUrl] = useState<string | null>(leaderboardHeaderAsset.url);

  useEffect(() => {
    const run = async () => {
      const { gangs, shooters } = await loadStandings();
      setGangs(gangs);
      setShooters(shooters);
    };
    run();
    const ch = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard_overrides" }, run)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, run)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () =>
        supabase.from("app_settings").select("leaderboard_header_url").eq("id", 1).maybeSingle().then(({ data }) => setHeaderUrl((data as any)?.leaderboard_header_url || leaderboardHeaderAsset.url)),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.from("app_settings").select("leaderboard_header_url").eq("id", 1).maybeSingle();
        if (active && !error) setHeaderUrl((data as any)?.leaderboard_header_url || leaderboardHeaderAsset.url);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, []);

  return (
    <Layout>
      <div className="container py-8 max-w-5xl">
        {headerUrl ? (
          <div className="relative mb-6 rounded-2xl overflow-hidden border-2 border-amber-400/60 shadow-[0_0_40px_-10px_rgba(212,175,55,0.55)]">
            <img src={headerUrl} alt="Lomita Shooters League Leaderboard" className="w-full h-auto block" />
          </div>
        ) : (
          <div className="relative mb-6 rounded-2xl overflow-hidden bg-black/20 backdrop-blur-[2px] border-2 border-amber-400/60 shadow-[0_0_40px_-10px_rgba(212,175,55,0.55)]">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent" />
            <div className="relative flex items-center gap-3 px-5 py-5">
              <span className="grid place-items-center h-12 w-12 rounded-xl border border-amber-400/40 bg-black/40 shadow-[0_0_20px_-4px_rgba(212,175,55,0.6)]">
                <Trophy className="h-6 w-6 text-amber-300" />
              </span>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight gradient-gold-text drop-shadow-[0_2px_8px_rgba(212,175,55,0.3)]">LEADERBOARD</h1>
            </div>
          </div>
        )}

        <Tabs defaultValue="gangs">
          <TabsList className="bg-black/25 backdrop-blur-[2px] border border-amber-400/40">
            <TabsTrigger value="gangs">Top Gangs / Factions</TabsTrigger>
            <TabsTrigger value="shooters">Top Shooters</TabsTrigger>
          </TabsList>

          <TabsContent value="gangs" className="mt-4">
            <Board rows={gangs} firstCol="Gang / Faction" secondCol="Top Player" pick={(g) => g.top_player || "—"} emptyText="No data yet." />
          </TabsContent>

          <TabsContent value="shooters" className="mt-4">
            <Board rows={shooters} firstCol="Gang & Faction" secondCol="Player" pick={(p) => p.name} firstPick={(p) => p.gang_faction || "—"} emptyText="No shooters yet." />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function Board({
  rows, firstCol, secondCol, pick, firstPick, emptyText,
}: {
  rows: LbRow[];
  firstCol: string;
  secondCol: string;
  pick: (r: LbRow) => string;
  firstPick?: (r: LbRow) => string;
  emptyText: string;
}) {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-black/15 backdrop-blur-[2px] border-2 border-amber-400/55 shadow-[0_0_40px_-12px_rgba(212,175,55,0.5)]">
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-amber-200/80 border-b border-amber-400/30 bg-black/20">
              <Th>Rank</Th><Th>{firstCol}</Th><Th>{secondCol}</Th>
              <Th right>TS</Th><Th right>W</Th><Th right>L</Th><Th right>D</Th><Th right>P</Th><Th right>PTS</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{emptyText}</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.name} className="border-b border-amber-400/10 hover:bg-amber-400/10 transition-colors">
                <Td><Medal i={i} /></Td>
                <Td>{firstPick ? <span className="font-bold text-primary/90">{firstPick(r)}</span> : <span className="font-bold">{pick(r)}</span>}</Td>
                <Td><span className={firstPick ? "font-bold" : "text-muted-foreground"}>{firstPick ? pick(r) : (r.top_player || "—")}</span></Td>
                <Td right><Pill tone="amber">{r.TS}</Pill></Td>
                <Td right><span className="text-emerald-400 font-bold">{r.W}</span></Td>
                <Td right><span className="text-destructive font-bold">{r.L}</span></Td>
                <Td right><span className="text-amber-400 font-bold">{r.D}</span></Td>
                <Td right><span className="text-muted-foreground">{r.P}</span></Td>
                <Td right><Pill tone="emerald">{r.PTS}</Pill></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "amber" | "emerald" }) {
  const cls = tone === "amber"
    ? "border-amber-400/40 text-amber-200 bg-amber-400/10"
    : "border-emerald-400/40 text-emerald-300 bg-emerald-400/10";
  return <span className={`inline-grid place-items-center min-w-[40px] rounded-md border px-2 py-1 font-black tabular-nums ${cls}`}>{children}</span>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) { return <th className={`px-4 py-3 ${right ? "text-right" : ""}`}>{children}</th>; }
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) { return <td className={`px-4 py-3 ${right ? "text-right" : ""}`}>{children}</td>; }
