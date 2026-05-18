import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Calendar } from "lucide-react";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  ends_at: string;
  is_active: boolean;
};

function diff(now: number, target: number) {
  let s = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}:${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function EventBanner() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: true });
      setEvents((data ?? []) as EventRow[]);
    };
    load();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    const ch = supabase
      .channel("events-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, load)
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  if (events.length === 0) return null;
  return (
    <section className="container mt-4 space-y-3">
      {events.map((e) => {
        const target = new Date(e.ends_at).getTime();
        const left = now === null ? "--:--:--:--" : diff(now, target);
        return (
          <Card key={e.id} className="relative overflow-hidden border-primary/30 glass-strong">
            {e.banner_url ? (
              <img src={e.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-background/55 via-background/20 to-background/55" />
            <div className="relative p-4 md:p-6 flex items-center gap-4 flex-wrap">
              <div className="h-12 w-12 rounded-full bg-gradient-emerald grid place-items-center shrink-0">
                <Calendar className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-widest text-accent">Upcoming Event</div>
                <div className="font-bold text-lg md:text-2xl truncate">{e.title}</div>
                {e.description && <div className="text-sm text-muted-foreground line-clamp-1">{e.description}</div>}
              </div>
              <div className="text-2xl md:text-4xl font-extrabold gradient-gold-text tabular-nums tracking-wider" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                {left}
              </div>
            </div>
          </Card>
        );
      })}
    </section>
  );
}
