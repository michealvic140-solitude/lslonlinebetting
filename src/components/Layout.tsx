import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, User as UserIcon, Shield, MessageSquare, Home, Trophy, Ticket, LifeBuoy, Wallet, Crosshair as MatchIcon, Settings as SettingsIcon, Coins, LayoutDashboard, Dice5, Swords, Clover, ClipboardList, ListChecks, Gamepad2, ShoppingBag } from "lucide-react";
import { GangLogo } from "@/components/GangLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, ROLE_COLORS, ROLE_LABELS } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { LevelUpModal } from "@/components/Spotlight";
import { GlobalWinAnimation } from "@/components/GlobalWinAnimation";
import { BetSuccessPopout } from "@/components/BetSuccessPopout";
import { SurveyPopout } from "@/components/SurveyPopout";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@tanstack/react-router";
import lslPlatformBg from "@/assets/lsl-bg-nebula.png.asset.json";

// Site-wide background ticker so virtual rounds keep advancing even when
// no one is on /virtual. Any authenticated client pings every 15s.
function useVirtualHeartbeat() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const ping = () => { supabase.rpc("virtual_tick").then(() => {}, () => {}); };
    ping();
    const t = setInterval(() => { if (alive) ping(); }, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);
}

// Admin "Broadcast reload" — every active browser refreshes when force_reload_at bumps.
function useForceReloadBroadcast() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "lsl-last-force-reload";
    let seen = localStorage.getItem(KEY) ?? "";
    supabase.from("app_settings").select("force_reload_at").eq("id", 1).maybeSingle().then(({ data }) => {
      const v = (data as any)?.force_reload_at as string | null;
      if (v && !seen) { localStorage.setItem(KEY, v); seen = v; }
    });
    const ch = supabase.channel("force-reload")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, (p: any) => {
        const v = p.new?.force_reload_at as string | null;
        if (v && v !== seen) { localStorage.setItem(KEY, v); window.location.reload(); }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
}

