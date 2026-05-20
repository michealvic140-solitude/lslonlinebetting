import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Users, TrendingUp, Copy } from "lucide-react";
import { toast } from "sonner";

type Hot = {
  match_id: string | null;
  match_name: string | null;
  market_name: string;
  selection_label: string;
  avg_odds: number;
  users_count: number;
  bets_count: number;
  total_stake: number;
};

type MatchStatusInfo = { status: string; is_virtual: boolean };

export function HotBets() {
  const [rows, setRows] = useState<Hot[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, MatchStatusInfo>>({});
  const { user } = useAuth();
  const { add } = useBetSlip();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("hot_bets_v1")
        .select("*")
        .order("bets_count", { ascending: false })
        .limit(50);
      const list = (data ?? []) as Hot[];
      const ids = Array.from(new Set(list.map((r) => r.match_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: ms } = await supabase.from("matches").select("id,status,is_virtual").in("id", ids);
        const map: Record<string, MatchStatusInfo> = {};
        (ms ?? []).forEach((m: any) => { map[m.id] = { status: m.status, is_virtual: !!m.is_virtual }; });
        setStatusMap(map);
        setRows(list.filter((r) => !r.match_id || !map[r.match_id]?.is_virtual));
      } else {
        setRows(list);
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    const ch = supabase.channel("hot-bets")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, load)
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(ch); };
  }, []);

  async function copyToSlip(h: Hot) {
    if (!user) return toast.error("Sign in to copy");
    if (!h.match_id) return;
    const info = statusMap[h.match_id];
    if (info?.is_virtual) return toast.error("Virtual picks are only available on the Virtual page.");
    const st = info?.status;
    if (st === "live") return toast.error("Match is live — picks are locked");
    if (st === "ended") return toast.error("Match has ended — picks are locked");
    // find odd id — include market name so we can match even after settlement
    const { data: mk } = await supabase
      .from("markets")
      .select("id, name, odds(id,label,value)")
      .eq("match_id", h.match_id);
    const markets = (mk ?? []) as any[];
    const market =
      markets.find((m: any) => m.name === h.market_name) ??
      markets.find((m: any) => (m.odds ?? []).some((o: any) => o.label === h.selection_label));
    const odd = market?.odds?.find((o: any) => o.label === h.selection_label);
    if (!odd || !market) return toast.error("Selection no longer available");
    add({
      match_id: h.match_id, match_name: h.match_name ?? "Match",
      market_id: market.id, market_name: h.market_name,
      odd_id: odd.id, selection_label: odd.label, odds: Number(odd.value),
    });
    toast.success("Added to slip");
  }

  return (
    <Card className="glass p-4">
      <div className="flex items-center gap-2 mb-3">
        <Flame className="h-4 w-4 text-destructive animate-pulse" />
        <div className="font-bold tracking-widest text-sm">HOT BETS</div>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-emerald-300/90 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live · refresh 60s
        </span>
      </div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No trending bets yet.</p>}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {rows.map((h, i) => (
          <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-2.5 hover:border-primary/40 transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                  <span className="truncate">{h.match_name ?? "Match"}</span>
                  {h.match_id && statusMap[h.match_id]?.status && statusMap[h.match_id].status !== "scheduled" && (
                    <Badge
                      variant="outline"
                      className={
                        statusMap[h.match_id].status === "live"
                          ? "h-4 px-1 text-[8px] uppercase border-destructive/50 text-destructive"
                          : "h-4 px-1 text-[8px] uppercase border-muted-foreground/40 text-muted-foreground"
                      }
                    >
                      {statusMap[h.match_id].status}
                    </Badge>
                  )}
                </div>
                <div className="text-sm font-bold truncate"><span className="text-primary">{h.selection_label}</span> <span className="text-muted-foreground font-normal">· {h.market_name}</span></div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{h.users_count}</span>
                  <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{h.bets_count} bets</span>
                  <span className="text-emerald-300 font-bold">@{Number(h.avg_odds).toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-amber-300 mt-0.5">Total stake {Number(h.total_stake).toLocaleString()}</div>
              </div>
              {(() => {
                const locked = h.match_id ? (statusMap[h.match_id]?.status === "live" || statusMap[h.match_id]?.status === "ended") : false;
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    disabled={locked}
                    onClick={() => copyToSlip(h)}
                    title={locked ? "Match has started or ended" : "Copy to slip"}
                  >
                    <Copy className="h-3 w-3 mr-1" />{locked ? "Locked" : "Copy"}
                  </Button>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}