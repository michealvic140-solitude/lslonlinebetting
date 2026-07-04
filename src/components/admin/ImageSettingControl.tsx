import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Link2, Trash2, Loader2 } from "lucide-react";

const FIT_OPTIONS = [
  { v: "cover", l: "Cover (fill & crop)" },
  { v: "contain", l: "Contain (fit whole image)" },
  { v: "fill", l: "Stretch to fill" },
];

const POSITION_OPTIONS = [
  { v: "center", l: "Center" },
  { v: "top", l: "Top" },
  { v: "bottom", l: "Bottom" },
  { v: "left", l: "Left" },
  { v: "right", l: "Right" },
  { v: "top left", l: "Top left" },
  { v: "top right", l: "Top right" },
  { v: "bottom left", l: "Bottom left" },
  { v: "bottom right", l: "Bottom right" },
  { v: "center right", l: "Center right" },
  { v: "center left", l: "Center left" },
];

export function ImageSettingControl({
  label,
  value,
  onChange,
  fit = "cover",
  onFitChange,
  position = "center",
  onPositionChange,
  help,
  aspect = "16 / 9",
  showFitControls = true,
  previewBg = "#0b1512",
}: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  fit?: string;
  onFitChange?: (v: string) => void;
  position?: string;
  onPositionChange?: (v: string) => void;
  help?: string;
  aspect?: string;
  showFitControls?: boolean;
  previewBg?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(f: File) {
    setBusy(true);
    try {
      const path = `appearance/${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from("ads").upload(path, f, { upsert: true });
      if (error) { toast.error(error.message); return; }
      const url = supabase.storage.from("ads").getPublicUrl(path).data.publicUrl;
      onChange(url);
      toast.success("Image uploaded — preview updated. Remember to Save settings.");
    } finally {
      setBusy(false);
    }
  }

  function applyUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { toast.error("Enter a valid http(s) image URL"); return; }
    onChange(u);
    setUrlDraft("");
    toast.success("Image URL applied to preview. Remember to Save settings.");
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/15 bg-background/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{label}</div>
        {value && (
          <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => onChange(null)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />Remove
          </Button>
        )}
      </div>

      {/* Live preview */}
      <div className="rounded-md border border-border overflow-hidden" style={{ aspectRatio: aspect, background: previewBg }}>
        {value ? (
          <img
            src={value}
            alt=""
            className="h-full w-full"
            style={{ objectFit: (fit as any) || "cover", objectPosition: position || "center" }}
            onError={() => toast.error("Could not load that image. Check the URL.")}
          />
        ) : (
          <div className="h-full w-full grid place-items-center text-[11px] text-muted-foreground">No image — live preview appears here</div>
        )}
      </div>

      {/* Direct upload + URL upload */}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
          Upload image
        </Button>
        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <Input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="…or paste image URL" className="h-9" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyUrl(); } }} />
          <Button type="button" size="sm" variant="outline" onClick={applyUrl}><Link2 className="h-3.5 w-3.5 mr-1" />Use URL</Button>
        </div>
      </div>

      {/* Fit / position controls */}
      {showFitControls && value && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Crop / fit</div>
            <Select value={fit} onValueChange={(v) => onFitChange?.(v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{FIT_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Position</div>
            <Select value={position} onValueChange={(v) => onPositionChange?.(v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{POSITION_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {help && <p className="text-[10px] text-muted-foreground">{help}</p>}
    </div>
  );
}
