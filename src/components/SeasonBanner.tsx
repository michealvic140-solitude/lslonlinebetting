import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

function seasonDiff(now: number, target: number) {
  let s = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}/${pad(h)}/${pad(m)}/${pad(s)}`;
}

export function SeasonBanner() {
  const [season, setSeason] = useState<any>(null);
  const [top, setTop] = useState<any[]>([]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: s } = await supabase.from("seasons").select("*").eq("is_active", true).order("starts_at", { ascending: false }).limit(1).maybeSingle();
      setSeason(s);
      if (s) {
        const { data: pts } = await supabase.from("season_points").select("*, profiles:user_id(full_name, ingame_name, gang_name)").eq("season_id", (s as any).id).order("points", { ascending: false }).limit(5);
        setTop(pts ?? []);
      }
    };
    load();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    const ch = supabase
      .channel("seasons-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "seasons" }, load)
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  if (!season) return null;
  const ends = new Date(season.ends_at);
  const countdown = now === null ? "--/--/--/--" : seasonDiff(now, ends.getTime());

  return (
    <section className="container mt-6">
      <Card className="glass-strong overflow-hidden border-primary/40">
        {season.banner_url && <img src={season.banner_url} alt="" className="w-full h-32 object-cover opacity-60" />}
        <div className="p-5 grid md:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <Badge variant="outline" className="border-primary/40 text-primary mb-2">
              <Trophy className="h-3 w-3 mr-1" /> CURRENT SEASON
            </Badge>
            <h3 className="text-2xl font-bold gradient-gold-text">{season.name}</h3>
            {season.description && <p className="text-sm text-muted-foreground mt-1">{season.description}</p>}
            <div className="mt-3 flex items-baseline gap-3 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Ends in</span>
              <span
                className="text-2xl md:text-3xl font-extrabold gradient-gold-text tabular-nums tracking-wider"
                style={{ fontFamily: '"Times New Roman", Times, serif' }}
              >
                {countdown}
              </span>
              <span className="text-[10px] text-muted-foreground">DD/HH/MM/SS · ends {ends.toLocaleDateString()}</span>
            </div>
          </div>
          {top.length > 0 && (
            <div className="md:w-72">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Top contenders</div>
              {top.map((t, i) => (
                <div key={t.id} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0">
                  <span className="truncate"><span className="text-primary font-bold">#{i + 1}</span> {t.profiles?.ingame_name ?? t.profiles?.full_name ?? "—"}</span>
                  <span className="text-amber-300 font-bold">{t.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}