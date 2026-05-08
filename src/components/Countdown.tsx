import { useEffect, useState } from "react";

export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="font-mono tabular-nums opacity-60">--:--</span>;
  const diff = Math.max(0, new Date(target).getTime() - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  if (diff === 0) return <span className="text-emerald font-bold">Starting…</span>;
  return (
    <span className="font-mono tabular-nums">
      {h > 0 && <>{h}h </>}
      {m.toString().padStart(2, "0")}m {s.toString().padStart(2, "0")}s
    </span>
  );
}
