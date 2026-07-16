import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Newspaper, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type NewsRow = {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
};

export function NewsSlider() {
  const [items, setItems] = useState<NewsRow[]>([]);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<NewsRow | null>(null);

  async function load() {
    const { data } = await supabase
      .from("news")
      .select("id,title,body,image_url,link_url")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(15);
    setItems((data ?? []) as NewsRow[]);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("news-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "news" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    onSelect();
    return () => { api.off("select", onSelect); };
  }, [api]);

  if (items.length === 0) return null;

  return (
    <>
    <Card className="glass overflow-hidden border-accent/30">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-gradient-to-r from-accent/10 via-primary/5 to-transparent">
        <Newspaper className="h-4 w-4 text-accent" />
        <div className="font-bold tracking-widest text-sm">NEWS</div>
        {items.length > 1 && (
          <div className="ml-auto flex items-center gap-1">
            <button aria-label="Previous news" onClick={() => api?.scrollPrev()} className="grid h-6 w-6 place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button aria-label="Next news" onClick={() => api?.scrollNext()} className="grid h-6 w-6 place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <Carousel setApi={setApi} opts={{ loop: items.length > 1 }} plugins={items.length > 1 ? [Autoplay({ delay: 6000, stopOnInteraction: false })] : []}>
        <CarouselContent>
          {items.map((n) => {
            const inner = (
              <div className="block cursor-pointer">
                {n.image_url && (
                  <img src={n.image_url} alt={n.title} className="h-28 w-full object-cover" loading="lazy" />
                )}
                <div className="p-3">
                  <div className="font-bold text-sm leading-snug line-clamp-2">{n.title}</div>
                  {n.body && <div className="mt-1 text-[11px] text-muted-foreground line-clamp-3">{n.body}</div>}
                  <div className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-accent">Read more →</div>
                </div>
              </div>
            );
            return (
              <CarouselItem key={n.id}>
                <button type="button" onClick={() => setSelected(n)} className="w-full text-left">
                  {inner}
                </button>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2 border-t border-border/50">
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to news ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === current ? "w-4 bg-accent" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>
      )}
    </Card>
    <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{selected?.title}</DialogTitle>
          {selected?.body && <DialogDescription className="sr-only">{selected.body.slice(0, 120)}</DialogDescription>}
        </DialogHeader>
        {selected?.image_url && (
          <img src={selected.image_url} alt={selected.title} className="w-full max-h-72 object-cover rounded-md" />
        )}
        {selected?.body && (
          <div className="text-sm whitespace-pre-wrap text-muted-foreground max-h-[50vh] overflow-y-auto">{selected.body}</div>
        )}
        {selected?.link_url && (
          <DialogFooter>
            <Button asChild className="btn-luxury">
              <a href={selected.link_url} target="_blank" rel="noreferrer">Open link</a>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
