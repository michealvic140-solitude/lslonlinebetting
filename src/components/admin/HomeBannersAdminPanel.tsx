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
import { logAudit } from "@/lib/audit";

export function HomeBannersAdminPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageFit, setImageFit] = useState<string>("cover");
  const [imagePosition, setImagePosition] = useState<string>("center");
  const [link, setLink] = useState("/matches");
  const [cta, setCta] = useState("Click here");
  const [placement, setPlacement] = useState<"home" | "matches">("home");
  const [saving, setSaving] = useState(false);

  function load() {
    (supabase as any).from("home_banners").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false })
      .then(({ data }: { data: any }) => setItems(data ?? []));
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!image) return toast.error("Add a banner image");
    setSaving(true);
    const { data: inserted, error } = await (supabase as any).from("home_banners").insert({
      title: title.trim(), subtitle: subtitle.trim(), image_url: image,
      link_url: link.trim() || "/", cta_label: cta.trim() || "Click here",
      is_active: true, sort_order: items.length, created_by: user?.id ?? null,
      placement, image_fit: imageFit, image_position: imagePosition,
    }).select("id").maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Banner published to the ${placement} page`);
    logAudit("banner_create", "home_banner", inserted?.id, { placement, title: title.trim(), link_url: link.trim() });
    setTitle(""); setSubtitle(""); setImage(null); setLink("/matches"); setCta("Click here");
    setImageFit("cover"); setImagePosition("center");
    load();
  }
  async function toggle(b: any) {
    const { error } = await (supabase as any).from("home_banners").update({ is_active: !b.is_active }).eq("id", b.id);
    if (error) return toast.error(error.message);
    logAudit(b.is_active ? "banner_disable" : "banner_enable", "home_banner", b.id, { placement: b.placement, title: b.title });
    load();
  }
  async function remove(id: string) {
    const target = items.find((x) => x.id === id);
    const { error } = await (supabase as any).from("home_banners").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Banner removed");
    logAudit("banner_remove", "home_banner", id, { placement: target?.placement, title: target?.title });
    load();
  }
  async function move(b: any, dir: -1 | 1) {
    const next = Math.max(0, (b.sort_order ?? 0) + dir);
    const { error } = await (supabase as any).from("home_banners").update({ sort_order: next }).eq("id", b.id);
    if (error) return toast.error(error.message);
    logAudit("banner_reorder", "home_banner", b.id, { placement: b.placement, from: b.sort_order, to: next });
    load();
  }
  async function updateCrop(b: any, patch: { image_fit?: string; image_position?: string }) {
    const { error } = await (supabase as any).from("home_banners").update(patch).eq("id", b.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="glass-strong p-4 space-y-3">
        <div className="flex items-center gap-2 font-bold"><GalleryHorizontalEnd className="h-4 w-4 text-primary" />Create Home Banner</div>
        <p className="text-[11px] text-muted-foreground">Wide banners shown below the top navbar of either the home page or the matches page. Multiple banners auto-slide left→right.</p>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Placement</label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={placement}
            onChange={(e) => setPlacement(e.target.value as "home" | "matches")}
          >
            <option value="home">Home page</option>
            <option value="matches">Matches page</option>
          </select>
        </div>
        <ImageSettingControl
          label="Banner image"
          value={image}
          onChange={setImage}
          fit={imageFit}
          onFitChange={setImageFit}
          position={imagePosition}
          onPositionChange={setImagePosition}
          aspect="16 / 5"
          help="Wide image works best (e.g. 1600×500). Use Crop/fit + Position to control how it frames."
        />
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
          <div key={b.id} className="rounded-lg border border-border/70 p-2.5 flex items-center gap-3 flex-wrap">
            {b.image_url && (
              <img
                src={b.image_url}
                alt=""
                className="h-12 w-24 rounded shrink-0 bg-black"
                style={{ objectFit: (b.image_fit as any) || "cover", objectPosition: b.image_position || "center" }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{b.title || "(no headline)"}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                <span className="uppercase tracking-widest text-primary/80 mr-1.5">{b.placement || "home"}</span>
                → {b.link_url} · {b.is_active ? "active" : "hidden"}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(b, -1)}>↑</Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(b, 1)}>↓</Button>
              <Switch checked={b.is_active} onCheckedChange={() => toggle(b)} />
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => remove(b.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="w-full grid grid-cols-2 gap-2 pt-1">
              <label className="text-[10px] uppercase text-muted-foreground space-y-1">
                <span>Crop / fit</span>
                <select
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={b.image_fit || "cover"}
                  onChange={(e) => updateCrop(b, { image_fit: e.target.value })}
                >
                  <option value="cover">Cover (fill & crop)</option>
                  <option value="contain">Contain (fit whole image)</option>
                  <option value="fill">Stretch to fill</option>
                </select>
              </label>
              <label className="text-[10px] uppercase text-muted-foreground space-y-1">
                <span>Position</span>
                <select
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={b.image_position || "center"}
                  onChange={(e) => updateCrop(b, { image_position: e.target.value })}
                >
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="top left">Top left</option>
                  <option value="top right">Top right</option>
                  <option value="bottom left">Bottom left</option>
                  <option value="bottom right">Bottom right</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}