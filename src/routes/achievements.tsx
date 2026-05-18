import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Trophy, ArrowLeft, Sparkles, Award } from "lucide-react";

export const Route = createFileRoute("/achievements")({
  head: () => ({ meta: [{ title: "Achievements — LSL" }] }),
  component: AchievementsPage,
});

function AchievementsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from("user_achievements").select("*").eq("user_id", user.id).order("awarded_at", { ascending: false });
      setItems(data ?? []); setLoading(false);
    };
    load();
    const ch = supabase.channel(`ach-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_achievements", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!user) return <Layout><div className="container py-10"><Link to="/login" className="text-primary underline">Sign in</Link> to view achievements.</div></Layout>;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Your collection</p>
          <h1 className="text-3xl md:text-4xl font-extrabold gradient-gold-text flex items-center gap-2 mt-1"><Trophy className="h-7 w-7 text-primary" />Achievements</h1>
          <p className="text-sm text-muted-foreground mt-1">Badges you've unlocked across the league.</p>
        </div>

        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!loading && items.length === 0 && (
          <Card className="glass p-6 text-center text-muted-foreground"><Sparkles className="h-6 w-6 mx-auto text-primary mb-2" />No badges yet — keep playing to unlock them.</Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map(a => (
            <Card key={a.id} className="p-4 text-center bg-gradient-to-br from-primary/10 to-transparent border-primary/30">
              <div className="text-3xl mb-2">{a.icon || "🏆"}</div>
              <div className="font-bold text-sm gradient-gold-text">{a.title}</div>
              {a.description && <div className="text-[11px] text-muted-foreground mt-1">{a.description}</div>}
              <div className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1"><Award className="h-3 w-3" />{new Date(a.awarded_at).toLocaleDateString()}</div>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}