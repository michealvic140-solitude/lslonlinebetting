import { useEffect, useState } from "react";

/**
 * Escalating daily-streak celebration. Every +10 days unlocks a hotter, more
 * elaborate flame tier so long-running streaks feel increasingly rewarding.
 */
const TIERS = [
  { min: 0,  emoji: "🔥", name: "Spark",   colors: ["#f59e0b", "#f97316"], glow: "rgba(249,115,22,0.55)", embers: 6,  rings: 1 },
  { min: 10, emoji: "🔥", name: "Blaze",   colors: ["#fb923c", "#ef4444"], glow: "rgba(239,68,68,0.6)",   embers: 10, rings: 2 },
  { min: 20, emoji: "🔥", name: "Inferno", colors: ["#f43f5e", "#f97316"], glow: "rgba(244,63,94,0.65)",  embers: 14, rings: 2 },
  { min: 30, emoji: "☄️", name: "Wildfire", colors: ["#a855f7", "#ef4444"], glow: "rgba(168,85,247,0.7)", embers: 18, rings: 3 },
  { min: 50, emoji: "🌋", name: "Molten",  colors: ["#22d3ee", "#f43f5e"], glow: "rgba(34,211,238,0.7)",  embers: 22, rings: 3 },
  { min: 100, emoji: "⚡", name: "Eternal", colors: ["#fde047", "#a855f7"], glow: "rgba(253,224,71,0.8)",  embers: 28, rings: 4 },
];

function tierFor(streak: number) {
  return [...TIERS].reverse().find((t) => streak >= t.min) ?? TIERS[0];
}

export function StreakFirePopout({ streak, reward, onDone }: { streak: number; reward: number; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const tier = tierFor(streak);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2600);
    const t2 = setTimeout(onDone, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[200] grid place-items-center streak-backdrop ${leaving ? "animate-fade-out" : ""}`}
      style={{ background: "radial-gradient(circle at 50% 60%, rgba(0,0,0,0.55), rgba(0,0,0,0.85))" }}
      onClick={() => { setLeaving(true); setTimeout(onDone, 250); }}
    >
      <div className="relative flex flex-col items-center">
        {/* expanding rings */}
        {Array.from({ length: tier.rings }).map((_, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full streak-ring"
            style={{ border: `2px solid ${tier.colors[0]}`, animationDelay: `${i * 0.18}s` }}
          />
        ))}
        {/* rising embers */}
        {Array.from({ length: tier.embers }).map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full streak-ember"
            style={{
              bottom: "38%",
              left: `${20 + Math.random() * 60}%`,
              width: `${4 + Math.random() * 7}px`,
              height: `${4 + Math.random() * 7}px`,
              background: tier.colors[i % 2],
              animationDelay: `${Math.random() * 0.9}s`,
              boxShadow: `0 0 8px ${tier.glow}`,
            }}
          />
        ))}
        {/* flame */}
        <div
          className="streak-flame text-[7rem] leading-none select-none"
          style={{ filter: `drop-shadow(0 0 30px ${tier.glow})` }}
        >
          {tier.emoji}
        </div>
        <div className="mt-2 text-center">
          <div
            className="text-5xl font-black leading-none"
            style={{
              backgroundImage: `linear-gradient(120deg, ${tier.colors[0]}, ${tier.colors[1]})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {streak}
          </div>
          <div className="mt-1 text-xs font-black uppercase tracking-[0.35em]" style={{ color: tier.colors[0] }}>
            {tier.name} · Day Streak
          </div>
          {reward > 0 && (
            <div className="mt-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-bold text-amber-200 backdrop-blur">
              +{reward.toLocaleString()} tokens claimed
            </div>
          )}
          <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">Tap to dismiss</div>
        </div>
      </div>
    </div>
  );
}
