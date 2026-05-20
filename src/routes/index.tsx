import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MatchCardLive } from "@/components/MatchCardLive";
import { EventBanner } from "@/components/EventBanner";
import { AnnouncementSlider, HighlightsRow, AdsRow } from "@/components/HomeContent";
import { GrandPrizeWinners } from "@/components/GrandPrizeWinners";
import { HotBets } from "@/components/HotBets";
import { SeasonBanner } from "@/components/SeasonBanner";
import { Spotlight } from "@/components/Spotlight";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Crosshair, Flame, Trophy, ChevronRight, Skull, Coins, Ticket as TicketIcon, ClipboardPaste, X } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { fetchMatches, fetchSettings, type MatchRow } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { toast } from "sonner";
import { DraggableFab } from "@/components/DraggableFab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lomita Shooters League — Virtual Token Shooting League" },
      { name: "description", content: "Live matches, gang leaderboards and virtual-token wagering for the Lomita Shooters League." },
      { property: "og:title", content: "Lomita Shooters League" },
      { property: "og:description", content: "Follow live shooting matches, back your gang with virtual tokens, and climb the seasonal leaderboard." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/" },
      { property: "og:image", content: hero },
      { name: "twitter:title", content: "Lomita Shooters League" },
      { name: "twitter:description", content: "Follow live shooting matches, back your gang with virtual tokens, and climb the seasonal leaderboard." },
    ],
    links: [
      { rel: "canonical", href: "https://lslonlinebetting.lovable.app/" },
      { rel: "preload", as: "image", href: hero, fetchpriority: "high" },
    ],
  }),
  component: Index,
});

