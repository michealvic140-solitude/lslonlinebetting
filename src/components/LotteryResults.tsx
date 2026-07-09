import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

type Draw = {
  id: string;
  title: string | null;
  status: string;
  drawn_at: string | null;
  winning_numbers: number[] | null;
  winning_number: number | null;
  picks_count: number | null;
};

export function LotteryResults() {
  const [rows, setRows] = useState<Draw[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      // Auto-settle any lottery older than 30min (server enforces the age gate)
      try { await (supabase as any).rpc("auto_settle_lotteries"); } catch { /* ignore */ }
      const { data } = await supabase
        .from("lottery_draws")
        .select("id,title,status,drawn_at,winning_numbers,winning_number,picks_count")
        .eq("status", "drawn")
        .order("drawn_at", { ascending: false })
        .limit(6);
      if (alive) setRows((data ?? []) as Draw[]);
    };
    load();
    const t = setInterval(load, 60_000);
    const ch = supabase
      .channel("lottery-results")
      .on("postgres_changes", { event: "*", schema: "public", table: "lottery_draws" }, load)
      .subscribe();
    return () => { alive = false; clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  return (
    <Card className="glass p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-accent" />
        <div className="font-bold tracking-widest text-sm">LOTTERY RESULTS</div>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-emerald-300/90">
          Auto-draws every 30 min
        </span>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No results yet — the next draw will appear here.</p>
      )}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {rows.map((d) => {
          const nums = d.winning_numbers && d.winning_numbers.length
            ? d.winning_numbers
            : d.winning_number != null ? [d.winning_number] : [];
          return (
            <div key={d.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold truncate">{d.title || "Lottery Draw"}</div>
                <div className="text-[10px] text-muted-foreground shrink-0">
                  {d.drawn_at ? new Date(d.drawn_at).toLocaleString() : ""}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {nums.map((n, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center justify-center h-7 min-w-7 px-1.5 rounded-full text-xs font-black bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}