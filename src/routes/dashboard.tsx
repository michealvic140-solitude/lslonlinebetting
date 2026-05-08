import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket as TicketIcon, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — LSL" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, profile } = useAuth();
  const [bets, setBets] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    const load = () => supabase.from("bets")
      .select("*, bet_selections(*, matches:match_id(name))")
      .eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setBets(data ?? []));
    load();
    const ch = supabase.channel(`my-bets-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!user) return <Layout><div className="container mx-auto px-4 py-16 text-center"><p>Please <Link to="/login" className="text-primary underline">sign in</Link>.</p></div></Layout>;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-primary mb-6">Your Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-5"><div className="text-xs text-muted-foreground">Token Balance</div><div className="text-3xl font-bold text-primary">{profile?.token_balance.toLocaleString() ?? 0}</div></Card>
          <Card className="p-5"><div className="text-xs text-muted-foreground">Active Bets</div><div className="text-3xl font-bold">{bets.filter(b => b.status === 'open').length}</div></Card>
          <Card className="p-5"><div className="text-xs text-muted-foreground">Total Bets</div><div className="text-3xl font-bold">{bets.length}</div></Card>
        </div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><TicketIcon className="h-5 w-5 text-primary" />My Bet Tickets</h2>
        <div className="space-y-3">
          {bets.length === 0 && <p className="text-muted-foreground text-sm">No bets yet.</p>}
          {bets.map((b) => (
            <Link key={b.id} to="/ticket/$id" params={{ id: b.id }}>
              <Card className="p-4 hover:border-primary/60 transition group">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-primary">{b.tracking_id}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">· {b.booking_code}</span>
                    </div>
                    <div className="font-bold mt-1">{b.bet_selections?.length ?? 0} selection(s) · stake {b.stake.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {(b.bet_selections ?? []).map((s: any) => s.matches?.name || s.selection_label).join(" · ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={
                      b.status === 'won' ? 'border-emerald-500/50 text-emerald-300' :
                      b.status === 'lost' ? 'border-destructive/50 text-destructive' :
                      b.status === 'suspended' ? 'border-amber-500/50 text-amber-300' :
                      'border-primary/50 text-primary'
                    }>{b.status.toUpperCase()}</Badge>
                    <div className="text-xs text-muted-foreground mt-1">Payout {b.potential_payout.toLocaleString()}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
