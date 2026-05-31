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
  Settings as SettingsIcon, Ticket, Coins, Dice5,
} from "lucide-react";
import lslLogo from "@/assets/lsl-logo.png";

export type AdminNavItem = {
  key: string;
  label: string;
  icon: any;
  admin?: boolean; // admin-only
  modOk?: boolean; // visible to mods
  alertKey?: string;
};

const NAV: AdminNavItem[] = [
  { key: "analytics",   label: "Analytics",            icon: BarChart3,       modOk: true },
  { key: "activity",    label: "Activity",             icon: Users,           admin: true },
  { key: "adminai",     label: "Admin AI",             icon: Sparkles,        admin: true },
  { key: "appeals",     label: "Appeals",              icon: AlertTriangle,   modOk: true, alertKey: "appeals" },
  { key: "audit",       label: "Audit",                icon: History,         admin: true },
  { key: "bettracker",  label: "Bet Tracker",          icon: ClipboardList,   admin: true, alertKey: "bettracker" },
  { key: "broadcast",   label: "Broadcast",            icon: Send,            admin: true },
  { key: "challenges",  label: "Challenges",           icon: Sparkles,        admin: true },
  { key: "chat",        label: "Chat",                 icon: MessageSquare,   modOk: true, alertKey: "chat" },
  { key: "content",     label: "Content",              icon: Megaphone,       modOk: true },
  { key: "emblems",     label: "Emblems",              icon: Trophy,          admin: true },
  { key: "events",      label: "Events",               icon: Calendar,        admin: true },
  { key: "housewallet", label: "House Wallet",         icon: Wallet,          admin: true },
  { key: "leaderboard", label: "Leaderboard",          icon: ListOrdered,     admin: true },
  { key: "matches",     label: "Matches",              icon: Trophy,          modOk: true },
  { key: "notify",      label: "Notify",               icon: Send,            modOk: true },
  { key: "pnl",         label: "P&L",                  icon: BarChart3,       admin: true },
  { key: "promos",      label: "Promo Codes",          icon: Tag,             admin: true },
  { key: "promoreqs",   label: "Promo Requests",       icon: Tag,             admin: true, alertKey: "promoreqs" },
  { key: "referrals",   label: "Referrals",            icon: Users,           admin: true },
  { key: "reports",     label: "Reports",              icon: BarChart3,       admin: true },
  { key: "risk",        label: "Risk",                 icon: AlertTriangle,   admin: true },
  { key: "seasons",     label: "Seasons",              icon: Trophy,          admin: true },
  { key: "settings",    label: "Settings",             icon: SettingsIcon,    admin: true },
  { key: "spotlights",  label: "Spotlights",           icon: Sparkles,        modOk: true },
  { key: "streakpush",  label: "Streak & Push",        icon: Sparkles,        admin: true },
  { key: "tasks",       label: "Tasks & Achievements", icon: ClipboardList,   admin: true },
  { key: "tickets",     label: "Tickets",              icon: Ticket,          modOk: true, alertKey: "tickets" },
  { key: "tokens",      label: "Tokens",               icon: Coins,           modOk: true, alertKey: "tokens" },
  { key: "tokenrules",  label: "Token Rules",          icon: Coins,           admin: true },
  { key: "users",       label: "Users",                icon: Users,           modOk: true, alertKey: "users" },
  { key: "virtual",     label: "Virtual",              icon: Dice5,           admin: true },
  { key: "vip",         label: "VIP",                  icon: Trophy,          admin: true },
  { key: "withdrawals", label: "Withdrawals",          icon: Wallet,          modOk: true, alertKey: "withdrawals" },
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

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20">
      <SidebarHeader className="border-b border-primary/15 px-2 py-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-gold grid place-items-center shadow-gold overflow-hidden ring-1 ring-primary/40 shrink-0">
            <img src={lslLogo} alt="LSL" className="h-7 w-7 object-contain" />
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
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-[0.25em]">NAVIGATION</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
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
      </SidebarContent>
    </Sidebar>
  );
}