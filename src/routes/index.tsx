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
import { Countdown } from "@/components/Countdown";
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
      <FuturesSection title={settings?.futures_section_title || "TOURNAMENT FUTURES"} markets={futures} maxSelections={Number(settings?.futures_max_selections ?? 1)} />

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

function FuturesSection({ title, markets, maxSelections }: { title: string; markets: MatchRow[]; maxSelections: number }) {
  const { selections, add, remove, setOpen } = useBetSlip();
  return (
    <section className="container mt-10">
      <div className="flex items-end justify-between gap-3 mb-4">
        <SectionHeader icon={Trophy} title={title} subtitle={`Season-long markets · pick up to ${maxSelections} contender${maxSelections === 1 ? "" : "s"}.`} />
        <Badge variant="outline" className="border-accent/40 text-accent">Seasonal</Badge>
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
    <div className="flex items-end justify-between border-b border-border pb-2">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
