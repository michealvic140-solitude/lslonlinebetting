import { useEffect, useState } from "react";
import { Download, Share, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "ecb-install-prompt-dismissed-at";
const DISMISS_DAYS = 7;

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-ignore iOS legacy
    (window.navigator as any).standalone === true
  );
}

function isIOSSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit;
}

export function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const fresh = Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    if (fresh) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS/Safari has no beforeinstallprompt; nudge with manual instructions.
    if (isIOSSafari()) {
      const t = setTimeout(() => setShowIOS(true), 3000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBIP);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
    setShowIOS(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") dismiss();
      else dismiss();
    } catch {
      dismiss();
    }
  };

  if (!show && !showIOS) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-[59] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md animate-in slide-in-from-bottom-6 fade-in duration-500">
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-card/95 to-card/80 backdrop-blur-xl shadow-[0_8px_40px_-8px_rgba(212,175,55,0.45)] p-4">
          <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5 h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <span className="shrink-0 grid place-items-center h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 shadow-[0_0_20px_-4px_rgba(212,175,55,0.6)]">
              <Smartphone className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0 pr-5">
              <div className="font-extrabold text-sm tracking-wide gradient-gold-text">Install ECB on your device</div>
              {show ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add the app to your home screen for fullscreen play, faster loading and reliable notifications.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tap <Share className="inline h-3.5 w-3.5 align-text-bottom" /> <b>Share</b> then <b>Add to Home Screen</b> to install ECB and unlock notifications.
                </p>
              )}
            </div>
          </div>
          {show && (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" className="btn-luxury flex-1 gap-1.5" onClick={install}>
                <Download className="h-3.5 w-3.5" />
                Install app
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
            </div>
          )}
          {showIOS && (
            <div className="mt-3 flex items-center justify-end">
              <Button size="sm" variant="ghost" onClick={dismiss}>Got it</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}