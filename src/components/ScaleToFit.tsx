import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * Scales a fixed-size canvas to fill the available width (never scrolls) and
 * collapses its own height to the scaled content so there is no empty space
 * above/below the canvas. `maxScale` caps growth on very wide screens.
 */
export function ScaleToFit({ width, height, children, className, maxScale = 1.6 }: { width: number; height: number; children: ReactNode; className?: string; maxScale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const recompute = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      setScale(Math.min(w / width, maxScale));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height, maxScale]);

  return (
    <div ref={ref} className={`w-full overflow-hidden ${className ?? ""}`} style={{ height: height * scale }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}