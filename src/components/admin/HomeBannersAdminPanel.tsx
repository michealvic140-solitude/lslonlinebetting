import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageSettingControl } from "@/components/admin/ImageSettingControl";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { GalleryHorizontalEnd, Plus, Trash2 } from "lucide-react";

export function HomeBannersAdminPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [link, setLink] = useState("/matches");
  const [cta, setCta] = useState("Click here");
  const [saving, setSaving] = useState(false);

  function load() {
    supabase.from("home_banners").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!image) return toast.error("Add a banner image");
    setSaving(true);
    const { error } = await supabase.from("home_banners").insert({
      title: title.trim(), subtitle: subtitle.trim(), image_url: image,
      link_url: link.trim() || "/", cta_label: cta.trim() || "Click here",
      is_active: true, sort_order: items.length, created_by: user?.id ?? null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Banner published to the home page");
    setTitle(""); setSubtitle(""); setImage(null); setLink("/matches"); setCta("Click here");
    load();
  }
  async function toggle(b: any) {
    const { error } = await supabase.from("home_banners").update({ is_active: !b.is_active } as any).eq("id", b.id);
    if (error) return toast.error(error.message);
    load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("home_banners").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Banner removed"); load();
  }
  async function move(b: any, dir: -1 | 1) {
    const { error } = await supabase.from("home_banners").update({ sort_order: Math.max(0, (b.sort_order ?? 0) + dir) } as any).eq("id", b.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="glass-strong p-4 space-y-3">
        <div className="flex items-center gap-2 font-bold"><GalleryHorizontalEnd className="h-4 w-4 text-primary" />Create Home Banner</div>
        <p className="text-[11px] text-muted-foreground">Wide banners shown below the top navbar. Multiple banners auto-slide left→right. Each links to the page you choose.</p>
        <ImageSettingControl label="Banner image" value={image} onChange={setImage} showFitControls={false} aspect="16 / 5" help="Wide image works best (e.g. 1600×500)." />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Headline (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder='CTA label (e.g. "Click here")' value={cta} onChange={(e) => setCta(e.target.value)} />
        </div>
        <Textarea placeholder="Subtext (optional)" rows={2} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Redirect link (internal path or full URL)</label>
          <Input placeholder="/matches, /virtual, /lottery …" value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
        <Button className="btn-luxury" onClick={create} disabled={saving}><Plus className="h-4 w-4 mr-1" />{saving ? "Publishing…" : "Publish banner"}</Button>
      </Card>

      <Card className="glass p-4 space-y-2">
        <div className="font-bold">Banners ({items.length})</div>
        {items.length === 0 && <p className="text-sm text-muted-foreground">No banners yet.</p>}
        {items.map((b) => (
          <div key={b.id} className="rounded-lg border border-border/70 p-2.5 flex items-center gap-3">
            {b.image_url && <img src={b.image_url} alt="" className="h-12 w-24 rounded object-cover shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{b.title || "(no headline)"}</div>
              <div className="text-[11px] text-muted-foreground truncate">→ {b.link_url} · {b.is_active ? "active" : "hidden"}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(b, -1)}>↑</Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(b, 1)}>↓</Button>
              <Switch checked={b.is_active} onCheckedChange={() => toggle(b)} />
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => remove(b.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}