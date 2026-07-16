// Client-side validator + optional resizer for admin logo / OG image uploads.
// Runs entirely in the browser via <canvas>. No server involvement.

export type ImageKind = "logo-square" | "og-social" | "auth-hero";

const RULES: Record<ImageKind, {
  maxBytes: number;
  minW: number;
  minH: number;
  targetW: number;
  targetH: number;
  aspect?: number; // required exact aspect (w/h)
  fit: "contain" | "cover";
  label: string;
}> = {
  "logo-square":  { maxBytes: 2_000_000, minW: 128,  minH: 128, targetW: 512,  targetH: 512, fit: "contain", label: "logo" },
  "og-social":    { maxBytes: 3_000_000, minW: 600,  minH: 315, targetW: 1200, targetH: 630, aspect: 1200/630, fit: "cover", label: "social share image" },
  "auth-hero":    { maxBytes: 5_000_000, minW: 800,  minH: 600, targetW: 1600, targetH: 1200, fit: "cover", label: "auth hero image" },
};

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export type ValidatedImage = { file: File; width: number; height: number };

export async function validateAndResize(file: File, kind: ImageKind): Promise<ValidatedImage> {
  const rule = RULES[kind];
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Unsupported format (${file.type || "unknown"}). Use PNG, JPG, or WEBP for your ${rule.label}.`);
  }
  if (file.size > rule.maxBytes) {
    throw new Error(`File is ${(file.size/1_000_000).toFixed(1)}MB — max ${(rule.maxBytes/1_000_000).toFixed(1)}MB for a ${rule.label}.`);
  }
  const bmp = await loadBitmap(file);
  if (bmp.width < rule.minW || bmp.height < rule.minH) {
    throw new Error(`Image is ${bmp.width}x${bmp.height}px — must be at least ${rule.minW}x${rule.minH}px for a ${rule.label}.`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = rule.targetW;
  canvas.height = rule.targetH;
  const ctx = canvas.getContext("2d")!;
  // Transparent background for logos, black for hero/og so no white bars leak into dark theme.
  ctx.fillStyle = kind === "logo-square" ? "rgba(0,0,0,0)" : "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const srcAspect = bmp.width / bmp.height;
  const dstAspect = rule.targetW / rule.targetH;
  let dx = 0, dy = 0, dw = rule.targetW, dh = rule.targetH;
  if (rule.fit === "contain") {
    if (srcAspect > dstAspect) { dh = rule.targetW / srcAspect; dy = (rule.targetH - dh) / 2; }
    else                       { dw = rule.targetH * srcAspect; dx = (rule.targetW - dw) / 2; }
  } else {
    // cover: crop
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (srcAspect > dstAspect) { sw = bmp.height * dstAspect; sx = (bmp.width - sw) / 2; }
    else                       { sh = bmp.width / dstAspect;  sy = (bmp.height - sh) / 2; }
    ctx.drawImage(bmp as any, sx, sy, sw, sh, 0, 0, rule.targetW, rule.targetH);
    const blob = await canvasToBlob(canvas, file.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
    return { file: new File([blob], renameFor(file, rule.targetW, rule.targetH), { type: blob.type }), width: rule.targetW, height: rule.targetH };
  }
  ctx.drawImage(bmp as any, dx, dy, dw, dh);
  const outType = kind === "logo-square" ? "image/png" : (file.type === "image/png" ? "image/png" : "image/jpeg");
  const blob = await canvasToBlob(canvas, outType, 0.92);
  return { file: new File([blob], renameFor(file, rule.targetW, rule.targetH), { type: blob.type }), width: rule.targetW, height: rule.targetH };
}

function renameFor(f: File, w: number, h: number): string {
  const base = f.name.replace(/\.[^.]+$/, "") || "image";
  const ext = f.type === "image/png" ? "png" : "jpg";
  return `${base}-${w}x${h}.${ext}`;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file); } catch { /* fallback */ }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode image")); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Canvas encode failed")), type, quality);
  });
}