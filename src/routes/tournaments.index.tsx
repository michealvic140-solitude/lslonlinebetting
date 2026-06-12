import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Trophy, Crown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/tournaments/")({
  head: () => ({ meta: [{ title: "Knockout Brackets — Lomita Shooters League" }, { name: "description", content: "Browse every live and past knockout bracket tournament." }] }),
  component: TournamentsIndex,
});

type T = { id: string; name: string; subtitle: string | null; status: string; opening_round_size: number; background_image_url: string | null; tournament_date: string | null };

function TournamentsIndex() {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    supabase.from("tournaments").select("id,name,subtitle,status,opening_round_size,background_image_url,tournament_date").order("created_at", { ascending: false }).then(({ data }) => setList((data ?? []) as T[]));
    const ch = supabase.channel("tournaments-index").on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => {
      supabase.from("tournaments").select("id,name,subtitle,status,opening_round_size,background_image_url,tournament_date").order("created_at", { ascending: false }).then(({ data }) => setList((data ?? []) as T[]));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  return (
    <Layout>
      <div className="container py-8">
        <div className="flex items-center gap-2 mb-5">
          <Trophy className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold gradient-gold-text">Knockout Brackets</h1>
        </div>
        {list.length === 0 && <p className="text-muted-foreground text-sm">No tournaments yet. Check back soon.</p>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((t) => (
            <Link key={t.id} to="/tournaments/$id" params={{ id: t.id }}>
              <Card className="relative overflow-hidden border-primary/30 bg-card/90 hover:border-primary transition-colors group">
                <div className="absolute inset-0 opacity-25 group-hover:opacity-40 transition-opacity"
                  style={t.background_image_url ? { backgroundImage: `url(${t.background_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
                <div className="relative p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {t.status === "completed" ? <Crown className="h-4 w-4 text-primary" /> : <Trophy className="h-4 w-4 text-primary" />}
                    <span className="text-[10px] uppercase tracking-[0.3em] text-primary/80 font-bold">{t.status === "completed" ? "Completed" : "Live Bracket"}</span>
                  </div>
                  <div className="font-display text-lg gradient-gold-text truncate">{t.name}</div>
                  {t.subtitle && <div className="text-[11px] text-muted-foreground truncate">{t.subtitle}</div>}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Round of {t.opening_round_size}</span>
                    {t.tournament_date && <span>{new Date(t.tournament_date).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex items-center justify-end text-[10px] text-primary font-bold">View bracket <ChevronRight className="h-3 w-3" /></div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}