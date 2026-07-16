import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent, trackPageView } from "@/lib/analytics";

const KEY = "lsl-cookie-consent-v1";

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        const t = setTimeout(() => setShow(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const persist = (value: "accepted" | "rejected") => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ value, at: new Date().toISOString() }));
      document.cookie = `lsl_cookie_consent=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch {}
    if (value === "accepted") {
      void trackEvent("cookie_consent", { value });
      trackPageView();
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[110] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-2xl animate-in slide-in-from-bottom-6 fade-in duration-500">
        <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-card/95 to-card/90 backdrop-blur-xl shadow-[0_10px_40px_-8px_rgba(212,175,55,0.55)] p-4 sm:p-5">
          <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
          <button
            onClick={() => persist("rejected")}
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5 h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <span className="shrink-0 grid place-items-center h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 shadow-[0_0_20px_-4px_rgba(212,175,55,0.6)]">
              <Cookie className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0 pr-6">
              <div className="font-extrabold text-sm tracking-wide gradient-gold-text">We use cookies</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                We use cookies to keep you signed in, remember your preferences, and improve
                your experience on the platform. You can accept or reject non-essential cookies.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" className="btn-luxury flex-1 min-w-[8rem]" onClick={() => persist("accepted")}>
              Accept cookies
            </Button>
            <Button size="sm" variant="ghost" onClick={() => persist("rejected")}>
              Reject
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}