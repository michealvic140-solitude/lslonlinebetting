import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ClipboardList, Plus, Trash2, Send, Users, User, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Q = { id: string; label: string; type: "text" | "choice"; options?: string[] };

function uid() { return Math.random().toString(36).slice(2, 9); }

export function SurveysAdminPanel() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"all" | "specific">("all");
  const [specialId, setSpecialId] = useState("");
  const [targetIds, setTargetIds] = useState<{ id: string; name: string }[]>([]);
  const [questions, setQuestions] = useState<Q[]>([{ id: uid(), label: "", type: "text" }]);
  const [saving, setSaving] = useState(false);
  const [viewResp, setViewResp] = useState<any | null>(null);

  async function load() {
    const [{ data: s }, { data: u }] = await Promise.all([
      supabase.from("surveys").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name,email,special_id").order("created_at", { ascending: false }).limit(500),
    ]);
    setSurveys(s ?? []);
    setUsers(u ?? []);
  }
  useEffect(() => { load(); }, []);

  function addQ() { setQuestions((q) => [...q, { id: uid(), label: "", type: "text" }]); }
  function rmQ(id: string) { setQuestions((q) => q.filter((x) => x.id !== id)); }
  function setQ(id: string, patch: Partial<Q>) { setQuestions((q) => q.map((x) => (x.id === id ? { ...x, ...patch } : x))); }

  async function addTarget() {
    const id = specialId.trim().toUpperCase();
    if (!id) return;
    const u = users.find((x) => (x.special_id || "").toUpperCase() === id);
    if (!u) return toast.error("No user with that Special ID");
    if (targetIds.some((t) => t.id === u.id)) return;
    setTargetIds((t) => [...t, { id: u.id, name: u.full_name || u.email }]);
    setSpecialId("");
  }

  async function create() {
    if (!title.trim()) return toast.error("Enter a title");
    const cleanQ = questions.filter((q) => q.label.trim()).map((q) => ({
      ...q,
      options: q.type === "choice" ? (q.options || []).filter(Boolean) : undefined,
    }));
    if (cleanQ.length === 0) return toast.error("Add at least one question");
    setSaving(true);
    const { error } = await supabase.from("surveys").insert({
      title: title.trim(),
      description: description.trim() || null,
      questions: cleanQ,
      target_user_ids: mode === "specific" ? targetIds.map((t) => t.id) : null,
      is_active: true,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Survey published to users");
    setTitle(""); setDescription(""); setQuestions([{ id: uid(), label: "", type: "text" }]); setTargetIds([]); setMode("all");
    load();
  }

  async function toggleActive(s: any) {
    const { error } = await supabase.from("surveys").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("surveys").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Survey deleted"); load();
  }
  async function openResponses(s: any) {
    const { data: resp } = await supabase
      .from("survey_responses")
      .select("*")
      .eq("survey_id", s.id)
      .order("created_at", { ascending: false });
    const rows = resp ?? [];
    const ids = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
    let profMap: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
    }
    const responses = rows.map((r: any) => ({ ...r, profiles: profMap[r.user_id] ?? null }));
    setViewResp({ survey: s, responses });
  }

  return (
    <div className="space-y-4">
      <Card className="glass-strong p-4 space-y-3">
        <div className="flex items-center gap-2 font-bold"><ClipboardList className="h-4 w-4 text-primary" />Create Survey</div>
        <Input placeholder="Survey title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="Short description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className="flex gap-2">
          <Button size="sm" variant={mode === "all" ? "default" : "outline"} onClick={() => setMode("all")}><Users className="h-4 w-4 mr-1" />All users</Button>
          <Button size="sm" variant={mode === "specific" ? "default" : "outline"} onClick={() => setMode("specific")}><User className="h-4 w-4 mr-1" />Specific users</Button>
        </div>
        {mode === "specific" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Recipient Special ID (e.g. XHA6HD8)" value={specialId} onChange={(e) => setSpecialId(e.target.value.toUpperCase())} />
              <Button variant="outline" onClick={addTarget}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {targetIds.map((t) => (
                <Badge key={t.id} variant="outline" className="border-primary/40 text-primary">{t.name}
                  <button className="ml-1" onClick={() => setTargetIds((x) => x.filter((y) => y.id !== t.id))}>×</button>
                </Badge>
              ))}
              {targetIds.length === 0 && <span className="text-xs text-muted-foreground">No recipients yet.</span>}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Questions</div>
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-border/70 p-3 space-y-2">
              <div className="flex gap-2">
                <Input placeholder={`Question ${i + 1}`} value={q.label} onChange={(e) => setQ(q.id, { label: e.target.value })} />
                <select value={q.type} onChange={(e) => setQ(q.id, { type: e.target.value as any })} className="rounded-md border border-border bg-background px-2 text-sm">
                  <option value="text">Text</option>
                  <option value="choice">Choice</option>
                </select>
                <Button size="icon" variant="outline" onClick={() => rmQ(q.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {q.type === "choice" && (
                <Input placeholder="Options, comma separated (e.g. Yes, No, Maybe)" value={(q.options || []).join(", ")} onChange={(e) => setQ(q.id, { options: e.target.value.split(",").map((s) => s.trim()) })} />
              )}
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addQ}><Plus className="h-4 w-4 mr-1" />Add question</Button>
        </div>

        <Button className="btn-luxury" onClick={create} disabled={saving}><Send className="h-4 w-4 mr-1" />{saving ? "Publishing…" : "Publish survey"}</Button>
      </Card>

      <Card className="glass p-4 space-y-2">
        <div className="font-bold">Surveys</div>
        {surveys.length === 0 && <p className="text-sm text-muted-foreground">No surveys yet.</p>}
        {surveys.map((s) => (
          <div key={s.id} className="rounded-lg border border-border/70 p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold truncate">{s.title}</div>
              <div className="text-xs text-muted-foreground">
                {(Array.isArray(s.questions) ? s.questions.length : 0)} questions · {s.target_user_ids ? `${s.target_user_ids.length} targeted` : "all users"} · {s.is_active ? "active" : "paused"}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => openResponses(s)}><Eye className="h-3 w-3 mr-1" />Responses</Button>
              <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
              <Button size="icon" variant="outline" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </Card>

      {viewResp && (
        <Card className="glass-strong p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-bold">Responses · {viewResp.survey.title}</div>
            <Button size="sm" variant="outline" onClick={() => setViewResp(null)}>Close</Button>
          </div>
          {viewResp.responses.filter((r: any) => r.status === "submitted").length === 0 && <p className="text-sm text-muted-foreground">No submitted responses yet.</p>}
          {viewResp.responses.filter((r: any) => r.status === "submitted").map((r: any) => (
            <div key={r.id} className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-semibold">{r.profiles?.full_name || r.profiles?.email}</div>
              <div className="mt-1 space-y-1">
                {(viewResp.survey.questions || []).map((q: Q) => (
                  <div key={q.id} className="text-xs"><span className="text-muted-foreground">{q.label}: </span><span className="font-medium">{r.answers?.[q.id] ?? "—"}</span></div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
