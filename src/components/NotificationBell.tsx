import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Notif = { id: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string };

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    if (!user) { setItems([]); return; }
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setItems((data ?? []) as Notif[]);
    };
    load();
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        load,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const unread = items.filter((i) => !i.is_read).length;

  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };
  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
  };
  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center px-1 animate-pulse">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0 glass-strong">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-sm font-bold tracking-widest">NOTIFICATIONS</div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAll}><Check className="h-3 w-3 mr-1" />Read</Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll}><Trash2 className="h-3 w-3 mr-1" />Clear</Button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
          )}
          {items.map((n) => {
            const inner = (
              <div className={`px-3 py-2.5 border-b border-border/60 hover:bg-muted/40 ${!n.is_read ? "bg-primary/5" : ""}`}>
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-destructive shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link} onClick={() => markOne(n.id)} className="block">{inner}</Link>
            ) : (
              <button key={n.id} onClick={() => markOne(n.id)} className="w-full text-left">{inner}</button>
            );
          })}
        </div>
        <div className="border-t border-border p-2 text-center">
          <Link to="/notifications" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {unread > 0 && <Badge className="hidden">{unread}</Badge>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
