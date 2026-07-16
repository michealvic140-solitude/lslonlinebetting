import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Palette } from "lucide-react";
import { ImageSettingControl } from "@/components/admin/ImageSettingControl";

type Row = {
  platform_name: string | null;
  platform_tagline: string | null;
  platform_description: string | null;
  platform_logo_url: string | null;
  platform_logo_auth_url: string | null;
  platform_logo_voucher_url: string | null;
  platform_logo_corner_url: string | null;
  auth_hero_image_url: string | null;
  platform_og_image_url: string | null;
  site_name: string | null;
};

export function BrandingAdminPanel() {
  const [row, setRow] = useState<Row>({
    platform_name: "",
    platform_tagline: "",
    platform_description: "",
    platform_logo_url: null,
    platform_logo_auth_url: null,
    platform_logo_voucher_url: null,
    platform_logo_corner_url: null,
    auth_hero_image_url: null,
    platform_og_image_url: null,
    site_name: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("site_name,platform_name,platform_tagline,platform_description,platform_logo_url,platform_logo_auth_url,platform_logo_voucher_url,platform_logo_corner_url,auth_hero_image_url,platform_og_image_url")
        .eq("id", 1).maybeSingle();
      if (data) setRow((r) => ({ ...r, ...data }));
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    const { error } = await (supabase as any).from("app_settings").update({
      platform_name: row.platform_name,
      platform_tagline: row.platform_tagline,
      platform_description: row.platform_description,
      platform_logo_url: row.platform_logo_url,
      platform_logo_auth_url: row.platform_logo_auth_url,
      platform_logo_voucher_url: row.platform_logo_voucher_url,
      platform_logo_corner_url: row.platform_logo_corner_url,
      auth_hero_image_url: row.auth_hero_image_url,
      platform_og_image_url: row.platform_og_image_url,
      site_name: row.platform_name || row.site_name,
    }).eq("id", 1);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Branding saved");
  };

  const set = <K extends keyof Row>(k: K, v: Row[K]) => setRow((r) => ({ ...r, [k]: v }));

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <div className="font-bold">Platform identity</div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          These values replace the platform name and description across the app, bet vouchers, SEO metadata, and social share previews.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Platform name</label>
            <Input value={row.platform_name ?? ""} onChange={(e) => set("platform_name", e.target.value)} placeholder="ECB" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Tagline</label>
            <Input value={row.platform_tagline ?? ""} onChange={(e) => set("platform_tagline", e.target.value)} placeholder="E-Football Competition Bet" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Description (used on home, meta description, vouchers)</label>
          <Textarea rows={3} value={row.platform_description ?? ""} onChange={(e) => set("platform_description", e.target.value)} placeholder="Live virtual shooting matches, gang leaderboards, and token-only wagering." />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-bold">Logos</div>
        <p className="text-[11px] text-muted-foreground">Upload once, or paste a public image URL. Each slot falls back to the Main logo if left empty.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <ImageSettingControl label="Main logo (header, top-left)" value={row.platform_logo_url} onChange={(u) => set("platform_logo_url", u)} aspect="1 / 1" showFitControls={false} validation="logo-square" help="Auto-resized to 512x512. PNG/JPG/WEBP. Min 128x128." />
          <ImageSettingControl label="Corner logo (top-right, near bell/avatar)" value={row.platform_logo_corner_url} onChange={(u) => set("platform_logo_corner_url", u)} aspect="1 / 1" showFitControls={false} validation="logo-square" help="Shown next to notifications/avatar. Falls back to Main logo if empty." />
          <ImageSettingControl label="Auth pages logo (login/register header)" value={row.platform_logo_auth_url} onChange={(u) => set("platform_logo_auth_url", u)} aspect="1 / 1" showFitControls={false} validation="logo-square" />
          <ImageSettingControl label="Voucher / receipt logo" value={row.platform_logo_voucher_url} onChange={(u) => set("platform_logo_voucher_url", u)} aspect="1 / 1" showFitControls={false} validation="logo-square" />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-bold">Auth pages hero</div>
        <p className="text-[11px] text-muted-foreground">The large image on the left half of the login and create-account pages. Auto-resized to 1600x1200.</p>
        <ImageSettingControl
          label="Login / register hero image"
          value={row.auth_hero_image_url}
          onChange={(u) => set("auth_hero_image_url", u)}
          aspect="4 / 3"
          showFitControls={false}
          validation="auth-hero"
          help="Min 800x600. PNG/JPG/WEBP. Auto-cropped to fit."
        />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-bold">Social share (SEO)</div>
        <ImageSettingControl
          label="OG / social preview image"
          value={row.platform_og_image_url}
          onChange={(u) => set("platform_og_image_url", u)}
          aspect="1200 / 630"
          showFitControls={false}
          validation="og-social"
          help="Used by Facebook, Twitter, WhatsApp, and Slack link previews. 1200x630 recommended."
        />
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy} className="btn-luxury gap-2">
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save branding"}
        </Button>
      </div>
    </div>
  );
}
