import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function HotBets() {
  const [rows, setRows] = useState<Hot[]>([]);
  const { user } = useAuth();
  const { add } = useBetSlip();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("hot_bets_v1")
        .select("*")
        .order("bets_count", { ascending: false })
        .limit(50);
      setRows((data ?? []) as any);
    };
    load();
    const ch = supabase.channel("hot-bets")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function copyToSlip(h: Hot) {
    if (!user) return toast.error("Sign in to copy");
    if (!h.match_id) return;
    // find odd id
    const { data: mk } = await supabase.from("markets").select("id, odds(id,label,value)").eq("match_id", h.match_id);
    const market = (mk ?? []).find((m: any) => m.name === h.market_name) as any
      ?? (mk ?? []).find((m: any) => (m.odds ?? []).some((o: any) => o.label === h.selection_label));
    const odd = market?.odds?.find((o: any) => o.label === h.selection_label);
    if (!odd) return toast.error("Selection no longer available");
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
        <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">7d trending</span>
      </div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No trending bets yet.</p>}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {rows.map((h, i) => (
          <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-2.5 hover:border-primary/40 transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-muted-foreground truncate">{h.match_name ?? "Match"}</div>
                <div className="text-sm font-bold truncate"><span className="text-primary">{h.selection_label}</span> <span className="text-muted-foreground font-normal">· {h.market_name}</span></div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{h.users_count}</span>
                  <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{h.bets_count} bets</span>
                  <span className="text-emerald-300 font-bold">@{Number(h.avg_odds).toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-amber-300 mt-0.5">Total stake {Number(h.total_stake).toLocaleString()}</div>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => copyToSlip(h)}>
                <Copy className="h-3 w-3 mr-1" />Copy
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}