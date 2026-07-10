import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Dice5, ChevronRight } from "lucide-react";

type DrawRow = {
  id: string;
  title: string;
  multiplier: number;
  winning_number: number | null;
  winning_numbers: number[] | null;
  drawn_at: string | null;
};

export function LotteryResultsCard() {
  const [rows, setRows] = useState<DrawRow[]>([]);

  async function load() {
    const { data } = await supabase
      .from("lottery_draws")
      .select("id,title,multiplier,winning_number,winning_numbers,drawn_at")
      .eq("status", "drawn")
      .order("drawn_at", { ascending: false })
      .limit(6);
    setRows((data ?? []) as DrawRow[]);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("lottery-results-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "lottery_draws" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <Card className="glass overflow-hidden border-primary/30">
      <div className="relative px-3 py-3 border-b border-border/60 bg-gradient-to-r from-amber-500/10 via-primary/5 to-transparent">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-gradient-gold text-background grid place-items-center shadow-gold">
            <Dice5 className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Lucky numbers</div>
            <div className="font-display text-base font-bold gradient-gold-text">Lottery Results</div>
          </div>
          <Link to="/lottery" className="ml-auto text-[10px] uppercase tracking-widest text-primary hover:underline flex items-center gap-0.5">
            Play <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {rows.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">No results yet — draws settle automatically within 30 minutes.</div>
        )}
        <ul className="divide-y divide-border/40">
          {rows.map((d) => {
            const nums = (Array.isArray(d.winning_numbers) && d.winning_numbers.length ? d.winning_numbers : [d.winning_number]).filter((n): n is number => n != null);
            return (
              <li key={d.id} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-bold truncate">{d.title}</div>
                  <div className="text-[9px] uppercase tracking-widest text-amber-300 shrink-0">x{d.multiplier}</div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {nums.map((n, i) => (
                    <span key={i} className="grid h-6 min-w-6 px-1 place-items-center rounded-md bg-gradient-gold text-background text-[11px] font-black shadow-gold">
                      {n}
                    </span>
                  ))}
                </div>
                {d.drawn_at && (
                  <div className="mt-1 text-[9px] text-muted-foreground">
                    {new Date(d.drawn_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
