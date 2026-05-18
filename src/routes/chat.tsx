import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageSquare, Send, Image as ImageIcon, Lock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type AppRole } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Community Chat — LSL" }, { name: "description", content: "Live chat with shooters, your gang, and moderators." }] }),
  component: ChatPage,
});

type Room = "general" | "gang" | "moderator";

function ChatPage() {
  const { user, profile, isMod, roles } = useAuth();
  const nav = useNavigate();
  const [room, setRoom] = useState<Room>("general");

  useEffect(() => { if (!user) nav({ to: "/login" }); }, [user, nav]);
  if (!user || !profile) return <Layout><div className="container py-10">Loading…</div></Layout>;

  const canGang = ["gang_leader", "moderator", "admin"].some((r) => roles.includes(r as any));

  return (
    <Layout>
      <div className="container py-10 max-w-3xl">
        <h1 className="text-3xl font-bold gradient-gold-text flex items-center gap-2"><MessageSquare className="h-6 w-6" />Community Chat</h1>
        <p className="text-muted-foreground text-sm mt-1">Be respectful. Mods can mute or ban abusive accounts.</p>
        <Tabs value={room} onValueChange={(v) => setRoom(v as Room)} className="mt-6">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="gang" disabled={!canGang}>{!canGang && <Lock className="h-3 w-3 mr-1" />}Gang</TabsTrigger>
            <TabsTrigger value="moderator" disabled={!isMod}>{!isMod && <Lock className="h-3 w-3 mr-1" />}Moderator</TabsTrigger>
          </TabsList>
          <TabsContent value={room} className="mt-3"><Room room={room} muted={profile.is_muted} /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function Room({ room, muted }: { room: Room; muted: boolean }) {
  const { user, isMod } = useAuth();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [profilesById, setProfilesById] = useState<Record<string, { name: string; gang: string | null }>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    supabase.from("chat_messages").select("*").eq("room", room).order("created_at", { ascending: true }).limit(100)
      .then(async ({ data, error }) => {
        if (!mounted) return;
        if (error) { toast.error(error.message); return; }
        setMsgs(data ?? []);
        await loadProfiles((data ?? []).map((m: any) => m.user_id));
      });
    const ch = supabase.channel(`chat-${room}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room=eq.${room}` }, async (p) => {
        setMsgs((prev) => [...prev, p.new]);
        await loadProfiles([(p.new as any).user_id]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (p) => {
        setMsgs((prev) => prev.filter((m) => m.id !== (p.old as any).id));
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [room]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function loadProfiles(ids: string[]) {
    const need = Array.from(new Set(ids)).filter((id) => id && !profilesById[id]);
    if (need.length === 0) return;
    const { data } = await supabase.from("profiles").select("id,full_name,gang_name").in("id", need);
    const next = { ...profilesById };
    (data ?? []).forEach((p: any) => { next[p.id] = { name: p.full_name, gang: p.gang_name }; });
    setProfilesById(next);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    const { error } = await supabase.from("chat_messages").insert({ user_id: user.id, room, content: text.trim() });
    if (error) toast.error(error.message); else setText("");
  }

  async function pickImage(file: File) {
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: ue } = await supabase.storage.from("chat-images").upload(path, file);
    if (ue) { toast.error(ue.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("chat-images").getPublicUrl(path);
    await supabase.from("chat_messages").insert({ user_id: user.id, room, image_url: publicUrl });
  }

  async function del(id: string) {
    const { error } = await supabase.from("chat_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  return (
    <Card className="glass-strong flex flex-col h-[60vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && <p className="text-muted-foreground text-sm text-center">Be the first to say something.</p>}
        {msgs.map((m: any) => {
          const p = profilesById[m.user_id];
          return (
            <div key={m.id} className="flex gap-3 group">
              <div className="h-9 w-9 rounded-full bg-gradient-gold grid place-items-center text-primary-foreground font-bold text-xs shrink-0">
                {(p?.name ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs">
                    <UserBadge userId={m.user_id} name={p?.name ?? "Shooter"} />
                    <span className="text-muted-foreground ml-1">· {p?.gang ?? "Independent"} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {m.content && <div className="text-sm break-words">{m.content}</div>}
                {m.image_url && <img src={m.image_url} alt="" className="mt-1 rounded max-h-64 border border-border" />}
              </div>
              {(isMod || m.user_id === user?.id) && (
                <button onClick={() => del(m.id)} className="opacity-0 group-hover:opacity-100 text-xs text-destructive">×</button>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {muted ? (
        <div className="p-3 border-t border-border text-sm text-destructive text-center">You are muted and cannot send messages.</div>
      ) : (
        <form onSubmit={send} className="p-3 border-t border-border flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])} />
          <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()}><ImageIcon className="h-4 w-4" /></Button>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something…" />
          <Button type="submit" className="btn-luxury"><Send className="h-4 w-4" /></Button>
        </form>
      )}
    </Card>
  );
}

function UserBadge({ userId, name }: { userId: string; name: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || profile) return;
    (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, ingame_name, gang_name, vip_tier, xp, streak_days, longest_streak, profile_title, avatar_url, country").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      setProfile(p);
      setRoles((r ?? []).map((x: any) => x.role));
    })();
  }, [open, userId, profile]);

  const tier = profile?.vip_tier || "bronze";
  const tierColor: Record<string, string> = {
    bronze: "from-amber-700 to-amber-900",
    silver: "from-slate-300 to-slate-500",
    gold: "from-amber-300 to-amber-600",
    platinum: "from-cyan-200 to-cyan-500",
    legend: "from-fuchsia-300 to-violet-600",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="font-bold text-primary hover:underline">{name}</button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 overflow-hidden border-primary/40 bg-card/95 backdrop-blur-xl">
        <div className={`h-16 bg-gradient-to-r ${tierColor[tier] ?? tierColor.bronze}`} />
        <div className="-mt-8 px-4 pb-4">
          <div className="h-16 w-16 rounded-2xl border-2 border-card bg-gradient-gold grid place-items-center text-primary-foreground font-bold shadow-xl">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full rounded-2xl object-cover" /> : (name).slice(0, 2).toUpperCase()}
          </div>
          <div className="mt-2 font-bold text-base">{profile?.ingame_name || profile?.full_name || name}</div>
          {profile?.profile_title && <div className="text-xs text-amber-300">{profile.profile_title}</div>}
          <div className="text-xs text-muted-foreground">{profile?.gang_name ?? "Independent"}{profile?.country ? ` · ${profile.country}` : ""}</div>

          <div className="flex flex-wrap gap-1 mt-3">
            <Badge variant="outline" className="text-[10px] uppercase border-primary/40 text-primary capitalize">{tier} VIP</Badge>
            {roles.length === 0 && <Badge variant="outline" className="text-[10px]">Viewer</Badge>}
            {roles.map((r) => <Badge key={r} variant="outline" className="text-[10px]">{ROLE_LABELS[r as AppRole] ?? r}</Badge>)}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border/60 bg-background/40 p-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">XP</div>
              <div className="font-bold gradient-gold-text text-sm">{Number(profile?.xp ?? 0).toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Streak</div>
              <div className="font-bold text-amber-300 text-sm">{profile?.streak_days ?? 0}🔥</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Best</div>
              <div className="font-bold text-emerald-300 text-sm">{profile?.longest_streak ?? 0}</div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
