import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { History, Dice5 } from "lucide-react";

export function CasinoHistoryPanel() {
  const [plays, setPlays] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: t }] = await Promise.all([
        (supabase as any).from("casino_plays").select("*").order("created_at", { ascending: false }).limit(200),
        (supabase as any).from("lottery_tickets").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      setPlays(p ?? []); setTickets(t ?? []);
      const ids = Array.from(new Set([...(p ?? []), ...(t ?? [])].map((r: any) => r.user_id).filter(Boolean)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name,special_id").in("id", ids);
        setNames(Object.fromEntries((profs ?? []).map((x: any) => [x.id, `${x.full_name || "User"} (${x.special_id || "—"})`])));
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-bold"><History className="h-4 w-4 text-primary" />Arcade &amp; Lottery History</div>
      <Tabs defaultValue="arcade">
        <TabsList className="grid grid-cols-2 max-w-sm">
          <TabsTrigger value="arcade">Arcade ({plays.length})</TabsTrigger>
          <TabsTrigger value="lottery">Lottery ({tickets.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="arcade" className="mt-3 space-y-2">
          {plays.length === 0 && <p className="text-sm text-muted-foreground">No arcade plays yet.</p>}
          {plays.map((r) => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="font-semibold truncate">{names[r.user_id] || "User"}</div>
                <div className="text-[11px] text-muted-foreground capitalize">{r.game} · {r.outcome} · {new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">stake {Number(r.stake).toLocaleString()}</div>
                <Badge variant="outline" className={Number(r.payout) > 0 ? "border-emerald-500/50 text-emerald-300" : "border-destructive/50 text-destructive"}>{Number(r.payout) > 0 ? `+${Number(r.payout).toLocaleString()}` : "LOST"}</Badge>
              </div>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="lottery" className="mt-3 space-y-2">
          {tickets.length === 0 && <p className="text-sm text-muted-foreground">No lottery tickets yet.</p>}
          {tickets.map((r) => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="font-semibold truncate flex items-center gap-1"><Dice5 className="h-3.5 w-3.5 text-primary" />{names[r.user_id] || "User"}</div>
                <div className="text-[11px] text-muted-foreground">#{Array.isArray(r.numbers) && r.numbers.length ? r.numbers.join(", ") : r.number} · {new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">stake {Number(r.stake).toLocaleString()}</div>
                <Badge variant="outline" className={r.status === "won" ? "border-emerald-500/50 text-emerald-300" : r.status === "lost" ? "border-destructive/50 text-destructive" : "border-amber-500/50 text-amber-300"}>{String(r.status || "pending").toUpperCase()}{Number(r.payout) > 0 ? ` +${Number(r.payout).toLocaleString()}` : ""}</Badge>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}