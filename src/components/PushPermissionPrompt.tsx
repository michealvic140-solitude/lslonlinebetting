import { useEffect, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getPushState, subscribeToPush, pushSupported, syncExistingPushSubscription } from "@/lib/push";
import { toast } from "sonner";

const DISMISS_KEY = "lsl-push-prompt-dismissed-at";
const DISMISS_DAYS = 7;

export function PushPermissionPrompt() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !pushSupported()) return;
    let alive = true;
    (async () => {
      // If this browser already allowed notifications, keep the DB record alive
      // silently and do not keep asking after every refresh.
      if (Notification.permission === "granted") {
        await syncExistingPushSubscription(user.id);
        if (!alive) return;
        setShow(false);
        return;
      }
      const state = await getPushState();
      if (!alive) return;
      if (state === "subscribed" || state === "denied" || state === "unsupported") return;
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      const fresh = Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
      if (fresh) return;
      // Give the page a moment before sliding in.
      const t = setTimeout(() => alive && setShow(true), 2500);
      return () => clearTimeout(t);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const enable = async () => {
    if (!user) return;
    setBusy(true);
    const res = await subscribeToPush(user.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Notifications enabled! You'll get real-time updates.");
      setShow(false);
    } else {
      toast.error(res.error || "Could not enable notifications.");
      if ((res.error || "").toLowerCase().includes("permission")) dismiss();
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4 pointer-events-none">
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
              <BellRing className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0 pr-5">
              <div className="font-extrabold text-sm tracking-wide gradient-gold-text">Stay in the game</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Turn on push notifications to get real-time alerts for results, wins, and big matches — right on your device.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" className="btn-luxury flex-1 gap-1.5" disabled={busy} onClick={enable}>
              <Bell className="h-3.5 w-3.5" />
              {busy ? "Enabling…" : "Allow notifications"}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
          </div>
        </div>
      </div>
    </div>
  );
}