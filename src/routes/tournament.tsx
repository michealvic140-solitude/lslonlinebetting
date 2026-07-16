import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Trophy, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TournamentBracket, type TMatch, type TParticipant, type Tournament } from "@/components/TournamentBracket";

export const Route = createFileRoute("/tournament")({
  head: () => ({
    meta: [
      { title: "Knockout Bracket — E-Football Competition Bet" },
      { name: "description", content: "Follow the live E-Football Competition Bet knockout bracket — every round, matchup, score and the road to the champion." },
      { property: "og:title", content: "ECB Knockout Bracket" },
      { property: "og:description", content: "Live tournament bracket — one league, no mercy, respect the game." },
    ],
  }),
  component: Page,
});

function Page() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<TParticipant[]>([]);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: t } = await (supabase as any)
      .from("tournaments").select("*")
      .order("is_featured", { ascending: false }).order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (!t) { setTournament(null); setLoading(false); return; }
    setTournament(t);
    const [{ data: ps }, { data: ms }] = await Promise.all([
      (supabase as any).from("tournament_participants").select("*").eq("tournament_id", t.id),
      (supabase as any).from("tournament_matches").select("*").eq("tournament_id", t.id).order("round").order("slot"),
    ]);
    setParticipants(ps ?? []);
    setMatches(ms ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("tournament-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const partMap = useMemo(() => Object.fromEntries(participants.map((p) => [p.id, p])), [participants]);

  return (
    <Layout>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h1 className="text-lg font-black tracking-wide gradient-gold-text">Tournament</h1>
        {tournament?.futures_match_id && (
          <Button asChild size="sm" className="btn-luxury">
            <Link to="/matches/$matchId" params={{ matchId: tournament.futures_match_id }}>
              <Coins className="h-4 w-4 mr-1" />Bet on Champion
            </Link>
          </Button>
        )}
      </div>

      <div className="min-h-[calc(100vh-140px)] w-full px-1 pb-6">
        {loading ? (
          <div className="min-h-[60vh] grid place-items-center text-muted-foreground">Loading bracket…</div>
        ) : !tournament || matches.length === 0 ? (
          <div className="min-h-[60vh] grid place-items-center text-center px-6">
            <div>
              <Trophy className="h-14 w-14 text-amber-300/60 mx-auto mb-3" />
              <div className="text-lg font-bold">No active tournament yet</div>
              <p className="text-sm text-muted-foreground mt-1">The next Knockout Bracket will appear here once an admin publishes it.</p>
            </div>
          </div>
        ) : (
          <TournamentBracket tournament={tournament} participants={partMap} matches={matches} />
        )}
      </div>
    </Layout>
  );
}