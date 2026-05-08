import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Megaphone, Film } from "lucide-react";

export function AnnouncementSlider() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("announcements").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(10).then(({ data }) => setItems(data ?? []));
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="container mt-6">
      <Carousel opts={{ loop: true }} plugins={[Autoplay({ delay: 5000 })]}>
        <CarouselContent>
          {items.map((a) => (
            <CarouselItem key={a.id}>
              <Card className="glass-strong overflow-hidden border-accent/30">
                <div className="grid md:grid-cols-[200px_1fr]">
                  {a.image_url ? <img src={a.image_url} alt="" className="h-32 md:h-full w-full object-cover" /> : <div className="h-32 md:h-full bg-gradient-emerald grid place-items-center"><Megaphone className="h-10 w-10 text-primary-foreground" /></div>}
                  <div className="p-4">
                    <div className="text-xs uppercase tracking-widest text-accent">Announcement</div>
                    <div className="font-bold text-lg">{a.title}</div>
                    <div className="text-sm text-muted-foreground line-clamp-2">{a.body}</div>
                  </div>
                </div>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}

export function HighlightsRow() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("highlights").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(12).then(({ data }) => setItems(data ?? []));
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="container mt-10">
      <div className="flex items-center gap-2 mb-3"><Film className="h-5 w-5 text-primary" /><h2 className="text-2xl font-bold">Highlights</h2></div>
      <Carousel opts={{ align: "start", dragFree: true }}>
        <CarouselContent>
          {items.map((h) => (
            <CarouselItem key={h.id} className="basis-[80%] sm:basis-1/2 md:basis-1/3 lg:basis-1/4">
              <Card className="glass overflow-hidden">
                {h.media_type === "video"
                  ? <video src={h.media_url} controls className="w-full h-44 object-cover" />
                  : <img src={h.media_url} alt={h.title} className="w-full h-44 object-cover" />}
                <div className="p-2 font-bold text-sm truncate">{h.title}</div>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </section>
  );
}

export function AdsRow() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("advertisements").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(8).then(({ data }) => setItems(data ?? []));
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="container mt-10">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((a) => {
          const inner = (
            <Card className="glass overflow-hidden hover:border-primary/40 transition-colors">
              <img src={a.image_url} alt={a.title} className="w-full h-32 object-cover" />
              {a.title && <div className="p-2 font-bold text-sm truncate">{a.title}</div>}
            </Card>
          );
          return a.link_url ? <a key={a.id} href={a.link_url} target="_blank" rel="noreferrer">{inner}</a> : <div key={a.id}>{inner}</div>;
        })}
      </div>
    </section>
  );
}