function Index() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchMatches(), fetchSettings()]).then(([m, s]) => { setMatches(m); setSettings(s); }).finally(() => setLoading(false));
    const ch = supabase.channel("home-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => fetchMatches().then(setMatches))
      .on("postgres_changes", { event: "*", schema: "public", table: "odds" }, () => fetchMatches().then(setMatches))
      .on("postgres_changes", { event: "*", schema: "public", table: "markets" }, () => fetchMatches().then(setMatches))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, () => fetchSettings().then(setSettings))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const live = matches.filter((m) => m.status === "live");
  const upcoming = matches.filter((m) => m.status === "scheduled");
  const featuredAll = matches.filter((m) => m.is_featured && m.status !== "ended");
  const featuredFallback = featuredAll.length === 0 && upcoming[0] ? [upcoming[0]] : featuredAll;

  // Group upcoming by category for the category sections
  const byCategory: Record<string, { name: string; icon: string | null; items: MatchRow[] }> = {};
  for (const m of [...live, ...upcoming]) {
    const cat = m.category;
    if (!cat) continue;
    if (!byCategory[cat.id]) byCategory[cat.id] = { name: cat.name, icon: cat.icon, items: [] };
    byCategory[cat.id].items.push(m);
  }
  const categoryGroups = Object.entries(byCategory);
  const tagline = settings?.hero_tagline || "Season 4 · Live";

  return (
    <Layout>
      <section className="relative overflow-hidden">
        <img
          src={hero}
          alt=""
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
        <div className="container relative py-20 md:py-32">
          <Badge variant="outline" className="border-primary/50 text-primary mb-4">
            <Flame className="h-3 w-3 mr-1" /> {tagline}
          </Badge>
          <h1 className="text-4xl md:text-7xl font-bold leading-tight max-w-3xl">
            Where gangs clash and{" "}
            <span className="gradient-gold-text">legends</span> are{" "}
            <span className="gradient-emerald-text">gold-plated</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            The Lomita Shooters League is a virtual-token competitive shooting circuit. Pick your gang, place your wagers, and climb the leaderboard.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/matches"><Button size="lg" className="btn-luxury">View Matches <ChevronRight className="h-4 w-4 ml-1" /></Button></Link>
            <Link to="/leaderboard"><Button size="lg" variant="outline" className="border-primary/40">Leaderboard</Button></Link>
            <Link to="/checkout"><Button size="lg" variant="outline" className="border-accent/40 text-accent"><Coins className="h-4 w-4 mr-1" />Buy Tokens</Button></Link>
          </div>
        </div>
      </section>

      <EventBanner />
      <SeasonBanner />
      <Spotlight />

      {/* Highlights → Announcements → Ads → Matches */}
      <HighlightsRow />
      <AnnouncementSlider />
      <AdsRow />

      <BookingCodeFab />

      {/* Hot Bets & Hall of Fame — prominent full-width sections */}
      <section className="container mt-10 grid grid-cols-2 gap-3 md:gap-6">
        <div className="min-w-0">
          <SectionHeader icon={Flame} title="Hot Bets" subtitle="What the league is backing right now." />
          <div className="mt-4"><HotBets /></div>
        </div>
        <div className="min-w-0">
          <SectionHeader icon={Trophy} title="Hall of Fame" subtitle="Grand prize winners — most tokens won." />
          <div className="mt-4"><GrandPrizeWinners /></div>
        </div>
      </section>

      <section className="container mt-10 grid lg:grid-cols-[300px_1fr] gap-6">
        <aside className="lg:sticky lg:top-20 self-start space-y-4 lg:order-first">
          <Card className="glass p-4">
            <div className="flex items-center gap-2 mb-2">
              <Skull className="h-4 w-4 text-primary" />
              <div className="font-bold tracking-widest text-sm">LEAGUE STATS</div>
            </div>
            <Stat label="Active matches" value={matches.filter((m) => m.status !== "ended").length.toString()} />
            <Stat label="Live now" value={live.length.toString()} />
          </Card>
        </aside>
        <div className="space-y-10">
          {loading && <p className="text-muted-foreground">Loading league…</p>}
          {!loading && featuredFallback.length > 0 && (
            <div>
              <SectionHeader icon={Trophy} title="Featured Matches" subtitle="The biggest matchups of the round." />
              <div className="mt-4">
                <Carousel opts={{ loop: featuredFallback.length > 1 }} plugins={featuredFallback.length > 1 ? [Autoplay({ delay: 5000, stopOnInteraction: false })] : []}>
                  <CarouselContent>
                    {featuredFallback.map((m) => (
                      <CarouselItem key={m.id}><MatchCardLive match={m} /></CarouselItem>
                    ))}
                  </CarouselContent>
                  {featuredFallback.length > 1 && (<><CarouselPrevious /><CarouselNext /></>)}
                </Carousel>
              </div>
            </div>
          )}
          {!loading && live.length > 0 && (
            <div>
              <SectionHeader icon={Flame} title="Live Now" subtitle="Live odds. Markets close round-by-round." />
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                {live.map((m) => <MatchCardLive key={m.id} match={m} />)}
              </div>
            </div>
          )}
          {!loading && (
            <div>
              <SectionHeader icon={Crosshair} title="Upcoming Matches" subtitle="Lock your picks before the round starts." />
              {upcoming.length === 0 ? (
                <p className="text-muted-foreground mt-4 text-sm">No upcoming matches scheduled.</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {upcoming.slice(0, 6).map((m) => <MatchCardLive key={m.id} match={m} />)}
                </div>
              )}
            </div>
          )}
          {categoryGroups.map(([id, g]) => (
            <div key={id}>
              <SectionHeader icon={Crosshair} title={g.name} subtitle={`${g.items.length} match${g.items.length === 1 ? "" : "es"} in this category.`} />
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                {g.items.map((m) => <MatchCardLive key={m.id} match={m} />)}
              </div>
            </div>
          ))}
        </div>
      </section>

    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-primary">{value}</span>
    </div>
  );
}

