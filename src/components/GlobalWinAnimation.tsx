import { useEffect, useState } from "react";
import { Trophy, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import lslLogo from "@/assets/lsl-logo.png";

type WinBet = { id: string; tracking_id: string; potential_payout: number; settled_at: string | null };

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
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-background/82 backdrop-blur-md px-5 animate-fade-in">
      <button aria-label="Close win animation" onClick={() => setWin(null)} className="absolute right-5 top-5 rounded-full border border-border bg-card/80 p-2 text-foreground shadow-luxury">
        <X className="h-5 w-5" />
      </button>
      <div className="relative w-full max-w-sm text-center">
        <div className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,oklch(0.92_0.22_92/0.45),transparent_62%)] blur-2xl animate-pulse" />
        <div className="mx-auto mb-4 grid h-40 w-40 place-items-center rounded-full border border-primary/50 bg-gradient-luxury shadow-gold">
          <img src={lslLogo} alt="LSL" className="h-24 w-24 object-contain drop-shadow-2xl" />
        </div>
        <div className="flex items-center justify-center gap-2 text-primary"><Sparkles className="h-5 w-5" /><Trophy className="h-9 w-9" /><Sparkles className="h-5 w-5" /></div>
        <h2 className="mt-2 font-display text-6xl font-black tracking-normal text-[oklch(0.95_0.22_105)] drop-shadow-[0_0_18px_oklch(0.82_0.22_88/0.75)]">YOU WON</h2>
        <div className="mt-4 text-3xl font-black text-foreground">{Number(win.potential_payout || 0).toLocaleString()} TOKENS</div>
        <p className="mt-2 text-sm text-muted-foreground">Ticket {win.tracking_id} · Lomita Shooters League</p>
        <button onClick={() => setWin(null)} className="btn-luxury mt-7 w-full rounded-xl px-5 py-4 text-lg font-black">Continue</button>
      </div>
    </div>
  );
}
