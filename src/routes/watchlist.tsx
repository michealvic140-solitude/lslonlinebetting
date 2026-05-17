import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, X } from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/watchlist")({
  head: () => ({ meta: [{ title: "Watchlist — LSL" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: WatchlistPage,
});

function WatchlistPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data: rows } = await supabase.from("watchlist").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const out: any[] = [];
    for (const r of rows ?? []) {
      if (r.entity_type === "match") {
        const { data: m } = await supabase.from("matches").select("id,name,location,status,start_time,home_team_id,away_team_id,home_score,away_score").eq("id", r.entity_id).maybeSingle();
        if (m) out.push({ ...r, match: m });
      } else if (r.entity_type === "team") {
        const { data: t } = await supabase.from("teams").select("id,name,logo_url,gang_type").eq("id", r.entity_id).maybeSingle();
        if (t) out.push({ ...r, team: t });
      } else if (r.entity_type === "player") {
        const { data: p } = await supabase.from("players").select("id,name,avatar_url,position,team_id").eq("id", r.entity_id).maybeSingle();
        if (p) out.push({ ...r, player: p });
      }
    }
    setItems(out);
    setLoading(false);
  }
  useEffect(() => { load(); }, [user?.id]);

  async function remove(id: string) {
    const { error } = await supabase.from("watchlist").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((p) => p.filter((x) => x.id !== id));
  }

  const matches = items.filter((i) => i.entity_type === "match");
  const teams = items.filter((i) => i.entity_type === "team");
  const players = items.filter((i) => i.entity_type === "player");

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Star className="h-6 w-6 text-amber-400 fill-amber-400" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-wide">My Watchlist</h1>
            <p className="text-xs text-muted-foreground">Matches, teams, and players you're tracking</p>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <Card className="p-10 text-center backdrop-blur-xl bg-card/60">
            <Star className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-bold">Nothing in your watchlist yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap the ★ on any match, team, or player to start tracking.</p>
            <Link to="/matches"><Button className="mt-4">Browse matches</Button></Link>
          </Card>
        )}

        {matches.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">Matches ({matches.length})</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {matches.map((i) => (
                <Card key={i.id} className="p-4 backdrop-blur-xl bg-card/60 border-primary/20">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    <span className="truncate">{i.match.name}</span>
                    <button onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">{i.match.status}</Badge>
                    {i.match.location && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="h-3 w-3" />{i.match.location}</span>}
                  </div>
                  {i.match.status === "scheduled" && (
                    <div className="text-xs text-center mt-2 text-muted-foreground">Starts in <Countdown target={i.match.start_time} /></div>
                  )}
                  {i.match.status !== "scheduled" && (
                    <div className="text-lg font-bold text-center mt-2 gradient-gold-text">{i.match.home_score} - {i.match.away_score}</div>
                  )}
                  <Link to="/matches/$matchId" params={{ matchId: i.match.id }}><Button size="sm" variant="outline" className="w-full mt-3">View match</Button></Link>
                </Card>
              ))}
            </div>
          </section>
        )}

        {teams.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">Teams ({teams.length})</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {teams.map((i) => (
                <Card key={i.id} className="p-4 backdrop-blur-xl bg-card/60 border-primary/20 text-center relative">
                  <button onClick={() => remove(i.id)} className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  {i.team.logo_url && <img src={i.team.logo_url} alt={i.team.name} className="h-12 w-12 mx-auto rounded-full mb-2 object-cover" />}
                  <div className="font-bold text-sm truncate">{i.team.name}</div>
                  {i.team.gang_type && <Badge variant="outline" className="text-[10px] mt-1">{i.team.gang_type}</Badge>}
                </Card>
              ))}
            </div>
          </section>
        )}

        {players.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">Players ({players.length})</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {players.map((i) => (
                <Card key={i.id} className="p-4 backdrop-blur-xl bg-card/60 border-primary/20 text-center relative">
                  <button onClick={() => remove(i.id)} className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  {i.player.avatar_url && <img src={i.player.avatar_url} alt={i.player.name} className="h-12 w-12 mx-auto rounded-full mb-2 object-cover" />}
                  <div className="font-bold text-sm truncate">{i.player.name}</div>
                  {i.player.position && <Badge variant="outline" className="text-[10px] mt-1">{i.player.position}</Badge>}
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
