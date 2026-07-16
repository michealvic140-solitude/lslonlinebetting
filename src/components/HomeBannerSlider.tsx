import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { ArrowRight } from "lucide-react";

/** Wide auto-sliding promo banners shown at the top of a page. */
export function HomeBannerSlider({ embedded = false, placement = "home" }: { embedded?: boolean; placement?: string }) {
  const [items, setItems] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    (supabase as any)
      .from("home_banners")
      .select("*")
      .eq("is_active", true)
      .eq("placement", placement)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .then(({ data }: { data: any }) => setItems(data ?? []));
  }, [placement]);

  if (items.length === 0) return null;

  const go = (link: string) => {
    const to = link?.trim() || "/";
    if (/^https?:\/\//i.test(to)) { window.location.href = to; return; }
    navigate({ to: to as any }).catch(() => { window.location.href = to; });
  };

  const carousel = (
    <Carousel opts={{ loop: true }} plugins={[Autoplay({ delay: 4500, stopOnInteraction: false })]}>
        <CarouselContent>
          {items.map((b) => {
            const hasLink = !!b.link_url?.trim();
            const Wrapper: any = hasLink ? "button" : "div";
            const wrapperProps = hasLink
              ? { type: "button", onClick: () => go(b.link_url), className: "group relative block w-full overflow-hidden rounded-2xl border border-primary/40 text-left shadow-[0_0_40px_-16px_rgba(212,175,55,0.6)] cursor-pointer" }
              : { className: "group relative block w-full overflow-hidden rounded-2xl border border-primary/40 text-left shadow-[0_0_40px_-16px_rgba(212,175,55,0.6)]" };
            return (
            <CarouselItem key={b.id}>
              <Wrapper {...wrapperProps}>
                <div className="relative h-32 sm:h-40 md:h-48 w-full">
                  {b.image_url && (
                    <img
                      src={b.image_url}
                      alt={b.title || ""}
                      className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-105"
                      style={{
                        objectFit: (b.image_fit as any) || "cover",
                        objectPosition: b.image_position || "center",
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/40 to-transparent" />
                  <div className="relative flex h-full items-center justify-between gap-3 p-4 sm:p-6">
                    <div className="min-w-0 max-w-[70%]">
                      {b.title && <div className="text-lg sm:text-2xl md:text-3xl font-extrabold gradient-gold-text uppercase leading-tight truncate">{b.title}</div>}
                      {b.subtitle && <div className="mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-2">{b.subtitle}</div>}
                    </div>
                    {hasLink && (
                      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-gradient-gold px-4 py-2 text-xs sm:text-sm font-bold text-background shadow-gold transition-transform group-hover:scale-105">
                        {b.cta_label || "Click here"} <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </div>
              </Wrapper>
            </CarouselItem>
          );})}
        </CarouselContent>
    </Carousel>
  );

  if (embedded) return carousel;
  return <section className="container mt-4">{carousel}</section>;
}