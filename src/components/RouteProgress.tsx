import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import ecbLogo from "@/assets/ecb-logo.png.asset.json";
const lslLogo = ecbLogo.url;

/**
 * Centered overlay that shows the platform logo spinning while TanStack
 * Router loads the next route. Has a safety timeout so it can never get
 * stuck on screen if a navigation signal is missed.
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
    <div className="fixed inset-0 z-[200] pointer-events-none grid place-items-center bg-background/40 backdrop-blur-[2px]">
      <div className="relative h-20 w-20">
        {/* glow ring tracking the spin */}
        <div
          className="absolute -inset-2 rounded-full border-2 border-transparent border-t-primary border-r-amber-300/70 animate-spin"
          style={{ animationDuration: "1.1s", boxShadow: "0 0 22px oklch(0.82 0.22 88 / 0.45)" }}
        />
        {/* platform logo spinning */}
        <img
          src={lslLogo}
          alt="Loading"
          className="absolute inset-0 h-full w-full object-contain animate-spin drop-shadow-[0_0_18px_rgba(212,175,55,0.55)]"
          style={{ animationDuration: "1.6s" }}
        />
      </div>
    </div>
  );
}