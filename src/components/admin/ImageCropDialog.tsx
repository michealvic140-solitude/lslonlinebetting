import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const ASPECTS: { v: string; l: string; ratio: number | null }[] = [
  { v: "free", l: "Free", ratio: null },
  { v: "16:9", l: "16:9 (banner)", ratio: 16 / 9 },
  { v: "4:3", l: "4:3", ratio: 4 / 3 },
  { v: "1:1", l: "1:1 (square)", ratio: 1 },
  { v: "3:4", l: "3:4", ratio: 3 / 4 },
  { v: "9:16", l: "9:16 (portrait)", ratio: 9 / 16 },
];

async function getCroppedBlob(imageSrc: string, area: Area, mime = "image/jpeg", quality = 0.92): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Crop failed"))), mime, quality);
  });
}

export function ImageCropDialog({
  file,
  defaultAspect = "16:9",
  onCancel,
  onDone,
}: {
  file: File | null;
  defaultAspect?: string;
  onCancel: () => void;
  onDone: (cropped: File) => void;
}) {
  const [src] = useState(() => (file ? URL.createObjectURL(file) : null));
  const [aspectKey, setAspectKey] = useState(defaultAspect);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const aspect = ASPECTS.find((a) => a.v === aspectKey)?.ratio ?? undefined;

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  async function confirm() {
    if (!src || !area || !file) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(src, area, file.type.startsWith("image/png") ? "image/png" : "image/jpeg");
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const name = file.name.replace(/\.[^.]+$/, "") + `-cropped.${ext}`;
      onDone(new File([blob], name, { type: blob.type }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop image</DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-[55vh] bg-black rounded-md overflow-hidden">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect as number | undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition={false}
            />
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Aspect</div>
            <Select value={aspectKey} onValueChange={setAspectKey}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{ASPECTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Zoom</div>
            <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0])} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button className="btn-luxury" onClick={confirm} disabled={busy || !area}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Use cropped image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
