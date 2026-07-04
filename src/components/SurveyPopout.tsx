import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardList, X, ArrowRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Survey = { id: string; title: string; description: string | null; questions: any; expires_at: string | null };

/**
 * Floating survey interrupt. Shows the first active survey the user hasn't
 * answered/dismissed. "Ignore" persists a dismissal (won't show again),
 * "Remind me later" closes for this view (re-appears on refresh / re-entry),
 * "Take survey" jumps to the survey page.
 */
export function SurveyPopout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null>(null);

  async function load() {
    if (!user) return;
    const now = new Date().toISOString();
    const [{ data: surveys }, { data: responses }] = await Promise.all([
      supabase.from("surveys").select("id,title,description,questions,expires_at").eq("is_active", true).order("created_at", { ascending: false }),
      supabase.from("survey_responses").select("survey_id").eq("user_id", user.id),
    ]);
    const answered = new Set((responses ?? []).map((r: any) => r.survey_id));
    const next = (surveys ?? []).find((s: any) => !answered.has(s.id) && (!s.expires_at || s.expires_at > now));
    setSurvey((next as Survey) ?? null);
  }

  useEffect(() => {
    if (!user) { setSurvey(null); return; }
    load();
    const ch = supabase.channel(`survey-popout-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "surveys" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!survey || !user) return null;

  async function ignore() {
    await supabase.from("survey_responses").upsert(
      { survey_id: survey!.id, user_id: user!.id, status: "dismissed", answers: {} },
      { onConflict: "survey_id,user_id" },
    );
    setSurvey(null);
  }
  function remindLater() { setSurvey(null); }
  function take() { const id = survey!.id; setSurvey(null); navigate({ to: "/surveys", search: { s: id } as any }); }

  const count = Array.isArray(survey.questions) ? survey.questions.length : 0;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[115] flex justify-center px-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-primary/40 bg-card/95 backdrop-blur-xl p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
        <button onClick={remindLater} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground" aria-label="Remind me later"><X className="h-4 w-4" /></button>
        <div className="flex items-start gap-3 pr-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-gold shadow-gold"><ClipboardList className="h-5 w-5 text-background" /></span>
          <div className="min-w-0">
            <h3 className="font-bold text-foreground leading-snug">{survey.title}</h3>
            {survey.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{survey.description}</p>}
            <p className="text-[11px] text-primary mt-1">{count} question{count === 1 ? "" : "s"} · We'd love your feedback</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={take} className="btn-luxury inline-flex items-center gap-1 rounded-lg px-3.5 py-2 text-sm font-bold">Take survey<ArrowRight className="h-4 w-4" /></button>
          <button onClick={remindLater} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><Clock className="h-3.5 w-3.5" />Remind me later</button>
          <button onClick={ignore} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive">Ignore</button>
        </div>
      </div>
    </div>
  );
}
