import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

type ActionMsg = { title: string; description?: string };

/**
 * Listens for global "admin:action-confirmed" events (fired via notifyAction)
 * and shows a pop-out confirmation dialog for each one. Messages queue so
 * rapid successive actions are each acknowledged.
 */
export function ActionConfirmDialog() {
  const [queue, setQueue] = useState<ActionMsg[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ActionMsg | undefined;
      if (!detail?.title) return;
      setQueue((q) => [...q, detail]);
    };
    window.addEventListener("admin:action-confirmed", handler);
    return () => window.removeEventListener("admin:action-confirmed", handler);
  }, []);

  const current = queue[0] ?? null;
  const close = () => setQueue((q) => q.slice(1));

  return (
    <Dialog open={!!current} onOpenChange={(o) => !o && close()}>
      <DialogContent className="glass-strong border-primary/30 max-w-sm backdrop-blur-2xl shadow-luxury overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-gold" />
        <DialogHeader>
          <div className="h-12 w-12 rounded-full grid place-items-center mb-2 bg-emerald-500/20">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
          <DialogTitle className="text-xl">{current?.title}</DialogTitle>
          {current?.description && (
            <DialogDescription className="text-sm text-muted-foreground">{current.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" onClick={close}>
            {queue.length > 1 ? `Next (${queue.length - 1} more)` : "Got it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}