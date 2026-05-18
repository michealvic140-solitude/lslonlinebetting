import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Gift, CheckCircle2, Clock, ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks — LSL" }] }),
  component: TasksPage,
});

function TasksPage() {
  const { user, refresh } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from("user_tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setTasks(data ?? []); setLoading(false);
    };
    load();
    const ch = supabase.channel(`tasks-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_tasks", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  async function claim(id: string) {
    const { data, error } = await supabase.rpc("claim_task", { _task_id: id });
    if (error) return toast.error(error.message);
    const r = data as any;
    toast.success(`+${r.reward.toLocaleString()} tokens claimed!`);
    await refresh();
  }

  if (!user) return <Layout><div className="container py-10"><Link to="/login" className="text-primary underline">Sign in</Link> to view tasks.</div></Layout>;

  const pending = tasks.filter(t => t.status === "pending");
  const ready = tasks.filter(t => t.status === "completed");
  const claimed = tasks.filter(t => t.status === "claimed");

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Earn rewards</p>
          <h1 className="text-3xl md:text-4xl font-extrabold gradient-gold-text flex items-center gap-2 mt-1"><ListChecks className="h-7 w-7 text-primary" />Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">Complete tasks assigned by the LSL team to claim token bonuses.</p>
        </div>

        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!loading && tasks.length === 0 && (
          <Card className="glass p-6 text-center text-muted-foreground"><Sparkles className="h-6 w-6 mx-auto text-primary mb-2" />No tasks yet — check back soon.</Card>
        )}

        <Section title="Ready to claim" items={ready} accent>
          {(t: any) => (
            <Button size="sm" className="btn-luxury" onClick={() => claim(t.id)}><Gift className="h-3 w-3 mr-1" />Claim {t.reward_tokens.toLocaleString()}</Button>
          )}
        </Section>
        <Section title="In progress" items={pending}>
          {(_t: any) => <Badge variant="outline" className="border-amber-400/40 text-amber-300"><Clock className="h-3 w-3 mr-1" />Pending</Badge>}
        </Section>
        <Section title="Completed" items={claimed}>
          {(_t: any) => <Badge variant="outline" className="border-emerald-400/40 text-emerald-300"><CheckCircle2 className="h-3 w-3 mr-1" />Claimed</Badge>}
        </Section>
      </div>
    </Layout>
  );
}

function Section({ title, items, accent, children }: { title: string; items: any[]; accent?: boolean; children: (t: any) => any }) {
  if (!items.length) return null;
  return (
    <div className="mt-6">
      <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">{title}</h2>
      <div className="space-y-2">
        {items.map(t => (
          <Card key={t.id} className={`p-4 flex items-center gap-3 ${accent ? "border-primary/40 bg-primary/5" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="font-bold">{t.title}</div>
              {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
              <div className="text-[11px] text-primary mt-1">Reward: {t.reward_tokens.toLocaleString()} tokens</div>
            </div>
            {children(t)}
          </Card>
        ))}
      </div>
    </div>
  );
}