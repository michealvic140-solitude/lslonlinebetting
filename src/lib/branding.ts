import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Branding = {
  name: string;
  tagline: string;
  description: string;
  logoUrl: string | null;
  logoAuthUrl: string | null;
  logoVoucherUrl: string | null;
  logoCornerUrl: string | null;
  authHeroUrl: string | null;
  ogImageUrl: string | null;
};

const DEFAULTS: Branding = {
  name: "ECB",
  tagline: "E-Football Competition Bet",
  description: "Live virtual shooting matches, gang leaderboards, and token-only wagering.",
  logoUrl: null,
  logoAuthUrl: null,
  logoVoucherUrl: null,
  logoCornerUrl: null,
  authHeroUrl: null,
  ogImageUrl: null,
};

let cache: Branding | null = null;
const listeners = new Set<(b: Branding) => void>();

function apply(row: any): Branding {
  return {
    name: row?.platform_name || row?.site_name || DEFAULTS.name,
    tagline: row?.platform_tagline || DEFAULTS.tagline,
    description: row?.platform_description || DEFAULTS.description,
    logoUrl: row?.platform_logo_url || null,
    logoAuthUrl: row?.platform_logo_auth_url || row?.platform_logo_url || null,
    logoVoucherUrl: row?.platform_logo_voucher_url || row?.platform_logo_url || null,
    logoCornerUrl: row?.platform_logo_corner_url || row?.platform_logo_url || null,
    authHeroUrl: row?.auth_hero_image_url || null,
    ogImageUrl: row?.platform_og_image_url || null,
  };
}

async function load(): Promise<Branding> {
  const { data } = await (supabase as any)
    .from("app_settings")
    .select("site_name,platform_name,platform_tagline,platform_description,platform_logo_url,platform_logo_auth_url,platform_logo_voucher_url,platform_logo_corner_url,auth_hero_image_url,platform_og_image_url")
    .eq("id", 1)
    .maybeSingle();
  cache = apply(data);
  listeners.forEach((l) => l(cache!));
  return cache;
}

let subscribed = false;
function ensureSub() {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  const ch = (supabase as any).channel("branding")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, (p: any) => {
      cache = apply(p.new);
      listeners.forEach((l) => l(cache!));
    })
    .subscribe();
  window.addEventListener("beforeunload", () => (supabase as any).removeChannel(ch));
}

export function useBranding(): Branding {
  const [b, setB] = useState<Branding>(cache ?? DEFAULTS);
  useEffect(() => {
    ensureSub();
    if (!cache) load().then(setB).catch(() => {});
    else setB(cache);
    const l = (v: Branding) => setB(v);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return b;
}
