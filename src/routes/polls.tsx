import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Vote } from "lucide-react";

export const Route = createFileRoute("/polls")({
  head: () => ({
    meta: [
      { title: "Community Predictions & Polls | ECB" },
      { name: "description", content: "Vote on ECB community polls and predictions and see what the crowd thinks." },
    ],
  }),
  component: PollsPage,
});

function PollsPage() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [polls, setPolls] = useState<any[]>([]);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState<Record<string, number[]>>({});

  async function load() {
    const [{ data: en }, { data: ps }] = await Promise.all([
      (supabase as any).from("app_settings").select("polls_enabled").eq("id", 1).maybeSingle(),
      (supabase as any).from("polls").select("*").eq("is_active", true).order("created_at", { ascending: false }),
    ]);
    setEnabled(!!en?.polls_enabled);
    setPolls(ps ?? []);
    const { data: allVotes } = await (supabase as any).from("poll_votes").select("poll_id,user_id,selected_index");
    const c: Record<string, number[]> = {};
    const mine: Record<string, number> = {};
    (ps ?? []).forEach((p: any) => { c[p.id] = new Array((p.options || []).length).fill(0); });
    (allVotes ?? []).forEach((v: any) => {
      if (c[v.poll_id]) c[v.poll_id][v.selected_index] = (c[v.poll_id][v.selected_index] || 0) + 1;
      if (user && v.user_id === user.id) mine[v.poll_id] = v.selected_index;
    });
    setCounts(c); setVotes(mine);
  }
  useEffect(() => { load(); }, [user?.id]);

  async function vote(pollId: string, idx: number) {
    if (!user) return;
    const { error } = await (supabase as any).from("poll_votes").insert({ poll_id: pollId, user_id: user.id, selected_index: idx });
    if (error) return toast.error(error.message);
    toast.success("Vote recorded!");
    load();
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-gradient-gold grid place-items-center shadow-gold"><Vote className="h-7 w-7 text-background" /></div>
          <div>
            <h1 className="text-3xl font-extrabold gradient-gold-text">Predictions & Polls</h1>
            <p className="text-sm text-muted-foreground">Cast your vote and see what the community predicts.</p>
          </div>
        </div>
        {!enabled && <Card className="p-8 text-center text-muted-foreground">Polls are currently closed.</Card>}
        {enabled && polls.length === 0 && <Card className="p-8 text-center text-muted-foreground">No active polls right now.</Card>}
        {enabled && (
          <div className="space-y-4">
            {polls.map((p) => {
              const opts: string[] = Array.isArray(p.options) ? p.options : [];
              const myVote = votes[p.id];
              const voted = myVote !== undefined;
              const total = (counts[p.id] || []).reduce((a, b) => a + b, 0) || 0;
              return (
                <Card key={p.id} className="p-5 border-primary/20">
                  <div className="font-bold mb-3">{p.question}</div>
                  <div className="space-y-2">
                    {opts.map((o, i) => {
                      const cnt = counts[p.id]?.[i] || 0;
                      const pct = total ? Math.round((cnt / total) * 100) : 0;
                      return (
                        <button key={i} disabled={voted || !user} onClick={() => vote(p.id, i)}
                          className={`relative w-full text-left rounded-lg border p-2.5 overflow-hidden ${myVote === i ? "border-primary text-primary" : "border-border"} ${(voted || !user) ? "cursor-default" : "hover:border-primary/60"}`}>
                          {voted && <span className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${pct}%` }} />}
                          <span className="relative flex justify-between text-sm"><span>{o}</span>{voted && <span className="font-bold">{pct}%</span>}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">{total} vote{total === 1 ? "" : "s"}{!user && " · "}{!user && <Link to="/login" className="text-primary underline">sign in to vote</Link>}</div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}