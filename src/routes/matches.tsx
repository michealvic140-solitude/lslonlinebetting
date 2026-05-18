import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { MatchCardLive } from "@/components/MatchCardLive";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchMatches, type MatchRow } from "@/lib/queries";
import { Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/matches")({
  head: () => ({
    meta: [
      { title: "All Matches — Lomita Shooters League" },
      { name: "description", content: "Browse every upcoming, live, and finished LSL match with real-time odds and quick-pick wagering." },
      { property: "og:title", content: "All Matches — Lomita Shooters League" },
      { property: "og:description", content: "Upcoming, live, and finished LSL matches with real-time odds." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/matches" },
    ],
    links: [{ rel: "canonical", href: "https://lslonlinebetting.lovable.app/matches" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "LSL Matches",
        description: "All matches in the Lomita Shooters League.",
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
      <div className="container py-10">
        <div className="flex items-center gap-2 mb-6">
          <Crosshair className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold gradient-gold-text">All Matches</h1>
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
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groups[k].map((m) => <MatchCardLive key={m.id} match={m} />)}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}
