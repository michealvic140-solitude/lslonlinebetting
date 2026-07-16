import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { MatchCardLive } from "@/components/MatchCardLive";
import { HomeBannerSlider } from "@/components/HomeBannerSlider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchMatches, type MatchRow } from "@/lib/queries";
import { Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/matches")({
  head: () => ({
    meta: [
      { title: "All Matches — E-Football Competition Bet" },
      { name: "description", content: "Browse every upcoming, live, and finished ECB match with real-time odds and quick-pick wagering." },
      { property: "og:title", content: "All Matches — E-Football Competition Bet" },
      { property: "og:description", content: "Upcoming, live, and finished ECB matches with real-time odds." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/matches" },
    ],
    links: [{ rel: "canonical", href: "https://lslonlinebetting.lovable.app/matches" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "ECB Matches",
        description: "All matches in the E-Football Competition Bet.",
        url: "https://lslonlinebetting.lovable.app/matches",
      }),
    }],
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  useEffect(() => {
    fetchMatches().then(setMatches);
    const ch = supabase.channel("all-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => fetchMatches().then(setMatches))
      .on("postgres_changes", { event: "*", schema: "public", table: "odds" }, () => fetchMatches().then(setMatches))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const groups = {
    live: matches.filter((m) => m.status === "live"),
    upcoming: matches.filter((m) => m.status === "scheduled"),
    ended: matches.filter((m) => m.status === "ended"),
  };

  return (
    <Layout>
      <section className="container mt-4">
        <HomeBannerSlider embedded placement="matches" />
      </section>
      <div className="container py-8 sm:py-10">
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-background via-background to-primary/5 p-5 sm:p-6 mb-6">
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-gold opacity-70" />
          <div className="relative flex items-start gap-3 sm:gap-4">
            <div className="shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-background/40 border border-primary/40 backdrop-blur grid place-items-center text-primary shadow-inner">
              <Crosshair className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[10px] uppercase tracking-[0.35em] text-primary/80 font-black">The Arena</div>
              <h1 className="font-display text-3xl sm:text-4xl font-black gradient-gold-text leading-tight">All Matches</h1>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Every live, upcoming, and finished fixture — real-time odds, quick-pick markets, and instant staking.
              </p>
              <div className="flex items-center gap-2 pt-2 text-[10px] uppercase tracking-widest">
                <span className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-2 py-0.5 font-black">● Live {groups.live.length}</span>
                <span className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 px-2 py-0.5 font-black">Upcoming {groups.upcoming.length}</span>
                <span className="rounded-md border border-muted/40 bg-muted/20 text-muted-foreground px-2 py-0.5 font-black">Ended {groups.ended.length}</span>
              </div>
            </div>
          </div>
        </div>
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="live">Live ({groups.live.length})</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming ({groups.upcoming.length})</TabsTrigger>
            <TabsTrigger value="ended">Ended ({groups.ended.length})</TabsTrigger>
          </TabsList>
          {(["live", "upcoming", "ended"] as const).map((k) => (
            <TabsContent key={k} value={k} className="mt-4">
              {groups[k].length === 0 ? (
                <p className="text-muted-foreground text-sm">No matches in this section.</p>
              ) : (
                <div className="space-y-2 max-w-3xl">
                  {groups[k].map((m) => <MatchCardLive key={m.id} match={m} variant="row" />)}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}
