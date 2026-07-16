import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Brain, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/trivia")({
  head: () => ({
    meta: [
      { title: "Trivia & Quiz — Win Tokens | ECB" },
      { name: "description", content: "Answer ECB trivia questions correctly to earn token rewards." },
    ],
  }),
  component: TriviaPage,
});

function TriviaPage() {
  const { user, refresh } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [questions, setQuestions] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<Record<string, any>>({});

  async function load() {
    const [{ data: en }, { data: qs }] = await Promise.all([
      (supabase as any).from("app_settings").select("trivia_enabled").eq("id", 1).maybeSingle(),
      (supabase as any).from("trivia_questions").select("id,question,options,reward,is_active").eq("is_active", true).order("created_at", { ascending: false }),
    ]);
    setEnabled(!!en?.trivia_enabled);
    setQuestions(qs ?? []);
    if (user) {
      const { data: at } = await (supabase as any).from("trivia_attempts").select("*").eq("user_id", user.id);
      setAttempts(Object.fromEntries((at ?? []).map((a: any) => [a.question_id, a])));
    }
  }
  useEffect(() => { load(); }, [user?.id]);

  async function answer(q: any, idx: number) {
    const { data, error } = await (supabase.rpc as any)("answer_trivia", { _question_id: q.id, _selected_index: idx });
    if (error) return toast.error(error.message);
    if (data.correct) toast.success(`Correct! +${Number(data.reward).toLocaleString()} tokens 🎉`);
    else toast.error("Wrong answer. Better luck next time!");
    refresh(); load();
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-gradient-gold grid place-items-center shadow-gold"><Brain className="h-7 w-7 text-background" /></div>
          <div>
            <h1 className="text-3xl font-extrabold gradient-gold-text">Trivia & Quiz</h1>
            <p className="text-sm text-muted-foreground">Answer correctly to win token rewards.</p>
          </div>
        </div>
        {!user && <Card className="p-8 text-center"><p>Please <Link to="/login" className="text-primary underline">sign in</Link> to play.</p></Card>}
        {user && !enabled && <Card className="p-8 text-center text-muted-foreground">Trivia is currently closed.</Card>}
        {user && enabled && questions.length === 0 && <Card className="p-8 text-center text-muted-foreground">No questions right now. Check back soon!</Card>}
        {user && enabled && (
          <div className="space-y-4">
            {questions.map((q) => {
              const at = attempts[q.id];
              const opts: string[] = Array.isArray(q.options) ? q.options : [];
              return (
                <Card key={q.id} className="p-5 border-primary/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold">{q.question}</div>
                    <Badge variant="outline" className="border-amber-500/50 text-amber-300">+{Number(q.reward).toLocaleString()}</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {opts.map((o, i) => {
                      const answered = !!at;
                      const chosen = at?.selected_index === i;
                      return (
                        <Button key={i} variant="outline" disabled={answered}
                          onClick={() => answer(q, i)}
                          className={`justify-start ${chosen ? (at.is_correct ? "border-emerald-500/60 text-emerald-300" : "border-destructive/60 text-destructive") : ""}`}>
                          {answered && chosen && (at.is_correct ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <XCircle className="h-4 w-4 mr-1" />)}
                          {o}
                        </Button>
                      );
                    })}
                  </div>
                  {at && <div className="text-xs text-muted-foreground mt-2">{at.is_correct ? `You earned ${Number(at.reward).toLocaleString()} tokens.` : "You answered this already."}</div>}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}