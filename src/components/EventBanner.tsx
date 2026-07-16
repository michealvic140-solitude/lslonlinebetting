import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  ends_at: string | null;
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
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const load = async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
        .order("ends_at", { ascending: true, nullsFirst: false });
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

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    onSelect();
    return () => { api.off("select", onSelect); };
  }, [api]);

  if (events.length === 0) return null;

  const renderCard = (e: EventRow) => {
    const hasCountdown = !!e.ends_at;
    const target = e.ends_at ? new Date(e.ends_at).getTime() : 0;
    const left = !hasCountdown ? "" : (now === null ? "--:--:--:--" : diff(now, target));
    return (
      <Card className="relative overflow-hidden border-primary/30 glass-strong">
            {e.banner_url ? (
              <img src={e.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-background/55 via-background/20 to-background/55" />
            <div className="relative p-4 md:p-6 flex items-center gap-4 flex-wrap">
              {hasCountdown && (
                <div className="h-12 w-12 rounded-full bg-gradient-emerald grid place-items-center shrink-0">
                  <Calendar className="h-6 w-6 text-primary-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {hasCountdown && <div className="text-xs uppercase tracking-widest text-accent">Upcoming Event</div>}
                <div className="font-bold text-lg md:text-2xl truncate">{e.title}</div>
                {e.description && <div className="text-sm text-muted-foreground line-clamp-1">{e.description}</div>}
              </div>
              {hasCountdown && (
                <div className="text-2xl md:text-4xl font-extrabold gradient-gold-text tabular-nums tracking-wider" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                  {left}
                </div>
              )}
            </div>
          </Card>
    );
  };

  if (events.length === 1) {
    return <section className="container mt-4">{renderCard(events[0])}</section>;
  }

  return (
    <section className="container mt-4 relative">
      <Carousel setApi={setApi} opts={{ loop: true }} plugins={[Autoplay({ delay: 6000, stopOnInteraction: false })]}>
        <CarouselContent>
          {events.map((e) => (
            <CarouselItem key={e.id}>{renderCard(e)}</CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button aria-label="Previous event" onClick={() => api?.scrollPrev()} className="grid h-7 w-7 place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {events.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to event ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === current ? "w-4 bg-accent" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>
        <button aria-label="Next event" onClick={() => api?.scrollNext()} className="grid h-7 w-7 place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
