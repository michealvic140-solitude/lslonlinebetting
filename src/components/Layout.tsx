import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, User as UserIcon, Shield, MessageSquare, Home, Trophy, Ticket, LifeBuoy, Wallet, Crosshair as MatchIcon, Settings as SettingsIcon, Coins, LayoutDashboard, Dice5 } from "lucide-react";
import { GangLogo } from "@/components/GangLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, ROLE_COLORS, ROLE_LABELS } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { LevelUpModal } from "@/components/Spotlight";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@tanstack/react-router";

const CHAT_SEEN_KEY = "lsl-chat-last-seen";

function useRegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
}

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

function useChatUnread() {
  const { user } = useAuth();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    const onChat = loc.pathname === "/chat";
    if (onChat) { localStorage.setItem(CHAT_SEEN_KEY, new Date().toISOString()); setUnread(0); return; }
    const since = localStorage.getItem(CHAT_SEEN_KEY) || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let cancelled = false;
    supabase.from("chat_messages").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", user.id)
      .then(({ count }) => { if (!cancelled) setUnread(count ?? 0); });
    const ch = supabase.channel("layout-chat-unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p: any) => {
        if ((p.new as any).user_id === user.id) return;
        setUnread((n) => n + 1);
      }).subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user, loc.pathname]);

  return unread;
}

export const Layout = ({ children }: { children: ReactNode }) => {
  const { user, profile, roles, isAdmin, isMod, signOut } = useAuth();
  const nav = useNavigate();
  const chatUnread = useChatUnread();
  useRegisterServiceWorker();
  useVirtualHeartbeat();
  useForceReloadBroadcast();

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse-glow" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl animate-pulse-glow" />
      </div>
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-gradient-to-b from-card/80 to-card/50 border-b border-primary/20 shadow-[0_2px_30px_-12px_rgba(0,0,0,0.6)]">
        <div className="container mx-auto px-4 flex h-16 items-center gap-3 lg:gap-4">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <GangLogo size={38} className="transition-transform group-hover:scale-105 group-hover:rotate-3 duration-300" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-[0.25em] gradient-gold-text">LOMITA</div>
              <div className="text-[9px] text-muted-foreground tracking-[0.35em]">SHOOTERS LEAGUE</div>
            </div>
          </Link>
          <nav className="hidden lg:flex flex-1 items-center justify-center gap-1 flex-nowrap">
            <NavLink to="/matches" icon={MatchIcon} label="Matches" />
            <NavLink to="/virtual" icon={Dice5} label="Virtual" />
            <NavLink to="/leaderboard" icon={Trophy} label="Leaderboard" />
            {user && <NavLink to="/chat" icon={MessageSquare} label="Chat" badge={chatUnread} />}
            {user && <NavLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" />}
            {user && <NavLink to="/checkout" icon={Coins} label="Buy" />}
            {user && <NavLink to="/withdraw" icon={Wallet} label="Withdraw" />}
            {user && <NavLink to="/support" icon={LifeBuoy} label="Support" />}
            {user && <NavLink to="/settings" icon={SettingsIcon} label="Settings" />}
            {(isAdmin || isMod) && <NavLink to="/admin" icon={Shield} label={isAdmin ? "Admin" : "Mod"} danger />}
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
      <main className="relative">{children}</main>
      <LevelUpModal />
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-2xl border-t safe-bottom"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.22 0.06 70 / 0.78) 0%, oklch(0.16 0.05 90 / 0.92) 55%, oklch(0.14 0.06 158 / 0.95) 100%)",
          borderColor: "oklch(0.62 0.14 80 / 0.45)",
          boxShadow:
            "0 -10px 32px -10px oklch(0 0 0 / 0.7), inset 0 1px 0 oklch(0.95 0.08 92 / 0.10), 0 -1px 24px -6px oklch(0.55 0.14 158 / 0.35)",
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary to-emerald/70" />
        <div className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top,oklch(0.65_0.17_158/0.18),transparent_65%)]" />
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex items-stretch justify-around gap-0.5 px-1.5 py-1.5 w-full min-w-max">
            <MobLink to="/" icon={Home} label="Home" />
            <MobLink to="/matches" icon={MatchIcon} label="Matches" />
            <MobLink to="/virtual" icon={Dice5} label="Virtual" />
            <MobLink to="/leaderboard" icon={Trophy} label="Top" />
            {user && <>
              <MobLink to="/dashboard" icon={Ticket} label="Bets" />
              <MobLink to="/chat" icon={MessageSquare} label="Chat" badge={chatUnread} />
              <MobLink to="/profile" icon={UserIcon} label="Profile" />
              <MobLink to="/settings" icon={SettingsIcon} label="Settings" />
              <MobLink to="/support" icon={LifeBuoy} label="Help" />
            </>}
            {(isAdmin || isMod) && <MobLink to="/admin" icon={Shield} label={isAdmin ? "Admin" : "Mod"} />}
          </div>
        </div>
      </nav>
      <div className="lg:hidden h-20" />
      <SiteFooter />
    </div>
  );
};

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function SiteFooter() {
  const [s, setS] = useState<any>(null);
  const [open, setOpen] = useState<"terms" | "about" | null>(null);
  useEffect(() => { supabase.from("app_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => setS(data)); }, []);
  return (
    <footer className="border-t border-border mt-20 backdrop-blur-xl bg-card/40">
      <div className="container mx-auto px-4 py-10 grid md:grid-cols-3 gap-6 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-2"><GangLogo size={28} withGlow={false} /><span className="font-bold tracking-widest gradient-gold-text">LOMITA SHOOTERS LEAGUE</span></div>
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
      className="group relative flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[58px] text-[10px] font-semibold tracking-wide text-muted-foreground transition-all duration-200 hover:text-foreground active:scale-95 [&.active]:text-primary"
    >
      <span className="pointer-events-none absolute inset-x-2 top-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-[.active]:opacity-100 transition-opacity" />
      <span className="relative grid place-items-center h-9 w-9 rounded-xl transition-all group-[.active]:bg-gradient-to-br group-[.active]:from-primary/25 group-[.active]:to-primary/5 group-[.active]:shadow-[0_0_18px_-4px_rgba(212,175,55,0.55)]">
        <Icon className="h-[18px] w-[18px] transition-transform group-[.active]:scale-110" />
        {badge && badge > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-black grid place-items-center ring-2 ring-card animate-pulse">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className="leading-none">{label}</span>
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
