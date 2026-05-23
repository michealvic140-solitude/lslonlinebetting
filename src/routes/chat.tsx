import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageSquare, Send, Image as ImageIcon, Lock, Reply, Pencil, Smile, Trash2, X, AtSign } from "lucide-react";
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
  const [reactions, setReactions] = useState<Record<string, any[]>>({});
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [active, setActive] = useState<any>(null);
  const [profilesById, setProfilesById] = useState<Record<string, { name: string; gang: string | null }>>({});
  const [members, setMembers] = useState<any[]>([]);
  const holdRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const mentionTerm = useMemo(() => {
    const m = text.match(/@([\w\s.-]{0,24})$/);
    return m ? m[1].toLowerCase() : null;
  }, [text]);
  const mentionMatches = useMemo(() => mentionTerm === null ? [] : members.filter((m) => String(m.full_name ?? "").toLowerCase().includes(mentionTerm)).slice(0, 5), [members, mentionTerm]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("room", room).order("created_at", { ascending: true }).limit(100);
      if (!mounted) return;
      if (error) { toast.error(error.message); return; }
      setMsgs(data ?? []);
      await loadProfiles((data ?? []).flatMap((m: any) => [m.user_id, m.deleted_by].filter(Boolean)));
      await loadReactions((data ?? []).map((m: any) => m.id));
    };
    load();
    supabase.from("profiles").select("id,full_name,gang_name").order("full_name").limit(200).then(({ data }) => setMembers(data ?? []));
    const ch = supabase.channel(`chat-${room}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `room=eq.${room}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [room]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function loadProfiles(ids: string[]) {
    const need = Array.from(new Set(ids)).filter((id) => id && !profilesById[id]);
    if (need.length === 0) return;
    const { data } = await supabase.from("profiles").select("id,full_name,gang_name").in("id", need);
    setProfilesById((prev) => {
      const next = { ...prev };
      (data ?? []).forEach((p: any) => { next[p.id] = { name: p.full_name, gang: p.gang_name }; });
      return next;
    });
  }

  async function loadReactions(ids: string[]) {
    if (ids.length === 0) return;
    const { data } = await supabase.from("chat_message_reactions").select("*").in("message_id", ids);
    const grouped: Record<string, any[]> = {};
    (data ?? []).forEach((r: any) => { grouped[r.message_id] = [...(grouped[r.message_id] ?? []), r]; });
    setReactions(grouped);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    if (editing) {
      const { error } = await supabase.from("chat_messages").update({ content: text.trim(), edited_at: new Date().toISOString() }).eq("id", editing.id);
      if (error) toast.error(error.message); else { setEditing(null); setText(""); }
      return;
    }
    const { error } = await supabase.from("chat_messages").insert({ user_id: user.id, room, content: text.trim(), reply_to_id: replyTo?.id ?? null });
    if (error) toast.error(error.message); else { setText(""); setReplyTo(null); }
  }

  async function pickImage(file: File) {
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: ue } = await supabase.storage.from("chat-images").upload(path, file);
    if (ue) { toast.error(ue.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("chat-images").getPublicUrl(path);
    await supabase.from("chat_messages").insert({ user_id: user.id, room, image_url: publicUrl, reply_to_id: replyTo?.id ?? null });
    setReplyTo(null);
  }

  async function del(m: any) {
    const patch = { content: null, image_url: null, deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null };
    const { error } = await supabase.from("chat_messages").update(patch).eq("id", m.id);
    if (error) toast.error(error.message);
    setActive(null);
  }

  async function react(messageId: string, emoji: string) {
    if (!user) return;
    const mine = (reactions[messageId] ?? []).find((r) => r.user_id === user.id && r.emoji === emoji);
    const res = mine
      ? await supabase.from("chat_message_reactions").delete().eq("id", mine.id)
      : await supabase.from("chat_message_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    if (res.error) toast.error(res.error.message);
    setActive(null);
  }

  function startHold(m: any) {
    if (holdRef.current) window.clearTimeout(holdRef.current);
    holdRef.current = window.setTimeout(() => setActive(m), 450);
  }
  function stopHold() { if (holdRef.current) window.clearTimeout(holdRef.current); }
  function chooseMention(name: string) { setText((v) => v.replace(/@[\w\s.-]{0,24}$/, `@${name} `)); }

  return (
    <Card className="glass-strong flex flex-col h-[70vh] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && <p className="text-muted-foreground text-sm text-center">Be the first to say something.</p>}
        {msgs.map((m: any) => {
          const p = profilesById[m.user_id];
          const reply = msgs.find((x) => x.id === m.reply_to_id);
          const grouped = Object.entries((reactions[m.id] ?? []).reduce((a: any, r: any) => { a[r.emoji] = (a[r.emoji] ?? 0) + 1; return a; }, {}));
          const deleted = !!m.deleted_at;
          return (
            <div key={m.id} onPointerDown={() => startHold(m)} onPointerUp={stopHold} onPointerLeave={stopHold} onContextMenu={(e) => { e.preventDefault(); setActive(m); }} className="flex gap-3 group select-none">
              <div className="h-9 w-9 rounded-full bg-gradient-gold grid place-items-center text-primary-foreground font-bold text-xs shrink-0">{(p?.name ?? "?").slice(0, 2).toUpperCase()}</div>
              <div className="flex-1 min-w-0 rounded-2xl border border-border/40 bg-background/25 px-3 py-2">
                <div className="text-xs"><UserBadge userId={m.user_id} name={p?.name ?? "Shooter"} /><span className="text-muted-foreground ml-1">· {p?.gang ?? "Independent"} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{m.edited_at ? " · edited" : ""}</span></div>
                {reply && <button onClick={() => document.getElementById(`msg-${reply.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mt-1 w-full text-left rounded-lg border-l-2 border-primary bg-primary/5 px-2 py-1 text-[11px] text-muted-foreground truncate">↪ {profilesById[reply.user_id]?.name ?? "Shooter"}: {reply.content ?? "Attachment"}</button>}
                <div id={`msg-${m.id}`}>
                  {deleted ? <div className="text-sm italic text-muted-foreground">Message deleted</div> : m.content && <div className="text-sm break-words whitespace-pre-wrap">{highlightMentions(m.content)}</div>}
                  {!deleted && m.image_url && <img src={m.image_url} alt="Chat attachment" className="mt-1 rounded max-h-64 border border-border" />}
                </div>
                {grouped.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{grouped.map(([emoji, count]) => <button key={emoji} onClick={() => react(m.id, emoji)} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">{emoji} {count as number}</button>)}</div>}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {active && <MessageActions message={active} mine={active.user_id === user?.id} isMod={isMod} onClose={() => setActive(null)} onReply={() => { setReplyTo(active); setActive(null); }} onEdit={() => { setEditing(active); setText(active.content ?? ""); setActive(null); }} onDelete={() => del(active)} onReact={(e: string) => react(active.id, e)} />}
      {muted ? <div className="p-3 border-t border-border text-sm text-destructive text-center">You are muted and cannot send messages.</div> : (
        <form onSubmit={send} className="relative p-3 border-t border-border space-y-2">
          {(replyTo || editing) && <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs"><span>{editing ? "Editing" : "Replying to"} <b>{profilesById[(editing ?? replyTo).user_id]?.name ?? "Shooter"}</b></span><button type="button" onClick={() => { setReplyTo(null); setEditing(null); setText(""); }}><X className="h-3.5 w-3.5" /></button></div>}
          {mentionMatches.length > 0 && <div className="absolute bottom-16 left-14 right-16 z-10 rounded-xl border border-primary/30 bg-popover p-1 shadow-luxury">{mentionMatches.map((m) => <button type="button" key={m.id} onClick={() => chooseMention(m.full_name)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-primary/10"><AtSign className="h-3 w-3 text-primary" />{m.full_name}<span className="ml-auto text-[10px] text-muted-foreground">{m.gang_name ?? "Independent"}</span></button>)}</div>}
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])} />
            <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()}><ImageIcon className="h-4 w-4" /></Button>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message, @tag a member…" />
            <Button type="submit" className="btn-luxury"><Send className="h-4 w-4" /></Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function MessageActions({ message, mine, isMod, onClose, onReply, onEdit, onDelete, onReact }: any) {
  const emojis = ["🔥", "💀", "👑", "✅", "😂", "🎯"];
  return <div className="border-t border-border bg-card/95 p-3 backdrop-blur-xl animate-fade-in">
    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Message actions</span><button onClick={onClose}><X className="h-4 w-4" /></button></div>
    <div className="mb-2 flex flex-wrap gap-1">{emojis.map((e) => <button key={e} onClick={() => onReact(e)} className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-lg hover:bg-primary/10">{e}</button>)}</div>
    <div className="grid grid-cols-3 gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onReply}><Reply className="h-3.5 w-3.5 mr-1" />Reply</Button>
      {mine && !message.deleted_at && <Button type="button" variant="outline" size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>}
      {(mine || isMod) && <Button type="button" variant="outline" size="sm" onClick={onDelete} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>}
    </div>
  </div>;
}

function highlightMentions(content: string) {
  return content.split(/(@[\w .-]+)/g).map((part, i) => part.startsWith("@") ? <span key={i} className="font-bold text-primary">{part}</span> : part);
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
