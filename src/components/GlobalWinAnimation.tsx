import { useEffect, useState } from "react";
import { Trophy, X, Sparkles } from "lucide-react";
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
      <button aria-label="Close win animation" onClick={() => setWin(null)} className="absolute right-5 top-5 rounded-full border border-border bg-card/80 p-2 text-foreground shadow-luxury">
        <X className="h-5 w-5" />
      </button>
      <div className="relative w-full max-w-sm text-center">
        <p className="text-xl font-bold text-foreground leading-snug">
          You have won more than <span className="text-emerald-400">{pct}%</span> of all users.
        </p>
        <h2 className="mt-3 font-display text-6xl md:text-7xl font-black tracking-tight bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(255,255,255,0.25)]">YOU WON</h2>
        <div className="mt-1 text-4xl md:text-5xl font-black text-foreground tabular-nums">{Number(win.potential_payout || 0).toLocaleString()}<span className="text-2xl ml-2 text-primary">TOKENS</span></div>
        <div className="relative mx-auto my-6 grid h-44 w-44 place-items-center">
          <div className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,oklch(0.92_0.22_92/0.55),transparent_62%)] blur-2xl animate-pulse" />
          <div className="grid h-40 w-40 place-items-center rounded-full border border-primary/50 bg-gradient-luxury shadow-gold">
            <Trophy className="h-24 w-24 text-[oklch(0.6_0.13_70)]" />
          </div>
          <Sparkles className="absolute -left-2 top-3 h-6 w-6 text-amber-200 animate-pulse" />
          <Sparkles className="absolute -right-2 bottom-4 h-5 w-5 text-amber-200 animate-pulse" />
        </div>
        <p className="text-sm font-bold text-muted-foreground">Verify Code: <span className="font-mono text-emerald-400">{win.tracking_id}</span></p>
        <button onClick={() => setWin(null)} className="btn-luxury mt-6 w-full rounded-xl px-5 py-4 text-lg font-black">Continue</button>
      </div>
    </div>
  );
}
