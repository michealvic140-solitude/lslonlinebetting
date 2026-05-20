import { ReactNode, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

export function DraggableFab({
  storageKey,
  defaultSide = "right",
  ariaLabel,
  onClick,
  children,
  className = "",
}: {
  storageKey: string;
  defaultSide?: "left" | "right";
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<Point | null>(null);
  const drag = useRef<{ start: Point; origin: Point; moved: boolean } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setPos(constrain(JSON.parse(saved))); return; } catch {}
    }
    setPos(constrain({ x: defaultSide === "left" ? 16 : window.innerWidth - 196, y: window.innerHeight - 112 }));
  }, [defaultSide, storageKey]);

  useEffect(() => {
    const onResize = () => setPos((p) => p ? constrain(p) : p);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const point = pos ?? { x: defaultSide === "left" ? 16 : 16, y: 120 };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => { if (!drag.current?.moved) onClick(); }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        drag.current = { start: { x: e.clientX, y: e.clientY }, origin: point, moved: false };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.start.x;
        const dy = e.clientY - drag.current.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
        setPos(constrain({ x: drag.current.origin.x + dx, y: drag.current.origin.y + dy }));
      }}
      onPointerUp={() => {
        if (pos) localStorage.setItem(storageKey, JSON.stringify(constrain(pos)));
        setTimeout(() => { drag.current = null; }, 0);
      }}
      className={`fixed z-30 touch-none select-none ${className}`}
      style={{ left: point.x, top: point.y }}
    >
      {children}
    </button>
  );
}

function constrain(p: Point): Point {
  if (typeof window === "undefined") return p;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - 190);
  const maxY = Math.max(72, window.innerHeight - 104);
  return {
    x: Math.min(Math.max(p.x, margin), maxX),
    y: Math.min(Math.max(p.y, 72), maxY),
  };
}