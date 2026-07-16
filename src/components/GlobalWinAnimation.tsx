import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type WinBet = { id: string; tracking_id: string; potential_payout: number; settled_at: string | null };

// Stable "beat X% of users" figure derived from the ticket id (fudged, 88–97%).
function winPercent(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 88 + (h % 10);
}

export function GlobalWinAnimation() {
  const { user } = useAuth();
  const [win, setWin] = useState<WinBet | null>(null);

  useEffect(() => {
    if (!user) return;
    const seenKey = (id: string) => `lsl-win-seen-${id}`;
    const show = (bet: WinBet) => {
      if (!bet?.id || localStorage.getItem(seenKey(bet.id))) return;
      localStorage.setItem(seenKey(bet.id), "1");
      setWin(bet);
    };

    supabase.from("bets")
      .select("id,tracking_id,potential_payout,settled_at")
      .eq("user_id", user.id)
      .eq("status", "won")
      .order("settled_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .then(({ data }) => data?.[0] && show(data[0] as WinBet));

    const ch = supabase.channel(`global-wins-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bets", filter: `user_id=eq.${user.id}` }, (payload) => {
        const next: any = payload.new;
        const old: any = payload.old;
        if (next?.status === "won" && old?.status !== "won") show(next as WinBet);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!win) return null;
  const pct = winPercent(win.id);
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/92 backdrop-blur-md px-5 animate-fade-in">
      {/* Falling confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 28 }).map((_, i) => {
          const colors = ["#f5c518", "#ffd76a", "#10b981", "#34d399", "#e9e9e9"];
          const left = (i * 37) % 100;
          const delay = (i % 10) * 0.18;
          const dur = 2.6 + ((i * 13) % 20) / 10;
          const size = 6 + (i % 4) * 2;
          return (
            <span
              key={i}
              className="confetti-piece absolute top-0 rounded-[2px]"
              style={{
                left: `${left}%`,
                width: size,
                height: size * 1.6,
                background: colors[i % colors.length],
                animationDelay: `${delay}s`,
                animationDuration: `${dur}s`,
              }}
            />
          );
        })}
      </div>
      <button aria-label="Close win animation" onClick={() => setWin(null)} className="absolute right-5 top-5 rounded-full border border-border bg-card/80 p-2 text-foreground shadow-luxury">
        <X className="h-5 w-5" />
      </button>
      <div className="relative w-full max-w-sm text-center">
        <p className="win-text-rise text-xl font-bold text-foreground leading-snug">
          You have won more than <span className="text-emerald-400">{pct}%</span> of all users.
        </p>
        <h2 className="win-text-rise mt-3 font-display text-6xl md:text-7xl font-black tracking-tight bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(255,255,255,0.25)]" style={{ animationDelay: "0.08s" }}>YOU WON</h2>
        <div className="win-text-rise mt-1 text-4xl md:text-5xl font-black text-foreground tabular-nums" style={{ animationDelay: "0.16s" }}>{Number(win.potential_payout || 0).toLocaleString()}<span className="text-2xl ml-2 text-primary">TOKENS</span></div>

        {/* Realistic animated trophy */}
        <div className="relative mx-auto my-7 grid h-48 w-48 place-items-center">
          <div className="trophy-ring absolute inset-0 rounded-full border-2 border-amber-300/40" />
          <div className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,oklch(0.92_0.22_92/0.45),transparent_64%)] blur-2xl" />
          <RealisticTrophy />
          <Sparkles className="absolute -left-1 top-4 h-6 w-6 text-amber-200 animate-pulse" />
          <Sparkles className="absolute -right-1 bottom-6 h-5 w-5 text-amber-100 animate-pulse" style={{ animationDelay: "0.4s" }} />
          <Sparkles className="absolute right-6 -top-1 h-4 w-4 text-yellow-200 animate-pulse" style={{ animationDelay: "0.8s" }} />
        </div>
        <p className="win-text-rise text-sm font-bold text-muted-foreground" style={{ animationDelay: "0.24s" }}>Verify Code: <span className="font-mono text-emerald-400">{win.tracking_id}</span></p>
        <button onClick={() => setWin(null)} className="btn-luxury mt-6 w-full rounded-xl px-5 py-4 text-lg font-black">Continue</button>
      </div>
    </div>
  );
}

/* A layered, glossy gold trophy that pops and floats in. */
function RealisticTrophy() {
  return (
    <div className="trophy-pop relative">
      <div className="trophy-float relative grid place-items-center">
        <svg width="150" height="150" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]">
          <defs>
            <linearGradient id="goldCup" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff3c4" />
              <stop offset="28%" stopColor="#f7d260" />
              <stop offset="60%" stopColor="#d99a1c" />
              <stop offset="100%" stopColor="#a9700c" />
            </linearGradient>
            <linearGradient id="goldBase" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f7d873" />
              <stop offset="100%" stopColor="#9c6408" />
            </linearGradient>
            <radialGradient id="cupInner" cx="0.5" cy="0.2" r="0.8">
              <stop offset="0%" stopColor="#fff6d5" />
              <stop offset="100%" stopColor="#c98f1a" />
            </radialGradient>
          </defs>
          {/* handles */}
          <path d="M30 34 C10 34 10 62 34 66" stroke="url(#goldCup)" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M98 34 C118 34 118 62 94 66" stroke="url(#goldCup)" strokeWidth="7" fill="none" strokeLinecap="round" />
          {/* cup bowl */}
          <path d="M28 26 H100 V44 C100 70 84 84 64 84 C44 84 28 70 28 44 Z" fill="url(#goldCup)" />
          <path d="M35 30 H93 V44 C93 65 80 77 64 77 C48 77 35 65 35 44 Z" fill="url(#cupInner)" opacity="0.5" />
          {/* rim */}
          <rect x="24" y="20" width="80" height="9" rx="4.5" fill="url(#goldBase)" />
          {/* star */}
          <path d="M64 40 l3.5 7.1 7.8 1.1 -5.7 5.5 1.4 7.8 -7-3.7 -7 3.7 1.4 -7.8 -5.7 -5.5 7.8 -1.1 Z" fill="#fff4c2" opacity="0.9" />
          {/* stem */}
          <rect x="59" y="84" width="10" height="14" fill="url(#goldBase)" />
          {/* base tiers */}
          <rect x="44" y="98" width="40" height="8" rx="3" fill="url(#goldBase)" />
          <rect x="36" y="106" width="56" height="12" rx="4" fill="url(#goldBase)" />
        </svg>
        {/* moving gloss highlight */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <div className="trophy-shine absolute -top-2 left-0 h-full w-8 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </div>
      </div>
    </div>
  );
}
