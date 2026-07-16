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
  head: () => ({
    meta: [
      { title: "Tasks — ECB" },
      { name: "description", content: "Complete ECB tasks and claim token rewards for your daily challenges." },
      { property: "og:title", content: "Tasks — ECB" },
      { property: "og:description", content: "Complete ECB tasks and claim token rewards for your daily challenges." },
      { property: "og:url", content: "/tasks" },
    ],
    links: [{ rel: "canonical", href: "/tasks" }],
  }),
  component: TasksPage,
});

const REWARD_LABEL: Record<string, string> = { tokens: "tokens", cashback: "cash-back", discount: "discount" };

function countdown(ends: string) {
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function TasksPage() {
  const { user, refresh } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bg, setBg] = useState<{ url: string | null; fit: string; pos: string }>({ url: null, fit: "cover", pos: "center" });
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);

  useEffect(() => {
    supabase.from("app_settings").select("tasks_bg_url,tasks_bg_fit,tasks_bg_position").eq("id", 1).maybeSingle()
      .then(({ data }) => { if (data) setBg({ url: (data as any).tasks_bg_url ?? null, fit: (data as any).tasks_bg_fit ?? "cover", pos: (data as any).tasks_bg_position ?? "center" }); });
  }, []);

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
    toast.success(`+${Number(r.reward).toLocaleString()} ${REWARD_LABEL[r.reward_kind] ?? "tokens"} claimed!`);
    await refresh();
  }

  if (!user) return <Layout><div className="container py-10"><Link to="/login" className="text-primary underline">Sign in</Link> to view tasks.</div></Layout>;

  const ready = tasks.filter(t => t.status === "completed");
  const pending = tasks.filter(t => t.status === "pending");
  const claimed = tasks.filter(t => t.status === "claimed");

  return (
    <Layout>
      {bg.url && (
        <div className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
          <img src={bg.url} alt="" aria-hidden className="absolute inset-0 h-full w-full" style={{ objectFit: bg.fit as any, objectPosition: bg.pos }} />
          <div className="absolute inset-0 bg-background/70" />
        </div>
      )}
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Earn rewards</p>
          <h1 className="text-3xl md:text-4xl font-extrabold gradient-gold-text flex items-center gap-2 mt-1"><ListChecks className="h-7 w-7 text-primary" />Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">Complete tasks assigned by the ECB team to claim token bonuses.</p>
        </div>

        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!loading && tasks.length === 0 && (
          <Card className="glass p-6 text-center text-muted-foreground"><Sparkles className="h-6 w-6 mx-auto text-primary mb-2" />No tasks yet — check back soon.</Card>
        )}

        <Section title="Ready to claim" items={ready} now={now} accent>
          {(t: any) => <Button size="sm" className="btn-luxury" onClick={() => claim(t.id)}><Gift className="h-3 w-3 mr-1" />Claim {Number(t.reward_tokens).toLocaleString()}</Button>}
        </Section>
        <Section title="In progress" items={pending} now={now}>
          {(_t: any) => <Badge variant="outline" className="border-amber-400/40 text-amber-300"><Clock className="h-3 w-3 mr-1" />Pending</Badge>}
        </Section>
        <Section title="Completed" items={claimed} now={now}>
          {(_t: any) => <Badge variant="outline" className="border-emerald-400/40 text-emerald-300"><CheckCircle2 className="h-3 w-3 mr-1" />Claimed</Badge>}
        </Section>
      </div>
    </Layout>
  );
}

function Section({ title, items, now, accent, children }: { title: string; items: any[]; now: number; accent?: boolean; children: (t: any) => any }) {
  if (!items.length) return null;
  return (
    <div className="mt-6">
      <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">{title}</h2>
      <div className="space-y-3">
        {items.map(t => {
          const target = Math.max(1, Number(t.target_progress) || 1);
          const prog = Math.min(target, Number(t.progress) || 0);
          const pct = Math.round((prog / target) * 100);
          return (
            <Card key={t.id} className={`overflow-hidden ${accent ? "border-primary/40 bg-primary/5" : ""}`}>
              {t.banner_url && <img src={t.banner_url} alt="" className="h-24 w-full object-cover" />}
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{t.title}</span>
                    {t.period && t.period !== "once" && <Badge variant="outline" className="text-[10px] capitalize">{t.period}</Badge>}
                  </div>
                  {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                  {target > 1 && (
                    <div className="mt-2">
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">{prog} / {target} · {pct}%</div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                    <span className="text-primary">Reward: {Number(t.reward_tokens).toLocaleString()} {REWARD_LABEL[t.reward_kind] ?? "tokens"}</span>
                    {t.ends_at && <span className="text-amber-300 inline-flex items-center gap-1"><Clock className="h-3 w-3" />{countdown(t.ends_at)}</span>}
                  </div>
                </div>
                <div className="shrink-0">{children(t)}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
