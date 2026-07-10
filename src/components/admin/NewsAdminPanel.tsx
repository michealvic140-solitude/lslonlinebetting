import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Newspaper, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ImageSettingControl } from "@/components/admin/ImageSettingControl";
import { useConfirm } from "@/components/ConfirmDialog";

export function NewsAdminPanel() {
  const confirm = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [draft, setDraft] = useState<{ title: string; body: string; image_url: string | null; link_url: string; sort_order: number }>({ title: "", body: "", image_url: null, link_url: "", sort_order: 0 });
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("news").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!draft.title.trim()) return toast.error("Enter a title");
    setSaving(true);
    const { error } = await supabase.from("news").insert({
      title: draft.title.trim(),
      body: draft.body.trim() || null,
      image_url: draft.image_url,
      link_url: draft.link_url.trim() || null,
      sort_order: draft.sort_order,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("News posted");
    setDraft({ title: "", body: "", image_url: null, link_url: "", sort_order: 0 });
    load();
  }

  async function toggle(id: string, is_active: boolean) {
    const { error } = await supabase.from("news").update({ is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Delete news item?", confirmText: "Delete", tone: "danger" }))) return;
    const { error } = await supabase.from("news").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h3 className="font-bold flex items-center gap-2 mb-4"><Plus className="h-5 w-5 text-primary" />Post News</h3>
        <div className="grid gap-3">
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Title</label><Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Big win this weekend!" /></div>
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Body</label><Textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} placeholder="Short summary shown in the news slider…" /></div>
          <ImageSettingControl label="News image" value={draft.image_url} onChange={(url) => setDraft((d) => ({ ...d, image_url: url }))} showFitControls={false} help="Optional. Shown at the top of the news card on the homepage." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Link (optional)</label><Input value={draft.link_url} onChange={(e) => setDraft((d) => ({ ...d, link_url: e.target.value }))} placeholder="https://…" /></div>
            <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Sort order</label><Input type="number" value={draft.sort_order} onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) }))} /></div>
          </div>
        </div>
        <Button className="btn-luxury mt-4" onClick={create} disabled={saving}>{saving ? "Posting…" : "Post News"}</Button>
      </Card>

      <div className="space-y-3">
        <h3 className="font-bold flex items-center gap-2"><Newspaper className="h-5 w-5 text-primary" />News Items</h3>
        {items.length === 0 && <p className="text-sm text-muted-foreground">No news yet.</p>}
        {items.map((n) => (
          <Card key={n.id} className="p-3 flex items-center gap-3 flex-wrap">
            {n.image_url && <img src={n.image_url} alt="" className="h-14 w-24 object-cover rounded-md shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{n.title}</div>
              <div className="text-xs text-muted-foreground line-clamp-1">{n.body}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Active</span>
              <Switch checked={!!n.is_active} onCheckedChange={(v) => toggle(n.id, v)} />
              <Button size="sm" variant="outline" onClick={() => remove(n.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
