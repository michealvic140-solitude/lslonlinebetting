import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Crown, Trophy, Medal } from "lucide-react";

interface WinnerRow {
  user_id: string;
  total_won: number;
  ticket_count: number;
  full_name: string | null;
  ingame_name: string | null;
  gang_name: string | null;
  gang_type: "G" | "F" | null;
  avatar_url: string | null;
}

/**
 * Grand Prize Winners — leaderboard of users with the most tokens won across
 * settled bets. Excludes suspended / void / refunded tickets. Live updates via
 * realtime on bets table.
 */
export function GrandPrizeWinners() {
  const [rows, setRows] = useState<WinnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    // Pull all winning bets and aggregate client-side (small dataset; RLS-friendly)
    const { data: wins } = await supabase
      .from("bets")
      .select("user_id, potential_payout, cashout_amount, status")
      .in("status", ["won", "cashed_out"]);
    const totals = new Map<string, { total: number; count: number }>();
    (wins ?? []).forEach((b: any) => {
      const credit = Number(b.cashout_amount ?? b.potential_payout ?? 0);
      if (!credit) return;
      const cur = totals.get(b.user_id) ?? { total: 0, count: 0 };
      cur.total += credit;
      cur.count += 1;
      totals.set(b.user_id, cur);
    });
    const ids = Array.from(totals.keys());
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, ingame_name, gang_name, gang_type, avatar_url")
      .in("id", ids);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const out: WinnerRow[] = ids
      .map((id) => ({
        user_id: id,
        total_won: totals.get(id)!.total,
        ticket_count: totals.get(id)!.count,
        full_name: profMap.get(id)?.full_name ?? null,
        ingame_name: profMap.get(id)?.ingame_name ?? null,
        gang_name: profMap.get(id)?.gang_name ?? null,
        gang_type: profMap.get(id)?.gang_type ?? null,
        avatar_url: profMap.get(id)?.avatar_url ?? null,
      }))
      .sort((a, b) => b.total_won - a.total_won)
      .slice(0, 25);
    setRows(out);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("grand-prize-winners")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <Card className="glass overflow-hidden border-primary/30">
      <div className="relative px-3 py-3 border-b border-border/60 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-gradient-gold text-primary-foreground grid place-items-center shadow-gold">
            <Crown className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Hall of fame</div>
            <div className="font-display text-base font-bold gradient-gold-text">Grand Prize Winners</div>
          </div>
        </div>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        {loading && <div className="p-4 text-xs text-muted-foreground">Loading winners…</div>}
        {!loading && rows.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">No winning tickets yet — be the first to claim glory.</div>
        )}
        <ol className="divide-y divide-border/40">
          {rows.map((w, i) => {
            const rank = i + 1;
            const RankIcon = rank === 1 ? Crown : rank === 2 ? Trophy : rank === 3 ? Medal : null;
            const rankCls =
              rank === 1
                ? "from-yellow-300 to-amber-500 text-black shadow-gold"
                : rank === 2
                ? "from-zinc-200 to-zinc-400 text-black"
                : rank === 3
                ? "from-amber-700 to-amber-900 text-amber-50"
                : "from-secondary to-muted text-muted-foreground";
            return (
              <li key={w.user_id} className="px-3 py-2.5 flex items-center gap-2 hover:bg-primary/5 transition-colors">
                <span
                  className={`relative h-7 w-7 shrink-0 rounded-full bg-gradient-to-br ${rankCls} grid place-items-center text-[11px] font-black`}
                >
                  {RankIcon ? <RankIcon className="h-3.5 w-3.5" /> : rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">
                    {w.ingame_name || w.full_name || "Player"}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {w.gang_name ? (
                      <span>
                        {w.gang_type === "G" ? "Gang" : w.gang_type === "F" ? "Faction" : "Crew"} · {w.gang_name}
                      </span>
                    ) : (
                      <span>Independent</span>
                    )}
                    <span className="ml-1">· {w.ticket_count} win{w.ticket_count === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Won</div>
                  <div className="font-mono font-black text-xs gradient-gold-text">
                    {w.total_won.toLocaleString()}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
