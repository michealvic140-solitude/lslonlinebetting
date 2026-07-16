import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Crosshair, Trophy, X } from "lucide-react";
import { toast } from "sonner";

type KickResult = {
  home_kicks: boolean[];
  away_kicks: boolean[];
  home_score: number;
  away_score: number;
  result: "won" | "lost";
  payout: number;
};

/**
 * Private per-user shootout. Sits on top of the shared Instant Virtual arena
 * so any user can spin up their own quick 5-kick round anytime.
 */
export function UserVirtualRoundDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [home, setHome] = useState("Alpha");
  const [away, setAway] = useState("Bravo");
  const [side, setSide] = useState<"home" | "away">("home");
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KickResult | null>(null);
  const [kickIdx, setKickIdx] = useState(-1);

  const play = async () => {
    if (!user) return toast.error("Sign in to play");
    if (stake <= 0) return toast.error("Stake must be positive");
    setBusy(true);
    setResult(null);
    setKickIdx(-1);
    const { data, error } = await (supabase as any).rpc("start_user_virtual_round", {
      p_home: home, p_away: away, p_side: side, p_stake: stake,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data as KickResult;
    setResult(r);
    // Animate kicks one-by-one
    let i = 0;
    const total = Math.max(r.home_kicks.length, r.away_kicks.length);
    const timer = setInterval(() => {
      setKickIdx(i);
      i++;
      if (i >= total) {
        clearInterval(timer);
        setTimeout(() => {
          if (r.result === "won") toast.success(`Won ${r.payout.toLocaleString()} ECB`);
          else toast.error("Better luck next round");
        }, 400);
      }
    }, 700);
  };

  const reset = () => { setResult(null); setKickIdx(-1); };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Card className="virtual-panel p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-primary/60 transition">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-gold grid place-items-center shadow-gold">
              <Crosshair className="h-5 w-5 text-background" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base">Start my private round</div>
              <div className="text-[11px] text-muted-foreground">Personal 5-kick shootout · 1.9x payout</div>
            </div>
          </div>
          <Button size="sm" className="btn-luxury">Play now</Button>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="gradient-gold-text font-display text-2xl">Private Shootout</DialogTitle>
        </DialogHeader>
        {!result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Home team</Label><Input value={home} onChange={(e) => setHome(e.target.value)} /></div>
              <div><Label>Away team</Label><Input value={away} onChange={(e) => setAway(e.target.value)} /></div>
            </div>
            <div>
              <Label>Pick a side</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button variant={side === "home" ? "default" : "outline"} onClick={() => setSide("home")}>{home || "Home"}</Button>
                <Button variant={side === "away" ? "default" : "outline"} onClick={() => setSide("away")}>{away || "Away"}</Button>
              </div>
            </div>
            <div>
              <Label>Stake (ECB)</Label>
              <Input type="number" min={1} value={stake} onChange={(e) => setStake(Number(e.target.value) || 0)} />
              <div className="text-[11px] text-muted-foreground mt-1">Payout: {(stake * 1.9).toFixed(0)} ECB if your side wins</div>
            </div>
            <Button className="btn-luxury w-full" disabled={busy} onClick={play}>{busy ? "Placing…" : "Kick off"}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Score</div>
              <div className="font-display text-5xl font-black tabular-nums">
                {result.home_score} <span className="text-muted-foreground">:</span> {result.away_score}
              </div>
            </div>
            <div className="space-y-2">
              <KickRow label={home} kicks={result.home_kicks} upto={kickIdx} />
              <KickRow label={away} kicks={result.away_kicks} upto={kickIdx} />
            </div>
            {kickIdx >= Math.max(result.home_kicks.length, result.away_kicks.length) - 1 && (
              <div className={`text-center p-4 rounded-xl border ${result.result === "won" ? "border-emerald-500/50 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10"}`}>
                {result.result === "won" ? (
                  <div className="flex items-center justify-center gap-2 text-emerald-300 font-black">
                    <Trophy className="h-5 w-5" /> You won {result.payout.toLocaleString()} ECB
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-destructive font-black">
                    <X className="h-5 w-5" /> Lost
                  </div>
                )}
                <Button variant="outline" className="mt-3" onClick={reset}>Play again</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KickRow({ label, kicks, upto }: { label: string; kicks: boolean[]; upto: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 text-xs font-bold truncate">{label}</div>
      <div className="flex gap-1.5">
        {kicks.map((k, i) => {
          const shown = i <= upto;
          return (
            <div
              key={i}
              className={`h-6 w-6 rounded-full grid place-items-center text-[10px] font-black transition-all ${
                !shown ? "bg-muted/30 text-muted-foreground/40" : k ? "bg-emerald-500/30 text-emerald-200 border border-emerald-400/40" : "bg-destructive/25 text-destructive border border-destructive/40"
              }`}
            >
              {shown ? (k ? "✓" : "✗") : "·"}
            </div>
          );
        })}
      </div>
    </div>
  );
}