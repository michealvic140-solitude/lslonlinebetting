import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Top-of-page progress bar that shows while TanStack Router is loading
 * the next route (preloading data + lazy chunks). Gives every click a
 * clear "loading the next page" beat instead of a silent jump.
 */
export function RouteProgress() {
  const status = useRouterState({ select: (s) => s.status });
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (status === "pending") {
      setVisible(true);
      setWidth(8);
      const grow = () => {
        setWidth((w) => (w < 88 ? w + (90 - w) * 0.05 : w));
        raf = requestAnimationFrame(grow);
      };
      raf = requestAnimationFrame(grow);
    } else {
      setWidth(100);
      timeout = setTimeout(() => { setVisible(false); setWidth(0); }, 220);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timeout) clearTimeout(timeout);
    };
  }, [status]);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[200] h-[3px] bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-primary via-amber-300 to-primary shadow-[0_0_10px_oklch(0.82_0.22_88/0.7)]"
        style={{ width: `${width}%`, transition: "width 180ms ease-out, opacity 200ms" }}
      />
    </div>
  );
}