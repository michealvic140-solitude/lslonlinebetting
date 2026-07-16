import { supabase } from "@/integrations/supabase/client";

const CONSENT_KEY = "lsl-cookie-consent-v1";
const SESSION_KEY = "ecb-analytics-session";

export function hasCookieConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw);
    return v?.value === "accepted";
  } catch { return false; }
}

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) + "-" + Date.now();
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch { return "anon"; }
}

export async function trackEvent(event_type: string, meta: Record<string, any> = {}) {
  if (!hasCookieConsent()) return;
  try {
    const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : null;
    const referrer = typeof document !== "undefined" ? document.referrer || null : null;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const user_id = (await supabase.auth.getUser()).data.user?.id ?? null;
    await (supabase as any).from("analytics_events").insert({
      session_id: getSessionId(),
      user_id,
      event_type,
      path,
      referrer,
      user_agent: ua,
      meta,
    });
  } catch {}
}

let lastPath = "";
export function trackPageView() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname + window.location.search;
  if (path === lastPath) return;
  lastPath = path;
  void trackEvent("pageview", { title: document.title });
}