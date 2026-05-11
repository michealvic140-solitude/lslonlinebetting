import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, User as UserIcon, Shield, MessageSquare, Home, Trophy, Ticket, LifeBuoy, Wallet, Crosshair as MatchIcon } from "lucide-react";
import { GangLogo } from "@/components/GangLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, ROLE_COLORS, ROLE_LABELS } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@tanstack/react-router";

const CHAT_SEEN_KEY = "lsl-chat-last-seen";

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
  const { user, profile, roles, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const chatUnread = useChatUnread();

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse-glow" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl animate-pulse-glow" />
      </div>
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-card/60 border-b border-border">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group">
            <GangLogo size={36} className="transition-transform group-hover:scale-105" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-widest gradient-gold-text">LOMITA</div>
              <div className="text-[10px] text-muted-foreground tracking-[0.3em]">SHOOTERS LEAGUE</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link to="/matches"><Button variant="ghost" size="sm">Matches</Button></Link>
            <Link to="/leaderboard"><Button variant="ghost" size="sm">Leaderboard</Button></Link>
            {user && <Link to="/chat"><Button variant="ghost" size="sm" className="relative"><MessageSquare className="h-4 w-4" />Chat{chatUnread > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-black grid place-items-center animate-pulse">{chatUnread > 9 ? "9+" : chatUnread}</span>}</Button></Link>}
            {user && <Link to="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>}
            {user && <Link to="/checkout"><Button variant="ghost" size="sm">Buy</Button></Link>}
            {user && <Link to="/withdraw"><Button variant="ghost" size="sm"><Wallet className="h-4 w-4" />Withdraw</Button></Link>}
            {user && <Link to="/support"><Button variant="ghost" size="sm">Support</Button></Link>}
            {isAdmin && <Link to="/admin"><Button variant="ghost" size="sm" className="text-destructive"><Shield className="h-4 w-4" />Admin</Button></Link>}
          </nav>
          <div className="flex items-center gap-2">
            {user && profile ? (
              <>
                <div className="hidden sm:flex flex-col items-end leading-tight">
                  <span className="text-xs text-muted-foreground">Tokens</span>
                  <span className="text-sm font-bold text-primary">{profile.token_balance.toLocaleString()}</span>
                </div>
                <NotificationBell />
                <Link to="/profile">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <UserIcon className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">{profile.full_name}</span>
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={async () => { await signOut(); nav({ to: "/" }); }}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
                <Link to="/register"><Button size="sm">Join League</Button></Link>
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl bg-card/80 border-t border-border safe-bottom">
        <div className="overflow-x-auto">
          <div className="flex items-center gap-1 px-2 py-2 min-w-max">
            <MobLink to="/" icon={Home} label="Home" />
            <MobLink to="/matches" icon={MatchIcon} label="Matches" />
            <MobLink to="/leaderboard" icon={Trophy} label="Top" />
            {user && <>
              <MobLink to="/dashboard" icon={Ticket} label="Bets" />
              <MobLink to="/chat" icon={MessageSquare} label="Chat" badge={chatUnread} />
              <MobLink to="/profile" icon={UserIcon} label="Profile" />
              <MobLink to="/support" icon={LifeBuoy} label="Help" />
            </>}
            {isAdmin && <MobLink to="/admin" icon={Shield} label="Admin" />}
          </div>
        </div>
      </nav>
      <div className="md:hidden h-20" />
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
    <Link to={to} className="relative flex flex-col items-center px-3 py-1 rounded-lg text-[10px] min-w-[60px] text-muted-foreground [&.active]:text-primary [&.active]:bg-primary/10" activeProps={{ className: "active" }}>
      <span className="relative">
        <Icon className="h-5 w-5 mb-0.5" />
        {badge && badge > 0 ? <span className="absolute -top-1 -right-2 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-black grid place-items-center animate-pulse">{badge > 9 ? "9+" : badge}</span> : null}
      </span>
      {label}
    </Link>
  );
}
