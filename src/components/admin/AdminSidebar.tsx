import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  BarChart3, Users, Sparkles, AlertTriangle, History, ClipboardList, Send,
  MessageSquare, Megaphone, Trophy, Calendar, Wallet, ListOrdered, Tag,
  Settings as SettingsIcon, Ticket, Coins, Dice5, Shield, Flame, Target,
  Gift, Palette,
} from "lucide-react";
import _ecbLogo from "@/assets/ecb-logo.png.asset.json";
const lslLogo = _ecbLogo.url;

export type AdminNavItem = {
  key: string;
  label: string;
  icon: any;
  admin?: boolean; // admin-only
  modOk?: boolean; // visible to mods
  alertKey?: string;
  group?: string;
};

const NAV: AdminNavItem[] = [
  // Overview
  { group: "Overview", key: "analytics",   label: "Analytics",            icon: BarChart3,       modOk: true },
  { group: "Overview", key: "activity",    label: "Activity",             icon: Users,           admin: true },
  { group: "Overview", key: "reports",     label: "Reports",              icon: BarChart3,       admin: true },
  { group: "Overview", key: "pnl",         label: "P&L",                  icon: BarChart3,       admin: true },
  { group: "Overview", key: "audit",       label: "Audit",                icon: History,         admin: true },
  { group: "Overview", key: "risk",        label: "Risk",                 icon: AlertTriangle,   admin: true },
  { group: "Overview", key: "adminai",     label: "Admin AI",             icon: Sparkles,        admin: true },

  // Users & Community
  { group: "Users & Community", key: "users",       label: "Users",                icon: Users,           modOk: true, alertKey: "users" },
  { group: "Users & Community", key: "appeals",     label: "Appeals",              icon: AlertTriangle,   modOk: true, alertKey: "appeals" },
  { group: "Users & Community", key: "clans",       label: "Clans",                icon: Shield,          admin: true },
  { group: "Users & Community", key: "emblems",     label: "Emblems",              icon: Trophy,          admin: true },
  { group: "Users & Community", key: "referrals",   label: "Referrals",            icon: Users,           admin: true },
  { group: "Users & Community", key: "chat",        label: "Chat",                 icon: MessageSquare,   modOk: true, alertKey: "chat" },
  { group: "Users & Community", key: "tickets",     label: "Tickets",              icon: Ticket,          modOk: true, alertKey: "tickets" },
  { group: "Users & Community", key: "vip",         label: "VIP",                  icon: Trophy,          admin: true },

  // Betting & Battles
  { group: "Betting & Battles", key: "matches",     label: "Matches",              icon: Trophy,          modOk: true },
  { group: "Betting & Battles", key: "bettracker",  label: "Bet Tracker",          icon: ClipboardList,   admin: true, alertKey: "bettracker" },
  { group: "Betting & Battles", key: "topbets",     label: "Top Bets",             icon: Flame,           modOk: true },
  { group: "Betting & Battles", key: "virtual",     label: "Virtual",              icon: Dice5,           admin: true },
  { group: "Betting & Battles", key: "tournaments", label: "Tournaments",          icon: Trophy,          admin: true },
  { group: "Betting & Battles", key: "futures",     label: "Futures",              icon: Target,          admin: true },
  { group: "Betting & Battles", key: "events",      label: "Events",               icon: Calendar,        admin: true },
  { group: "Betting & Battles", key: "seasons",     label: "Seasons",              icon: Trophy,          admin: true },
  { group: "Betting & Battles", key: "leaderboard", label: "Leaderboard",          icon: ListOrdered,     admin: true },

  // Wallet & Payments
  { group: "Wallet & Payments", key: "housewallet", label: "House Wallet",         icon: Wallet,          admin: true },
  { group: "Wallet & Payments", key: "withdrawals", label: "Withdrawals",          icon: Wallet,          modOk: true, alertKey: "withdrawals" },
  { group: "Wallet & Payments", key: "tokens",      label: "Tokens",               icon: Coins,           admin: true, alertKey: "tokens" },
  { group: "Wallet & Payments", key: "tokenrules",  label: "Token Rules",          icon: Coins,           admin: true },
  { group: "Wallet & Payments", key: "promos",      label: "Promo Codes",          icon: Tag,             admin: true },
  { group: "Wallet & Payments", key: "promoreqs",   label: "Promo Requests",       icon: Tag,             admin: true, alertKey: "promoreqs" },

  // Rewards & Games
  { group: "Rewards & Games", key: "lottery",     label: "Lottery",              icon: Dice5,           admin: true },
  { group: "Rewards & Games", key: "giftsspin",   label: "Gifts & Spin",         icon: Gift,            admin: true },
  { group: "Rewards & Games", key: "challenges",  label: "Challenges",           icon: Sparkles,        admin: true },
  { group: "Rewards & Games", key: "tasks",       label: "Tasks & Achievements", icon: ClipboardList,   admin: true },
  { group: "Rewards & Games", key: "surveys",     label: "Surveys",              icon: ClipboardList,   admin: true },

  // Content
  { group: "Content", key: "content",     label: "Content",              icon: Megaphone,       modOk: true },
  { group: "Content", key: "news",        label: "News",                 icon: Megaphone,       admin: true },
  { group: "Content", key: "spotlights",  label: "Spotlights",           icon: Sparkles,        modOk: true },

  // Notifications
  { group: "Notifications", key: "broadcast",   label: "Broadcast",            icon: Send,            admin: true },
  { group: "Notifications", key: "notify",      label: "Notify",               icon: Send,            modOk: true },
  { group: "Notifications", key: "streakpush",  label: "Streak & Push",        icon: Sparkles,        admin: true },

  // Configuration
  { group: "Configuration", key: "branding",    label: "Branding",             icon: Palette,         admin: true },
  { group: "Configuration", key: "settings",    label: "Settings",             icon: SettingsIcon,    admin: true },
];

export function AdminSidebar({
  activeTab,
  onSelect,
  isAdmin,
  isMod,
  alerts,
}: {
  activeTab: string;
  onSelect: (key: string) => void;
  isAdmin: boolean;
  isMod: boolean;
  alerts: Record<string, number>;
}) {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";

  const items = NAV.filter((n) => (n.admin ? isAdmin : true) || (n.modOk && (isAdmin || isMod)));

  const groups = items.reduce<Record<string, AdminNavItem[]>>((acc, it) => {
    const g = it.group ?? "Other";
    (acc[g] = acc[g] ?? []).push(it);
    return acc;
  }, {});

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20">
      <SidebarHeader className="border-b border-primary/15 px-2 py-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-gold grid place-items-center shadow-gold overflow-hidden ring-1 ring-primary/40 shrink-0">
            <img src={lslLogo} alt="ECB" className="h-7 w-7 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground leading-none">Lomita</div>
              <div className="text-sm font-bold gradient-gold-text leading-tight truncate">Admin Console</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {Object.entries(groups).map(([groupLabel, groupItems]) => (
        <SidebarGroup key={groupLabel}>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-[0.25em]">{groupLabel.toUpperCase()}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {groupItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                const count = item.alertKey ? alerts[item.alertKey] ?? 0 : 0;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => {
                        onSelect(item.key);
                        if (isMobile) setOpenMobile(false);
                      }}
                      className={`text-[12px] ${active ? "bg-primary/15 text-primary border-l-2 border-primary" : ""}`}
                      tooltip={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {count > 0 && !collapsed && (
                        <SidebarMenuBadge className="bg-destructive text-destructive-foreground">{count}</SidebarMenuBadge>
                      )}
                      {count > 0 && collapsed && (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}