import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Flame, Trophy } from "lucide-react";

interface Row {
  user_id: string;
  total_won: number;
  total_staked: number;
  total_funded: number;
  score: number;
  full_name: string | null;
  ingame_name: string | null;
  avatar_url: string | null;
}

/**
 * Top Bets — leaderboard of users ranked by total points from won, staked and funded tokens.
 * Scrollable; live-refreshes when bets change.
 */
export function TopBetsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("bets")
      .select("user_id, stake, potential_payout, cashout_amount, status");
    const totals = new Map<string, { won: number; staked: number; funded: number }>();
    (data ?? []).forEach((b: any) => {
      const cur = totals.get(b.user_id) ?? { won: 0, staked: 0, funded: 0 };
      cur.staked += Number(b.stake ?? 0);
      if (b.status === "won" || b.status === "cashed_out") {
        cur.won += Number(b.cashout_amount ?? b.potential_payout ?? 0);
      }
      totals.set(b.user_id, cur);
    });
    const { data: funded } = await supabase
      .from("token_requests")
      .select("user_id, amount, status")
      .eq("status", "approved");
    (funded ?? []).forEach((r: any) => {
      const cur = totals.get(r.user_id) ?? { won: 0, staked: 0, funded: 0 };
      cur.funded += Number(r.amount ?? 0);
      totals.set(r.user_id, cur);
    });
    const ids = Array.from(totals.keys());
    if (ids.length === 0) { setRows([]); setLoading(false); return; }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, ingame_name, avatar_url")
      .in("id", ids);
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const out: Row[] = ids
      .map((id) => {
        const t = totals.get(id)!;
        return {
          user_id: id,
          total_won: t.won,
          total_staked: t.staked,
          total_funded: t.funded,
          score: t.won + t.staked + t.funded,
          full_name: pmap.get(id)?.full_name ?? null,
          ingame_name: pmap.get(id)?.ingame_name ?? null,
          avatar_url: pmap.get(id)?.avatar_url ?? null,
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
    setRows(out);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-top-bets")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <Card className="overflow-hidden border-primary/30 bg-card/90">
      <div className="px-3 py-2 border-b border-primary/20 flex items-center gap-2 bg-gradient-to-r from-primary/15 to-transparent">
        <Flame className="h-4 w-4 text-primary" />
        <div className="text-[11px] font-bold tracking-[0.25em] text-primary">TOP BETS</div>
        <div className="ml-auto text-[9px] uppercase tracking-widest text-muted-foreground">Won + Staked + Funded</div>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {loading && <div className="p-3 text-xs text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">No bet activity yet.</div>
        )}
        <ol className="divide-y divide-border/40">
          {rows.map((r, i) => (
            <li key={r.user_id} className="flex items-center gap-2 px-3 py-2 hover:bg-primary/5">
              <span className={`h-6 w-6 grid place-items-center rounded-full text-[10px] font-black ${
                i === 0 ? "bg-gradient-gold text-primary-foreground"
                : i === 1 ? "bg-zinc-300 text-black"
                : i === 2 ? "bg-amber-800 text-amber-50"
                : "bg-muted text-muted-foreground"
              }`}>{i + 1}</span>
              {r.avatar_url
                ? <img src={r.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover border border-primary/30" />
                : <div className="h-7 w-7 rounded-full bg-primary/20 grid place-items-center text-[10px] font-bold text-primary">{(r.ingame_name || r.full_name || "?").charAt(0).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold truncate">{r.ingame_name || r.full_name || "Player"}</div>
                <div className="text-[9px] text-muted-foreground tabular-nums">
                  Won {r.total_won.toLocaleString()} · Staked {r.total_staked.toLocaleString()} · Funded {r.total_funded.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] uppercase text-muted-foreground tracking-widest">Score</div>
                <div className="text-xs font-black gradient-gold-text flex items-center justify-end gap-1">
                  <Trophy className="h-3 w-3 text-primary" />
                  {r.score.toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}