export const Layout = ({ children }: { children: ReactNode }) => {
  const { user, profile, roles, isAdmin, isMod, signOut } = useAuth();
  const nav = useNavigate();
  useVirtualHeartbeat();
  useForceReloadBroadcast();
  const [railOpen, setRailOpen] = useState(false);
  // Admin-configurable site-wide background + branding (fall back to bundled art).
  const [siteBg, setSiteBg] = useState<string | null>(null);
  const [bgFit, setBgFit] = useState<string>("cover");
  const [bgPos, setBgPos] = useState<string>("center");
  const [siteName, setSiteName] = useState<string | null>(null);
  const [navBg, setNavBg] = useState<string | null>(null);
  const [navBgFit, setNavBgFit] = useState<string>("cover");
  const [navBgPos, setNavBgPos] = useState<string>("center");
  useEffect(() => {
    const apply = (d: any) => {
      setSiteBg(d?.site_bg_url ?? null);
      setBgFit(d?.site_bg_fit ?? "cover");
      setBgPos(d?.site_bg_position ?? "center");
      setSiteName(d?.site_name ?? null);
      setNavBg(d?.nav_bg_url ?? null);
      setNavBgFit(d?.nav_bg_fit ?? "cover");
      setNavBgPos(d?.nav_bg_position ?? "center");
    };
    supabase.from("app_settings").select("site_bg_url,site_bg_fit,site_bg_position,site_name,nav_bg_url,nav_bg_fit,nav_bg_position").eq("id", 1).maybeSingle()
      .then(({ data }) => apply(data));
    const ch = supabase.channel("site-bg")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, (p: any) => apply(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <img
          src={siteBg || lslPlatformBg.url}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: (bgFit as any) || "cover", objectPosition: bgPos || "center" }}
        />
        <div className="absolute inset-0 bg-background/40" />
      </div>
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-gradient-to-b from-card/80 to-card/50 border-b border-primary/20 shadow-[0_2px_30px_-12px_rgba(0,0,0,0.6)]">
        {navBg && (
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <img
              src={navBg}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full"
              style={{ objectFit: (navBgFit as any) || "cover", objectPosition: navBgPos || "center" }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/55 via-background/45 to-background/65" />
          </div>
        )}
        <div className="container mx-auto px-4 flex h-16 items-center gap-3 lg:gap-4 relative">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <GangLogo size={38} className="transition-transform group-hover:scale-105 group-hover:rotate-3 duration-300" />
            <div className="leading-tight">
              {siteName ? (
                <div className="text-sm font-extrabold tracking-[0.18em] gradient-gold-text uppercase max-w-[160px] truncate">{siteName}</div>
              ) : (
                <>
                  <div className="text-sm font-extrabold tracking-[0.25em] gradient-gold-text">LOMITA</div>
                  <div className="text-[9px] text-muted-foreground tracking-[0.35em]">SHOOTERS LEAGUE</div>
                </>
              )}
            </div>
          </Link>
          <nav className="hidden lg:flex flex-1 items-center justify-center gap-1 flex-nowrap">
            <NavLink to="/matches" icon={MatchIcon} label="Matches" />
            <NavLink to="/virtual" icon={Dice5} label="Virtual" />
            <NavLink to="/lottery" icon={Clover} label="Lottery" />
            <NavLink to="/arcade" icon={Gamepad2} label="Arcade" />
            <NavLink to="/shop" icon={ShoppingBag} label="Shop" />
            <NavLink to="/leaderboard" icon={Trophy} label="Leaderboard" />
            <NavLink to="/tournament" icon={Swords} label="Tournament" />
            {user && <NavLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" />}
            {user && <NavLink to="/tasks" icon={ListChecks} label="Tasks" />}
            {user && <NavLink to="/surveys" icon={ClipboardList} label="Surveys" />}
            {user && <NavLink to="/checkout" icon={Coins} label="Buy" />}
            {user && <NavLink to="/withdraw" icon={Wallet} label="Withdraw" />}
            {user && <NavLink to="/support" icon={LifeBuoy} label="Support" />}
            {user && <NavLink to="/settings" icon={SettingsIcon} label="Settings" />}
            {isAdmin && <NavLink to="/admin" icon={Shield} label="Admin" danger />}
            {!isAdmin && isMod && <NavLink to="/mod" icon={Shield} label="Mod" danger />}
          </nav>
          <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
            {user && profile ? (
              <>
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/5 shadow-[0_0_15px_-5px_rgba(212,175,55,0.4)]">
                  <Coins className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-black text-primary leading-none tabular-nums">{profile.token_balance.toLocaleString()}</span>
                </div>
                <NotificationBell />
                <Link to="/profile">
                  <Button variant="ghost" size="sm" className="gap-2 rounded-full border border-transparent hover:border-primary/30">
                    <span className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center"><UserIcon className="h-3.5 w-3.5" /></span>
                    <span className="hidden xl:inline text-xs font-semibold max-w-[100px] truncate">{profile.full_name}</span>
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-destructive/10 hover:text-destructive" onClick={async () => { await signOut(); nav({ to: "/" }); }} title="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
                <Link to="/register"><Button size="sm" className="btn-luxury">Join League</Button></Link>
              </>
            )}
          </div>
        </div>
        {user && roles.length > 0 && (
          <div className="container mx-auto px-4 pb-2 flex flex-wrap gap-1">
            {roles.map((r) => <Badge key={r} variant="outline" className={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Badge>)}
          </div>
        )}
      </header>
      <main className="relative lg:pl-0 pl-16 overflow-x-hidden">{children}</main>
      <LevelUpModal />
      <GlobalWinAnimation />
      <BetSuccessPopout />
      <SurveyPopout />
      <PushPermissionPrompt />
      <nav
        className="lg:hidden fixed left-0 inset-y-0 pt-16 z-40 w-16 overflow-y-auto bg-transparent border-0 shadow-none"
      >
        <div className="flex flex-col items-stretch gap-4 py-4 px-1">
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-expanded={railOpen}
            aria-label={railOpen ? "Collapse menu" : "Expand menu"}
            className="group relative flex flex-col items-center justify-center gap-1 px-0 py-1 rounded-xl text-[10px] font-semibold tracking-wide text-primary transition-all hover:text-foreground active:scale-95"
            title="Menu"
          >
            <span className="relative grid place-items-center h-[52px] w-[52px] rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 shadow-[0_0_18px_-4px_rgba(212,175,55,0.55)]">
              <SettingsIcon className={`h-7 w-7 transition-transform ${railOpen ? "rotate-180" : ""}`} />
            </span>
            <span className="leading-none text-[9px]">{railOpen ? "Less" : "More"}</span>
          </button>
          <MobLink to="/" icon={Home} label="Home" />
          {railOpen && <>
          <MobLink to="/matches" icon={MatchIcon} label="Matches" />
          <MobLink to="/virtual" icon={Dice5} label="Virtual" />
          <MobLink to="/lottery" icon={Clover} label="Lottery" />
          <MobLink to="/arcade" icon={Gamepad2} label="Arcade" />
          <MobLink to="/leaderboard" icon={Trophy} label="Top" />
          <MobLink to="/tournament" icon={Swords} label="Bracket" />
          {user && <>
            <MobLink to="/dashboard" icon={Ticket} label="ME" />
            <MobLink to="/tasks" icon={ListChecks} label="Tasks" />
            <MobLink to="/surveys" icon={ClipboardList} label="Surveys" />
            <MobLink to="/profile" icon={UserIcon} label="Profile" />
            <MobLink to="/settings" icon={SettingsIcon} label="Settings" />
            <MobLink to="/support" icon={LifeBuoy} label="Help" />
          </>}
          {isAdmin && <MobLink to="/admin" icon={Shield} label="Admin" />}
          {!isAdmin && isMod && <MobLink to="/mod" icon={Shield} label="Mod" />}
          </>}
        </div>
      </nav>
      <div className="lg:hidden h-0" />
      <SiteFooter />
    </div>
  );
};

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function SiteFooter() {
  const [s, setS] = useState<any>(null);
  const [open, setOpen] = useState<"terms" | "about" | null>(null);
  useEffect(() => {
    supabase.from("app_settings")
      .select("site_name,about_us,why_trust_us,terms_content,contact_email,contact_phone,contact_whatsapp")
      .eq("id", 1).maybeSingle().then(({ data }) => setS(data));
  }, []);
  return (
    <footer className="border-t border-border mt-20 backdrop-blur-xl bg-card/40 lg:pl-0 pl-16">
      <div className="container mx-auto px-4 py-10 grid md:grid-cols-3 gap-6 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-2"><GangLogo size={28} withGlow={false} /><span className="font-bold tracking-widest gradient-gold-text uppercase">{s?.site_name || "LOMITA SHOOTERS LEAGUE"}</span></div>
          <p className="text-muted-foreground text-xs">Virtual token-only platform · No real money gambling.</p>
        </div>
        <div>
          <div className="font-bold mb-2">About</div>
          <p className="text-muted-foreground text-xs line-clamp-3">{s?.about_us ?? "The premier virtual shooting circuit."}</p>
          <div className="flex gap-3 mt-2 text-xs">
            <button className="text-primary hover:underline" onClick={() => setOpen("about")}>Read more</button>
            <button className="text-primary hover:underline" onClick={() => setOpen("terms")}>Terms & Conditions</button>
          </div>
        </div>
        <div>
          <div className="font-bold mb-2">Contact</div>
          <ul className="text-muted-foreground text-xs space-y-1">
            {s?.contact_email && <li>Email: <a href={`mailto:${s.contact_email}`} className="text-primary">{s.contact_email}</a></li>}
            {s?.contact_phone && <li>Phone: {s.contact_phone}</li>}
            {s?.contact_whatsapp && <li>WhatsApp: {s.contact_whatsapp}</li>}
          </ul>
        </div>
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{open === "terms" ? "Terms & Conditions" : "About Us"}</DialogTitle></DialogHeader>
          <div className="text-sm whitespace-pre-wrap text-muted-foreground">
            {open === "terms" ? (s?.terms_content ?? "Terms not set.") : (s?.about_us ?? "About not set.")}
            {open === "about" && s?.why_trust_us && <><div className="font-bold mt-4 text-foreground">Why trust us</div>{s.why_trust_us}</>}
          </div>
        </DialogContent>
      </Dialog>
    </footer>
  );
}

function MobLink({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string; badge?: number }) {
  return (
    <Link
      to={to}
      activeProps={{ className: "active" }}
      className="group relative flex flex-col items-center justify-center gap-1 px-0 py-1 rounded-xl text-[10px] font-semibold tracking-wide text-muted-foreground transition-all duration-200 hover:text-foreground active:scale-95 [&.active]:text-primary"
      title={label}
    >
      <span className="pointer-events-none absolute left-0 inset-y-2 w-[2px] rounded-full bg-gradient-to-b from-transparent via-primary to-transparent opacity-0 group-[.active]:opacity-100 transition-opacity" />
      <span className="relative grid place-items-center h-[52px] w-[52px] rounded-xl transition-all group-[.active]:bg-gradient-to-br group-[.active]:from-primary/25 group-[.active]:to-primary/5 group-[.active]:shadow-[0_0_18px_-4px_rgba(212,175,55,0.55)]">
        <Icon className="h-7 w-7 transition-transform group-[.active]:scale-110" />
        {badge && badge > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-black grid place-items-center ring-2 ring-card animate-pulse">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className="leading-none text-[9px] truncate max-w-[56px]">{label}</span>
    </Link>
  );
}

function NavLink({ to, icon: Icon, label, badge, danger }: { to: string; icon: any; label: string; badge?: number; danger?: boolean }) {
  return (
    <Link
      to={to}
      activeProps={{ className: "active" }}
      className={`group relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all
        text-muted-foreground hover:text-foreground hover:bg-primary/5
        [&.active]:text-primary [&.active]:bg-gradient-to-b [&.active]:from-primary/15 [&.active]:to-primary/5
        ${danger ? "hover:text-destructive [&.active]:!text-destructive [&.active]:!from-destructive/15 [&.active]:!to-destructive/5" : ""}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-black grid place-items-center animate-pulse">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
      <span className="pointer-events-none absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-[.active]:opacity-100 transition-opacity" />
    </Link>
  );
}
