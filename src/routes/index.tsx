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
import { HomeBannerSlider } from "@/components/HomeBannerSlider";
import { HomeQuickMenu } from "@/components/HomeQuickMenu";
import { GrandPrizeWinners } from "@/components/GrandPrizeWinners";
import { HotBets } from "@/components/HotBets";
import { NewsSlider } from "@/components/NewsSlider";
import { LotteryResultsCard } from "@/components/LotteryResultsCard";
import { SeasonBanner } from "@/components/SeasonBanner";
import { Spotlight } from "@/components/Spotlight";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Crosshair, Flame, Trophy, ChevronRight, Coins, Ticket as TicketIcon, ClipboardPaste, X, Dice5 } from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { TeamLogo } from "@/components/TeamLogo";
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
      { title: "E-Football Competition Bet — Virtual Token Shooting League" },
      { name: "description", content: "Live matches, gang leaderboards and virtual-token wagering for the E-Football Competition Bet." },
      { property: "og:title", content: "E-Football Competition Bet — Virtual Token Shooting League" },
      { property: "og:description", content: "Live matches, gang leaderboards and virtual-token wagering for the E-Football Competition Bet." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/" },
      { property: "og:image", content: hero },
      { name: "twitter:title", content: "E-Football Competition Bet — Virtual Token Shooting League" },
      { name: "twitter:description", content: "Live matches, gang leaderboards and virtual-token wagering for the E-Football Competition Bet." },
    ],
    links: [
      { rel: "canonical", href: "https://lslonlinebetting.lovable.app/" },
      { rel: "preload", as: "image", href: hero, fetchPriority: "high" },
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
    // Debounce refetches so a burst of realtime row changes (odds/markets
    // updating together) only triggers one network round-trip, not dozens.
    let matchTimer: ReturnType<typeof setTimeout> | undefined;
    const refetchMatches = () => {
      clearTimeout(matchTimer);
      matchTimer = setTimeout(() => { fetchMatches().then(setMatches); }, 600);
    };
    let settingsTimer: ReturnType<typeof setTimeout> | undefined;
    const refetchSettings = () => {
      clearTimeout(settingsTimer);
      settingsTimer = setTimeout(() => { fetchSettings().then(setSettings); }, 600);
    };
    const ch = supabase.channel("home-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, refetchMatches)
      .on("postgres_changes", { event: "*", schema: "public", table: "odds" }, refetchMatches)
      .on("postgres_changes", { event: "*", schema: "public", table: "markets" }, refetchMatches)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, refetchSettings)
      .subscribe();
    return () => { clearTimeout(matchTimer); clearTimeout(settingsTimer); supabase.removeChannel(ch); };
  }, []);

  const futures = matches.filter((m) => m.match_kind === "future" && m.status === "scheduled");
  const normalMatches = matches.filter((m) => m.match_kind !== "future");
  const live = normalMatches.filter((m) => m.status === "live");
  const upcoming = normalMatches.filter((m) => m.status === "scheduled");
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
      <section className="container mt-4">
        <div className="flex items-stretch gap-2 sm:gap-3">
          <div className="min-w-0 flex-1"><HomeBannerSlider embedded /></div>
          <HomeQuickMenu />
        </div>
      </section>
      <section className="relative overflow-hidden">
        {settings?.hero_bg_url && (
          <img
            src={settings.hero_bg_url}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full opacity-40"
            style={{ objectFit: (settings.hero_bg_fit as any) || "cover", objectPosition: settings.hero_bg_position || "center" }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
        <div className="container relative py-8 md:py-14">
          {settings?.site_logo_url && (
            <img
              src={settings.site_logo_url}
              alt={settings?.site_name || "Platform logo"}
              className="mb-6 h-20 md:h-28 w-auto object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
            />
          )}
          <Badge variant="outline" className="border-primary/50 text-primary mb-4">
            <Flame className="h-3 w-3 mr-1" /> {tagline}
          </Badge>
          {settings?.hero_title ? (
            <h1 className="text-4xl md:text-7xl font-bold leading-tight max-w-3xl uppercase gradient-gold-text">
              {settings.hero_title}
            </h1>
          ) : (
            <h1 className="text-4xl md:text-7xl font-bold leading-tight max-w-3xl uppercase">
              Where <span className="gradient-emerald-text">E-Football</span> meets{" "}
              <span className="gradient-gold-text">gold-plated</span> glory.
            </h1>
          )}
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            {settings?.hero_subtitle || "E-Football Competition Bet is a virtual-token e-football league. Pick your squad, place your wagers, and climb the leaderboard — kick-off is instant."}
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
      {futures.length > 0 && (
        <FuturesSection title={settings?.futures_section_title || "TOURNAMENT FUTURES"} markets={futures} maxSelections={Number(settings?.futures_max_selections ?? 1)} featured={featuredAll} />
      )}

      <BookingCodeFab />

      {/* Match feed on the left · Hot Bets + Hall of Fame stacked on the right.
          The two-column layout kicks in from ~500px so phones in desktop mode
          keep the sidebar (Hot Bets + Hall of Fame) on the right, scaled small. */}
      <section className="container mt-3">
        <div className="grid gap-3 min-[500px]:gap-5 min-[500px]:grid-cols-[minmax(0,1fr)_minmax(0,200px)] lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_300px] items-start">
          <div className="space-y-3 min-w-0">
          {loading && <p className="text-muted-foreground">Loading league…</p>}
          {!loading && featuredFallback.length > 0 && (
            <div>
              <div>
                <Carousel opts={{ loop: featuredFallback.length > 1 }} plugins={featuredFallback.length > 1 ? [Autoplay({ delay: 5000, stopOnInteraction: false })] : []}>
                  <CarouselContent>
                    {featuredFallback.map((m) => (
                      <CarouselItem key={m.id}>
                        <FeaturedGoldenMatches matches={[m]} bgImage={m.featured_image_url} bgFit={m.featured_image_fit} bgPos={m.featured_image_position} />
                      </CarouselItem>
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
              <div className="space-y-2 mt-4">
                {live.map((m) => <MatchCardLive key={m.id} match={m} variant="row" />)}
              </div>
            </div>
          )}
          {!loading && upcoming.length > 0 && (
            <div>
              <SectionHeader icon={Crosshair} title="Upcoming Matches" subtitle="Lock your picks before the round starts." />
              <div className="space-y-2 mt-4">
                {upcoming.slice(0, 6).map((m) => <MatchCardLive key={m.id} match={m} variant="row" />)}
              </div>
            </div>
          )}
          {categoryGroups.map(([id, g]) => (
            <div key={id}>
              <SectionHeader icon={Crosshair} title={g.name} subtitle={`${g.items.length} match${g.items.length === 1 ? "" : "es"} in this category.`} />
              <div className="space-y-2 mt-4">
                {g.items.map((m) => <MatchCardLive key={m.id} match={m} variant="row" />)}
              </div>
            </div>
          ))}
          </div>
          <aside className="space-y-6 min-w-0 lg:sticky lg:top-20 self-start">
            <NewsSlider />
            <div>
              <div className="mt-3"><HotBets /></div>
            </div>
            <div>
              <div className="mt-3"><LotteryResultsCard /></div>
            </div>
            <div>
              <div className="mt-3"><GrandPrizeWinners /></div>
            </div>
          </aside>
        </div>
      </section>

    </Layout>
  );
}

function FuturesSection({ title, markets, maxSelections, featured = [] }: { title: string; markets: MatchRow[]; maxSelections: number; featured?: MatchRow[] }) {
  const { selections, add, remove, setOpen } = useBetSlip();
  return (
    <section className="container mt-6">
      <div className="seasonal-golden relative overflow-hidden rounded-3xl mb-5 px-5 py-6 md:px-8 md:py-8">
        <div className="pointer-events-none absolute -right-10 -top-10 opacity-25">
          <Trophy className="h-44 w-44 text-amber-200" />
        </div>
        <div className="pointer-events-none absolute inset-0 seasonal-golden-shine" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-black/30 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-[0.32em] font-black text-amber-100">
              <Trophy className="h-3.5 w-3.5" /> Seasonal Tournament
            </div>
            <h2 className="mt-2 font-display text-3xl md:text-5xl font-black uppercase tracking-tight seasonal-golden-title">
              {title}
            </h2>
            <p className="mt-1 text-sm md:text-base font-semibold text-amber-50/90">
              Season-long markets · pick up to {maxSelections} contender{maxSelections === 1 ? "" : "s"}.
            </p>
          </div>
          <Link to="/tournament">
            <Button className="seasonal-golden-btn font-black tracking-wide">
              Go to Tournament <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
        {featured.length > 0 && (
          <FeaturedGoldenMatches matches={featured} />
        )}
      </div>
      {markets.length === 0 && (
        <Card className="glass-strong p-5 border-accent/30">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent">Tournament futures</div>
          <div className="mt-1 font-black text-xl">No active seasonal market yet</div>
          <p className="mt-1 text-sm text-muted-foreground">New champion, top shooter, best clan, and most-wins markets will appear here when posted.</p>
        </Card>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        {markets.map((future) => {
          const market = future.markets?.[0];
          return (
            <Card key={future.id} className="glass overflow-hidden border-accent/30">
              <div className="border-b border-border/60 bg-card/60 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-accent">Tournament Futures</div>
                  <div className="font-black text-lg truncate">{future.name}</div>
                </div>
                <div className="text-right text-[10px] text-muted-foreground shrink-0">
                  Closes in<br /><span className="font-mono text-primary"><Countdown target={future.start_time} /></span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border/50 p-px">
                {(market?.odds ?? []).map((odd) => {
                  const selected = selections.some((s) => s.odd_id === odd.id);
                  const status = odd.future_status ?? "active";
                  // Lost contenders stay bookable — only a disqualified (or fully settled) outcome blocks a pick.
                  const blocked = !market?.is_open || future.status !== "scheduled" || ["disqualified", "settled"].includes(status);
                  return (
                    <button
                      key={odd.id}
                      onClick={() => {
                        if (selected) remove(odd.id);
                        else {
                          if (blocked) return;
                          if (selections.filter((s) => s.is_future).length >= maxSelections) { toast.error(`This market allows up to ${maxSelections} futures selection${maxSelections === 1 ? "" : "s"}.`); return; }
                          add({ match_id: future.id, match_name: future.name, market_id: market.id, market_name: market.name, odd_id: odd.id, selection_label: odd.label, odds: Number(odd.value), is_future: true });
                          setOpen(true);
                        }
                      }}
                      disabled={blocked && !selected}
                      className={`min-h-24 bg-card/90 px-3 py-2 text-left transition hover:bg-primary/10 disabled:opacity-45 disabled:hover:bg-card/90 ${selected ? "ring-2 ring-primary bg-primary/15" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <FutureEmblem label={odd.label} url={odd.future_emblem_url} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground truncate">{odd.label}</div>
                          <div className="text-[9px] uppercase tracking-widest text-muted-foreground truncate">{odd.future_candidate_type ?? "Contender"}</div>
                        </div>
                        <div className="font-mono font-black text-accent">{Number(odd.value).toFixed(2)}</div>
                      </div>
                      <FutureProgress odd={odd} />
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function FutureEmblem({ label, url }: { label: string; url?: string | null }) {
  const initials = label.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "LS";
  return (
    <span className="h-10 w-10 shrink-0 rounded-full border border-primary/35 bg-primary/10 grid place-items-center overflow-hidden text-[11px] font-black text-primary">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

// Featured matches rendered as SportyBet-style golden rows inside the
// Seasonal Tournament banner, under the "Go to Tournament" header.
function FeaturedGoldenMatches({ matches, bgImage, bgFit, bgPos }: { matches: MatchRow[]; bgImage?: string | null; bgFit?: string | null; bgPos?: string | null }) {
  const { selections, add, remove, setOpen } = useBetSlip();
  if (matches.length === 0) return null;
  return (
    <div className="seasonal-golden relative overflow-hidden rounded-3xl px-3 py-3 md:px-5 md:py-4 space-y-2">
      {bgImage && (
        <>
          <img
            src={bgImage}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: (bgFit as any) || "cover", objectPosition: bgPos || "center" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        </>
      )}
      <div className="relative flex items-center gap-2">
        <Trophy className="h-6 w-6 text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]" />
        <div>
          <div className="text-xl md:text-2xl font-black tracking-wider text-amber-100 uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">FEATURED MATCHES</div>
          <div className="text-[10px] uppercase tracking-widest text-amber-100/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">The biggest matchups of the round.</div>
        </div>
      </div>
      {matches.map((m) => {
        const market = m.markets?.find((mk) => mk.is_open) ?? m.markets?.[0];
        const odds = market?.odds ?? [];
        const live = m.status === "live";
        return (
          <div key={m.id} className="relative rounded-2xl border border-amber-300/40 bg-black/25 overflow-hidden shadow-[0_8px_30px_-12px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5 text-[10px] uppercase tracking-widest">
              <span className="inline-flex items-center gap-1.5 font-black text-amber-200">
                {live ? (
                  <><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" /></span> Live</>
                ) : "Upcoming"}
              </span>
              <span className="font-mono text-amber-50/70">
                {live ? "Round in play" : <>Starts in <Countdown target={m.start_time} /></>}
              </span>
            </div>
            <Link to="/matches/$matchId" params={{ matchId: m.id }} className="flex items-center gap-3 px-3 py-2 hover:bg-amber-400/5 transition">
              <TeamLogo name={m.home_team?.name} url={m.home_team?.logo_url} size={30} rounded="full" />
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-sm text-amber-50 leading-tight truncate uppercase">
                  {m.home_team?.name ?? m.name}
                  {m.away_team && <span className="text-amber-100/50 font-normal lowercase"> vs </span>}
                  {m.away_team?.name}
                </div>
                <div className="text-[10px] text-amber-100/60 truncate">{market?.name ?? "Match winner"}</div>
              </div>
              {m.away_team && <TeamLogo name={m.away_team?.name} url={m.away_team?.logo_url} size={30} rounded="full" />}
            </Link>
            {odds.length > 0 && (
              <div className="grid gap-2 px-3 pb-3" style={{ gridTemplateColumns: `repeat(${Math.min(odds.length, 3)}, minmax(0,1fr))` }}>
                {odds.slice(0, 3).map((o) => {
                  const selected = selections.some((s) => s.odd_id === o.id);
                  const blocked = !market?.is_open || m.status === "ended";
                  return (
                    <button
                      key={o.id}
                      disabled={blocked && !selected}
                      onClick={() => {
                        if (selected) { remove(o.id); return; }
                        if (blocked) return;
                        add({ match_id: m.id, match_name: m.name, market_id: market!.id, market_name: market!.name, odd_id: o.id, selection_label: o.label, odds: Number(o.value) });
                        setOpen(true);
                      }}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded-md py-1.5 px-1.5 min-h-[36px] backdrop-blur-md transition shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_12px_-8px_rgba(0,0,0,0.7)] disabled:opacity-40 ${
                        selected
                          ? "bg-emerald-500/30 border-2 border-emerald-300 ring-2 ring-emerald-300/60 text-emerald-50"
                          : "bg-emerald-950/70 border-2 border-emerald-600/60 hover:bg-emerald-800/70 hover:border-emerald-400/80 text-emerald-50"
                      }`}
                    >
                      <span className="text-[8px] uppercase tracking-wider font-bold text-emerald-100/80 truncate max-w-full leading-none">{o.label}</span>
                      <span className="font-mono font-black text-xs text-emerald-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] leading-none">{Number(o.value).toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FutureProgress({ odd }: { odd: any }) {
  const progress = Array.isArray(odd.future_progress) ? odd.future_progress : [];
  const status = odd.future_status ?? "active";
  const latest = progress[progress.length - 1];
  const completed = progress.filter((p: any) => p && p.round != null).length;
  const tone = status === "winner" ? "text-emerald-300" : ["lost", "disqualified", "settled"].includes(status) ? "text-destructive" : "text-primary";
  const lostRound = latest?.round ?? (completed > 0 ? completed : 1);
  const headline = status === "winner"
    ? "CHAMPION"
    : status === "lost"
      ? `LOST ROUND ${lostRound}`
      : status === "disqualified"
        ? "DISQUALIFIED"
        : odd.future_next_title || `Round ${completed + 1}`;
  return (
    <div className="mt-2 border-t border-border/40 pt-2">
      <div className={`text-[10px] uppercase tracking-widest font-bold ${tone}`}>{headline}</div>
      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-gradient-gold" style={{ width: `${Math.min(100, Math.max(18, (completed + 1) * 22))}%` }} />
      </div>
      {latest?.round != null ? (
        <div className="mt-1 text-[10px] text-muted-foreground truncate">
          Round {latest.round}{latest.score ? ` · ${latest.score}` : ""}
          {latest.opponent ? ` · ${["lost", "disqualified"].includes(latest.status) ? "lost to" : "beat"} ${latest.opponent}` : ""}
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-muted-foreground truncate">
          {odd.future_next_title ? `Next: ${odd.future_next_title}` : "Awaiting next round"}
        </div>
      )}
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
    <div className="relative overflow-hidden rounded-2xl border-2 border-primary/50 bg-gradient-to-r from-emerald-950/80 via-background/80 to-emerald-950/80 px-4 py-3 shadow-[0_8px_30px_-12px_rgba(212,175,55,0.5)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-gold opacity-80" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-gold opacity-60" />
      <div className="pointer-events-none absolute -left-10 -top-10 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/50 bg-background/70 text-primary shadow-inner">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-wide gradient-gold-text truncate">{title}</h2>
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
