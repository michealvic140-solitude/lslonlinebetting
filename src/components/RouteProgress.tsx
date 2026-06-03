import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Centered spinner overlay that shows while TanStack Router is loading
 * the next route. Has a safety timeout so it can never get stuck on
 * screen if a navigation signal is missed.
 */
export function RouteProgress() {
  const status = useRouterState({ select: (s) => s.status });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | null = null;
    let safety: ReturnType<typeof setTimeout> | null = null;
    if (status === "pending") {
      setVisible(true);
      // Hard cap so the spinner can never stick on screen.
      safety = setTimeout(() => setVisible(false), 6000);
    } else {
      hide = setTimeout(() => setVisible(false), 160);
    }
    return () => {
      if (hide) clearTimeout(hide);
      if (safety) clearTimeout(safety);
    };
  }, [status]);

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[200] pointer-events-none grid place-items-center">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-amber-300 animate-spin"
          style={{ boxShadow: "0 0 18px oklch(0.82 0.22 88 / 0.55)" }}
        />
      </div>
    </div>
  );
}