function BookingCodeFab() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { add, clear } = useBetSlip();
  const nav = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("code");
    if (c) { setCode(c.toUpperCase()); setOpen(true); }
  }, []);

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setCode(t.trim().toUpperCase()); toast.success("Pasted from clipboard"); }
      else toast.error("Clipboard is empty");
    } catch {
      toast.error("Clipboard not accessible — paste manually");
    }
  }

  async function load() {
    if (!user) { nav({ to: "/login" }); return; }
    if (!code.trim()) return;
    setLoading(true);
    const { data: bet } = await supabase.from("bets")
      .select("id, booking_code, bet_selections(*, matches!match_id(name, status), markets!market_id(name))")
      .eq("booking_code", code.trim().toUpperCase()).maybeSingle();
    setLoading(false);
    if (!bet) { toast.error("Booking code not found", { description: `We couldn't locate any ticket with the code "${code.trim().toUpperCase()}". Double-check spelling or ask the owner to re-share.` }); return; }
    const sels = bet.bet_selections ?? [];
    const expired = sels.filter((s: any) => s.matches?.status && s.matches.status !== "scheduled");
    if (expired.length === sels.length && sels.length > 0) {
      toast.error("Booking code expired", {
        description: `All ${sels.length} match(es) in this booking are already live or finished. New bets can only be placed before kick-off.`,
      });
      return;
    }
    clear();
    let added = 0;
    sels.forEach((s: any) => {
      if (s.matches?.status !== "scheduled") return;
      add({
        match_id: s.match_id, match_name: s.matches?.name ?? "Match",
        market_id: s.market_id, market_name: s.markets?.name ?? "Market",
        odd_id: s.odd_id, selection_label: s.selection_label, odds: Number(s.locked_odds),
      });
      added++;
    });
    if (added === 0) {
      toast.error("Booking code expired", {
        description: "Every match on this slip has already started — picks can no longer be copied.",
      });
      return;
    }
    if (expired.length > 0) {
      toast.warning(`Loaded ${added} pick(s) — ${expired.length} expired`, {
        description: "Some matches on this booking are already live and were skipped.",
      });
    } else {
      toast.success(`Loaded ${added} pick(s)`, { description: "Set your stake and place the bet to lock in." });
    }
    setOpen(false);
    nav({ to: "/matches" });
  }

  return (
    <>
      <DraggableFab
        storageKey="lsl-booking-code-fab-pos"
        defaultSide="left"
        ariaLabel="Paste booking code"
        onClick={() => setOpen(true)}
        className="group"
      >
        <span className="absolute inset-0 rounded-full bg-gradient-gold blur-md opacity-60 group-hover:opacity-90 transition" />
        <span className="relative h-14 w-14 rounded-full bg-gradient-gold text-primary-foreground grid place-items-center shadow-gold border border-primary/40 active:scale-95 transition">
          <ClipboardPaste className="h-6 w-6" />
        </span>
        <span className="absolute -top-1 -right-1 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-black grid place-items-center shadow">CODE</span>
      </DraggableFab>
      {open && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md grid place-items-center p-4" onClick={() => setOpen(false)}>
          <Card className="glass-strong w-full max-w-md p-5 space-y-3 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            <div className="flex items-center gap-2">
              <span className="h-9 w-9 rounded-xl bg-gradient-gold grid place-items-center text-primary-foreground"><TicketIcon className="h-4 w-4" /></span>
              <div>
                <div className="font-bold">Play a friend's booking</div>
                <div className="text-xs text-muted-foreground">Paste a booking code to copy their picks to your slip.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BOOKING CODE" className="font-mono uppercase" />
              <Button variant="outline" onClick={pasteFromClipboard} title="Paste from clipboard"><ClipboardPaste className="h-4 w-4" /></Button>
            </div>
            <Button onClick={load} disabled={loading || !code.trim()} className="btn-luxury w-full">{loading ? "Loading…" : "Load picks"}</Button>
          </Card>
        </div>
      )}
    </>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-end justify-between border-b border-border pb-2">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
