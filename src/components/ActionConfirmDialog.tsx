import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

type ActionMsg = { id: number; title: string; description?: string };

/**
 * Listens for global "admin:action-confirmed" events and shows a bold,
 * non-blocking success banner at the top-left of the page so the admin can
 * keep working. Banners auto-dismiss after a few seconds and stack when
 * fired in rapid succession.
 */
export function ActionConfirmDialog() {
  const [msgs, setMsgs] = useState<ActionMsg[]>([]);

  useEffect(() => {
    let seq = 0;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Omit<ActionMsg, "id"> | undefined;
      if (!detail?.title) return;
      const id = ++seq;
      setMsgs((q) => [...q, { ...detail, id }]);
      setTimeout(() => setMsgs((q) => q.filter((m) => m.id !== id)), 3500);
    };
    window.addEventListener("admin:action-confirmed", handler);
    return () => window.removeEventListener("admin:action-confirmed", handler);
  }, []);

  if (!msgs.length) return null;
  return (
    <div className="fixed top-4 left-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-[min(92vw,380px)]">
      {msgs.map((m) => (
        <div
          key={m.id}
          className="pointer-events-auto relative overflow-hidden rounded-2xl border border-emerald-400/40 bg-background/85 backdrop-blur-xl shadow-2xl animate-fade-in"
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600" />
          <div className="flex items-start gap-3 pl-5 pr-3 py-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-emerald-500/20 grid place-items-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black tracking-tight text-foreground">{m.title}</div>
              {m.description && (
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{m.description}</div>
              )}
            </div>
            <button
              onClick={() => setMsgs((q) => q.filter((x) => x.id !== m.id))}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}