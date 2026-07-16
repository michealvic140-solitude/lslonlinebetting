import { useEffect, useState } from "react";
import { X, Skull } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type LostBet = { id: string; tracking_id: string; stake: number; settled_at: string | null };

// Stable "worse than X% of users" figure derived from ticket id (60–85%).
function lossPercent(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 60 + (h % 26);
}

export function GlobalLossAnimation() {
  const { user } = useAuth();
  const [loss, setLoss] = useState<LostBet | null>(null);

  useEffect(() => {
    if (!user) return;
    const seenKey = (id: string) => `lsl-loss-seen-${id}`;
    const show = (bet: LostBet) => {
      if (!bet?.id || localStorage.getItem(seenKey(bet.id))) return;
      localStorage.setItem(seenKey(bet.id), "1");
      setLoss(bet);
    };

    supabase.from("bets")
      .select("id,tracking_id,stake,settled_at")
      .eq("user_id", user.id)
      .eq("status", "lost")
      .order("settled_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .then(({ data }) => data?.[0] && show(data[0] as LostBet));

    const ch = supabase.channel(`global-loss-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bets", filter: `user_id=eq.${user.id}` }, (payload) => {
        const next: any = payload.new;
        const old: any = payload.old;
        if (next?.status === "lost" && old?.status !== "lost") show(next as LostBet);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!loss) return null;
  const pct = lossPercent(loss.id);
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/94 backdrop-blur-md px-5 animate-fade-in">
      {/* Falling ash / broken shards */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 24 }).map((_, i) => {
          const colors = ["#4b5563", "#374151", "#7f1d1d", "#991b1b", "#1f2937"];
          const left = (i * 41) % 100;
          const delay = (i % 10) * 0.22;
          const dur = 3.2 + ((i * 17) % 22) / 10;
          const size = 4 + (i % 4) * 2;
          return (
            <span
              key={i}
              className="ash-piece absolute top-0 rounded-[1px]"
              style={{
                left: `${left}%`,
                width: size,
                height: size * 1.4,
                background: colors[i % colors.length],
                animationDelay: `${delay}s`,
                animationDuration: `${dur}s`,
                opacity: 0.75,
              }}
            />
          );
        })}
      </div>
      <button aria-label="Close" onClick={() => setLoss(null)} className="absolute right-5 top-5 rounded-full border border-border bg-card/80 p-2 text-foreground shadow-luxury">
        <X className="h-5 w-5" />
      </button>
      <div className="relative w-full max-w-sm text-center">
        <p className="loss-text-rise text-xl font-bold text-foreground/90 leading-snug">
          You lost worse than <span className="text-rose-400">{pct}%</span> of players today.
        </p>
        <h2 className="loss-text-rise mt-3 font-display text-6xl md:text-7xl font-black tracking-tight bg-gradient-to-b from-zinc-100 to-rose-700 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(190,18,60,0.35)]" style={{ animationDelay: "0.08s" }}>YOU LOST</h2>
        <div className="loss-text-rise mt-1 text-4xl md:text-5xl font-black text-foreground tabular-nums" style={{ animationDelay: "0.16s" }}>
          -{Number(loss.stake || 0).toLocaleString()}<span className="text-2xl ml-2 text-rose-400">TOKENS</span>
        </div>

        {/* Cracked skull medallion */}
        <div className="relative mx-auto my-7 grid h-48 w-48 place-items-center">
          <div className="loss-ring absolute inset-0 rounded-full border-2 border-rose-500/40" />
          <div className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,rgba(190,18,60,0.45),transparent_64%)] blur-2xl" />
          <CrackedSkull />
          <span className="absolute -left-1 top-4 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse" />
          <span className="absolute -right-1 bottom-6 h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.8)] animate-pulse" style={{ animationDelay: "0.4s" }} />
        </div>
        <p className="loss-text-rise text-sm font-bold text-muted-foreground" style={{ animationDelay: "0.24s" }}>Ticket: <span className="font-mono text-rose-400">{loss.tracking_id}</span></p>
        <button onClick={() => setLoss(null)} className="mt-6 w-full rounded-xl px-5 py-4 text-lg font-black bg-gradient-to-b from-rose-600 to-rose-800 hover:from-rose-500 hover:to-rose-700 text-white shadow-[0_10px_30px_-8px_rgba(190,18,60,0.7)] transition">
          Try Again
        </button>
      </div>
    </div>
  );
}

/* A glossy dark skull with a crack that draws in. */
function CrackedSkull() {
  return (
    <div className="skull-pop relative">
      <div className="skull-shake relative grid place-items-center">
        <svg width="150" height="150" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_10px_16px_rgba(0,0,0,0.6)]">
          <defs>
            <radialGradient id="skullBody" cx="0.5" cy="0.35" r="0.75">
              <stop offset="0%" stopColor="#f4f4f5" />
              <stop offset="55%" stopColor="#a1a1aa" />
              <stop offset="100%" stopColor="#3f3f46" />
            </radialGradient>
            <radialGradient id="skullEye" cx="0.5" cy="0.5" r="0.6">
              <stop offset="0%" stopColor="#7f1d1d" />
              <stop offset="60%" stopColor="#1c1917" />
              <stop offset="100%" stopColor="#000" />
            </radialGradient>
          </defs>
          {/* skull dome */}
          <path d="M28 58 C28 30 46 18 64 18 C82 18 100 30 100 58 C100 72 94 80 88 84 L88 96 L78 100 L78 108 L70 108 L70 100 L58 100 L58 108 L50 108 L50 100 L40 96 L40 84 C34 80 28 72 28 58 Z" fill="url(#skullBody)" />
          {/* jaw teeth */}
          <path d="M42 92 L44 100 L50 100 L52 92 L58 100 L64 92 L70 100 L76 92 L78 100 L84 92" stroke="#27272a" strokeWidth="2" fill="none" strokeLinejoin="round" />
          {/* eyes */}
          <ellipse cx="48" cy="58" rx="10" ry="12" fill="url(#skullEye)" />
          <ellipse cx="80" cy="58" rx="10" ry="12" fill="url(#skullEye)" />
          {/* nose */}
          <path d="M62 68 L66 68 L64 80 Z" fill="#18181b" />
          {/* crack (draws in) */}
          <path
            d="M50 24 L54 34 L48 42 L58 50 L54 60 L64 66"
            stroke="#dc2626"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
            className="skull-crack"
            pathLength={1}
          />
        </svg>
        {/* moving red gloss */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <div className="skull-shine absolute -top-2 left-0 h-full w-8 bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
        </div>
      </div>
    </div>
  );
}
