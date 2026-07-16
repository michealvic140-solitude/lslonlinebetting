import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Crosshair as MatchIcon, Dice5, Clover, Gamepad2, ShoppingBag, Trophy, Swords,
  LayoutDashboard, ListChecks, Coins, Wallet, LifeBuoy, Settings as SettingsIcon,
  Shield, Menu as MenuIcon, ChevronDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Item = { to: string; icon: any; label: string; danger?: boolean };

/**
 * Compact menu trigger shown next to the home banner. It matches the banner
 * height and opens a scrollable dropdown panel of every section on click.
 * A subtle pulse ring makes it easy for new users to spot.
 */
export function HomeQuickMenu() {
  const { user, isAdmin, isMod } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const items: Item[] = [
    { to: "/matches", icon: MatchIcon, label: "Matches" },
    { to: "/virtual", icon: Dice5, label: "Virtual" },
    { to: "/lottery", icon: Clover, label: "Lottery" },
    { to: "/arcade", icon: Gamepad2, label: "Arcade" },
    { to: "/shop", icon: ShoppingBag, label: "Shop" },
    { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
    { to: "/tournament", icon: Swords, label: "Tournament" },
    ...(user ? [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/tasks", icon: ListChecks, label: "Tasks" },
      { to: "/checkout", icon: Coins, label: "Buy Tokens" },
      { to: "/withdraw", icon: Wallet, label: "Withdraw" },
      { to: "/support", icon: LifeBuoy, label: "Support" },
      { to: "/settings", icon: SettingsIcon, label: "Settings" },
    ] : []),
    ...(isAdmin ? [{ to: "/admin", icon: Shield, label: "Admin", danger: true }] : []),
    ...(!isAdmin && isMod ? [{ to: "/mod", icon: Shield, label: "Mod", danger: true }] : []),
  ];

  return (
    <div ref={ref} className="relative shrink-0 self-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open menu"
        className="group relative h-full w-[76px] sm:w-[92px] md:w-[108px] flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary shadow-[0_0_30px_-10px_rgba(212,175,55,0.6)] transition-all hover:from-primary/30 active:scale-95"
      >
        {!open && <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-primary/40 animate-pulse" />}
        <MenuIcon className="h-6 w-6 sm:h-7 sm:w-7" />
        <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em] flex items-center gap-0.5">
          Menu <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 max-h-[60vh] overflow-y-auto glass rounded-2xl border border-primary/30 shadow-2xl animate-in fade-in slide-in-from-top-2">
          <div className="sticky top-0 flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent backdrop-blur">
            <MenuIcon className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.22em] gradient-gold-text">Quick Menu</span>
          </div>
          <nav className="divide-y divide-border/40">
            {items.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                onClick={() => setOpen(false)}
                activeProps={{ className: "active" }}
                className={`group flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold transition-colors
                  text-muted-foreground hover:text-foreground hover:bg-primary/5
                  [&.active]:text-primary [&.active]:bg-primary/10
                  ${it.danger ? "hover:text-destructive [&.active]:!text-destructive" : ""}`}
              >
                <it.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{it.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
