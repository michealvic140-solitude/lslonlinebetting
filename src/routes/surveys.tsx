import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CheckCircle2, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/surveys")({
  validateSearch: (s: Record<string, unknown>) => ({ s: typeof s.s === "string" ? s.s : undefined }),
  head: () => ({
    meta: [
      { title: "Surveys — LSL" },
      { name: "description", content: "Answer ongoing LSL surveys and share your feedback with the team." },
    ],
  }),
  component: SurveysPage,
});

type Q = { id: string; label: string; type: "text" | "choice"; options?: string[] };

function SurveysPage() {
  const { user } = useAuth();
  const { s: focusId } = Route.useSearch();
  const [surveys, setSurveys] = useState<any[]>([]);
  const [answered, setAnswered] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [{ data: sv }, { data: resp }] = await Promise.all([
      supabase.from("surveys").select("*").eq("is_active", true).order("created_at", { ascending: false }),
      supabase.from("survey_responses").select("survey_id,status,answers").eq("user_id", user.id),
    ]);
    setSurveys(sv ?? []);
    const map: Record<string, any> = {};
    (resp ?? []).forEach((r: any) => { map[r.survey_id] = r; });
    setAnswered(map);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  if (!user) return <Layout><div className="container py-10"><Link to="/login" className="text-primary underline">Sign in</Link> to view surveys.</div></Layout>;

  const open = surveys.filter((s) => !answered[s.id] || answered[s.id].status === "dismissed");
  const done = surveys.filter((s) => answered[s.id] && answered[s.id].status === "submitted");

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Your voice matters</p>
          <h1 className="text-3xl md:text-4xl font-extrabold gradient-gold-text flex items-center gap-2 mt-1"><ClipboardList className="h-7 w-7 text-primary" />Surveys</h1>
        </div>

        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!loading && open.length === 0 && done.length === 0 && (
          <Card className="glass p-6 text-center text-muted-foreground">No surveys right now — check back soon.</Card>
        )}

        <div className="space-y-4">
          {open.map((s) => <SurveyForm key={s.id} survey={s} defaultOpen={s.id === focusId} onDone={load} />)}
        </div>

        {done.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">Completed</h2>
            <div className="space-y-2">
              {done.map((s) => (
                <Card key={s.id} className="p-4 flex items-center justify-between gap-3 border-emerald-500/30">
                  <span className="font-semibold">{s.title}</span>
                  <Badge variant="outline" className="border-emerald-400/40 text-emerald-300"><CheckCircle2 className="h-3 w-3 mr-1" />Submitted</Badge>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function SurveyForm({ survey, defaultOpen, onDone }: { survey: any; defaultOpen?: boolean; onDone: () => void }) {
  const { user } = useAuth();
  const questions: Q[] = Array.isArray(survey.questions) ? survey.questions : [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(!!defaultOpen);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const missing = questions.find((q) => !answers[q.id]?.trim());
    if (missing) { toast.error("Please answer all questions"); return; }
    setSaving(true);
    const { error } = await supabase.from("survey_responses").upsert(
      { survey_id: survey.id, user_id: user!.id, status: "submitted", answers },
      { onConflict: "survey_id,user_id" },
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Survey submitted — thank you!");
    onDone();
  }

  return (
    <Card className="glass-strong p-5 border-primary/30">
      <button className="w-full text-left" onClick={() => setOpen((v) => !v)}>
        <div className="font-bold text-lg">{survey.title}</div>
        {survey.description && <div className="text-sm text-muted-foreground mt-0.5">{survey.description}</div>}
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          {questions.length === 0 && <p className="text-sm text-muted-foreground">This survey has no questions.</p>}
          {questions.map((q, i) => (
            <div key={q.id}>
              <label className="text-sm font-semibold">{i + 1}. {q.label}</label>
              {q.type === "choice" && q.options?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <button key={opt} type="button" onClick={() => setAnswers((p) => ({ ...p, [q.id]: opt }))}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${answers[q.id] === opt ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <Textarea className="mt-2" rows={2} value={answers[q.id] || ""} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} placeholder="Your answer…" />
              )}
            </div>
          ))}
          <Button className="btn-luxury" onClick={submit} disabled={saving}><Send className="h-4 w-4 mr-1" />{saving ? "Submitting…" : "Submit survey"}</Button>
        </div>
      )}
    </Card>
  );
}
