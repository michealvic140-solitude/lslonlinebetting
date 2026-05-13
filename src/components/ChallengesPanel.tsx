import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Gift, Trophy, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function ChallengesPanel() {
  const { user, profile, refresh } = useAuth();
  const [challenges, setChallenges] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [claiming, setClaiming] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const claimedToday = profile?.last_login_date === today;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: c } = await supabase.from("challenges").select("*").eq("is_active", true).order("kind");
      const { data: p } = await supabase.from("user_challenge_progress").select("*").eq("user_id", user.id);
      setChallenges(c ?? []);
      const map: Record<string, any> = {};
      (p ?? []).forEach((x: any) => { map[x.challenge_id] = x; });
      setProgress(map);
    };
    load();
    const ch = supabase.channel(`ucp-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_challenge_progress", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  async function claimDaily() {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_daily_login");
    setClaiming(false);
    if (error) return toast.error(error.message);
    const r = data as any;
    if (r?.already_claimed) toast.info("Already claimed today");
    else toast.success(`+${r.reward.toLocaleString()} tokens · Day ${r.streak} streak 🔥`);
    await refresh();
  }

  async function claim(p: any) {
    const { data, error } = await supabase.rpc("claim_challenge", { _progress_id: p.id });
    if (error) return toast.error(error.message);
    const r = data as any;
    toast.success(`+${r.reward.toLocaleString()} tokens claimed!`);
    await refresh();
  }

  return (
    <Card className="glass p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-300" />
        <div className="font-bold tracking-widest text-sm">CHALLENGES & STREAK</div>
      </div>

      {/* Daily login */}
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-amber-300 flex items-center gap-1">
              <Flame className="h-3 w-3" /> Login streak
            </div>
            <div className="text-3xl font-extrabold gradient-gold-text leading-none mt-1">
              {profile?.streak_days ?? 0} <span className="text-sm text-muted-foreground font-normal">days</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Best: {profile?.longest_streak ?? 0} · multiplier {(1 + Math.min(profile?.streak_days ?? 0, 30) * 0.1).toFixed(1)}x
            </div>
          </div>
          <Button onClick={claimDaily} disabled={claiming || claimedToday} className="btn-luxury">
            {claimedToday ? <><CheckCircle2 className="h-4 w-4 mr-1" />Claimed</> : <><Gift className="h-4 w-4 mr-1" />Claim</>}
          </Button>
        </div>
      </div>

      {/* Challenges list */}
      <div className="space-y-2">
        {challenges.filter(c => c.kind !== "login").length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No active challenges right now.</p>
        )}
        {challenges.filter(c => c.kind !== "login").map((c) => {
          const p = progress[c.id];
          const pct = Math.min(100, ((p?.progress ?? 0) / Math.max(1, c.target_count)) * 100);
          const done = p?.completed_at && !p?.claimed_at;
          return (
            <div key={c.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={c.kind === "weekly" ? "border-purple-400/40 text-purple-300" : "border-emerald-400/40 text-emerald-300"}>
                      {c.kind.toUpperCase()}
                    </Badge>
                    <div className="font-bold text-sm truncate">{c.title}</div>
                  </div>
                  {c.description && <div className="text-[11px] text-muted-foreground mt-0.5">{c.description}</div>}
                  <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
                    <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {(p?.progress ?? 0)}/{c.target_count} · reward {c.reward_tokens.toLocaleString()} tokens
                  </div>
                </div>
                {done && (
                  <Button size="sm" className="btn-luxury h-7" onClick={() => claim(p)}><Trophy className="h-3 w-3 mr-1" />Claim</Button>
                )}
                {p?.claimed_at && <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-1" />}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}