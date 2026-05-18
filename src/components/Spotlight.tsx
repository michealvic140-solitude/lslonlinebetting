import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Star, Sparkles, Trash2, Crown, Award, Gem, Medal, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface SpotlightRow {
  id: string;
  user_id: string;
  headline: string;
  message: string | null;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  ingame_name: string | null;
  avatar_url: string | null;
  vip_tier: string | null;
  gang_name: string | null;
}

/* ------------------------------- Homepage banner ------------------------------- */
export function Spotlight() {
  const [items, setItems] = useState<(SpotlightRow & { profile: ProfileLite | null })[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("spotlights")
        .select("*")
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(3);
      const rows = (data ?? []) as SpotlightRow[];
      if (rows.length === 0) { setItems([]); return; }
      const ids = Array.from(new Set(rows.map(r => r.user_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, ingame_name, avatar_url, vip_tier, gang_name")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      setItems(rows.map(r => ({ ...r, profile: (map.get(r.user_id) as ProfileLite) ?? null })));
    };
    load();
    const ch = supabase.channel("spotlights-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "spotlights" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="container mt-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-amber-300 animate-pulse" />
        <h2 className="text-2xl font-bold gradient-gold-text">In the Spotlight</h2>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((s) => <SpotlightCard key={s.id} item={s} />)}
      </div>
    </section>
  );
}

function SpotlightCard({ item }: { item: SpotlightRow & { profile: ProfileLite | null } }) {
  const p = item.profile;
  const name = p?.ingame_name || p?.full_name || "Player";
  const tier = (p?.vip_tier ?? "bronze") as keyof typeof TIER_STYLE;
  const style = TIER_STYLE[tier] ?? TIER_STYLE.bronze;
  const TierIcon = style.icon;
  return (
    <Card className="relative overflow-hidden glass-strong border-amber-400/40 group">
      <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl group-hover:bg-amber-400/30 transition" />
      <div className="absolute inset-0 pointer-events-none opacity-40" style={{ background: "radial-gradient(circle at 20% 0%, hsl(var(--primary) / 0.3), transparent 60%)" }} />
      <div className="relative p-4 flex gap-3">
        <div className="relative shrink-0">
          {p?.avatar_url ? (
            <img src={p.avatar_url} alt={name} className="h-14 w-14 rounded-xl object-cover border-2 border-amber-400/50" />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400/40 to-amber-700/30 grid place-items-center text-amber-100 font-extrabold text-lg border-2 border-amber-400/50">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full grid place-items-center ${style.chip} border border-background`}>
            <TierIcon className="h-3 w-3" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="border-amber-400/50 text-amber-300 text-[10px]">
              <Star className="h-3 w-3 mr-1 fill-amber-300" /> SPOTLIGHT
            </Badge>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{tier}</span>
          </div>
          <div className="font-extrabold text-base mt-1 truncate">{name}</div>
          <div className="text-sm font-bold gradient-gold-text">{item.headline}</div>
          {item.message && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.message}</p>}
          {p?.gang_name && <div className="text-[10px] text-muted-foreground mt-1">Gang · {p.gang_name}</div>}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------- Level-up modal ------------------------------- */
const TIER_STYLE = {
  bronze:   { icon: Medal,  chip: "bg-amber-700/80 text-amber-50",     label: "Bronze",   grad: "from-amber-700 to-amber-900" },
  silver:   { icon: Award,  chip: "bg-slate-400/80 text-slate-900",    label: "Silver",   grad: "from-slate-300 to-slate-500" },
  gold:     { icon: Trophy, chip: "bg-amber-400/90 text-amber-950",    label: "Gold",     grad: "from-amber-300 to-amber-500" },
  platinum: { icon: Gem,    chip: "bg-cyan-300/90 text-cyan-950",      label: "Platinum", grad: "from-cyan-200 to-cyan-400" },
  legend:   { icon: Crown,  chip: "bg-fuchsia-400/90 text-fuchsia-950", label: "Legend",   grad: "from-fuchsia-300 via-amber-300 to-rose-400" },
} as const;

const TIER_ORDER = ["bronze","silver","gold","platinum","legend"] as const;

export function LevelUpModal() {
  const { user, profile } = useAuth();
  const [shownTier, setShownTier] = useState<string | null>(null);
  const lastTierRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profile?.vip_tier) return;
    if (lastTierRef.current === null) {
      lastTierRef.current = profile.vip_tier;
      return;
    }
    const prevIdx = TIER_ORDER.indexOf(lastTierRef.current as any);
    const nextIdx = TIER_ORDER.indexOf(profile.vip_tier as any);
    if (nextIdx > prevIdx) {
      setShownTier(profile.vip_tier);
    }
    lastTierRef.current = profile.vip_tier;
  }, [profile?.vip_tier]);

  if (!user || !shownTier) return null;
  const style = TIER_STYLE[shownTier as keyof typeof TIER_STYLE] ?? TIER_STYLE.bronze;
  const Icon = style.icon;

  return (
    <Dialog open onOpenChange={(o) => !o && setShownTier(null)}>
      <DialogContent className="glass-strong border-amber-400/40 max-w-md overflow-hidden p-0">
        <div className={`relative bg-gradient-to-br ${style.grad} p-8 text-center`}>
          {/* sparkles */}
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-white/80 animate-ping"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 1.2}s`,
                animationDuration: `${1 + Math.random() * 1.5}s`,
              }}
            />
          ))}
          <div className="relative">
            <div className="text-xs uppercase tracking-[0.4em] text-white/80 mb-2 animate-fade-in">VIP Tier Up</div>
            <div className="mx-auto h-28 w-28 rounded-full bg-white/15 backdrop-blur grid place-items-center border-4 border-white/40 shadow-2xl animate-scale-in">
              <Icon className="h-14 w-14 text-white drop-shadow-lg" />
            </div>
            <h2 className="text-4xl font-black text-white mt-4 drop-shadow-lg animate-fade-in">
              {style.label.toUpperCase()}
            </h2>
            <p className="text-white/90 text-sm mt-2 max-w-xs mx-auto animate-fade-in">
              You've ascended to a new tier. New perks and recognition unlocked.
            </p>
          </div>
        </div>
        <div className="p-4 flex justify-center">
          <Button onClick={() => setShownTier(null)} className="btn-luxury">
            <Sparkles className="h-4 w-4 mr-2" /> Claim glory
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Admin panel ------------------------------- */
export function SpotlightsAdminPanel() {
  const { user, isMod } = useAuth();
  const [items, setItems] = useState<(SpotlightRow & { profile: ProfileLite | null })[]>([]);
  const [users, setUsers] = useState<ProfileLite[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ user_id: "", headline: "", message: "", expires_hours: 24 });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("spotlights").select("*").order("created_at", { ascending: false }).limit(50);
    const rows = (data ?? []) as SpotlightRow[];
    const ids = Array.from(new Set(rows.map(r => r.user_id)));
    let map = new Map<string, ProfileLite>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, ingame_name, avatar_url, vip_tier, gang_name")
        .in("id", ids);
      map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    }
    setItems(rows.map(r => ({ ...r, profile: map.get(r.user_id) ?? null })));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (search.trim().length < 2) { setUsers([]); return; }
      const q = `%${search.trim()}%`;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, ingame_name, avatar_url, vip_tier, gang_name")
        .or(`full_name.ilike.${q},ingame_name.ilike.${q},gang_name.ilike.${q}`)
        .limit(8);
      setUsers((data ?? []) as ProfileLite[]);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  if (!isMod) return <p className="text-sm text-muted-foreground">Moderators and admins only.</p>;

  async function submit() {
    if (!form.user_id || !form.headline.trim()) { toast.error("Pick a user and write a headline"); return; }
    setSubmitting(true);
    const expires = form.expires_hours > 0
      ? new Date(Date.now() + form.expires_hours * 3600_000).toISOString()
      : null;
    const { error } = await supabase.from("spotlights").insert({
      user_id: form.user_id,
      headline: form.headline.trim(),
      message: form.message.trim() || null,
      expires_at: expires,
      created_by: user?.id,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Spotlight created — posted to homepage and general chat");
    setForm({ user_id: "", headline: "", message: "", expires_hours: 24 });
    setSearch("");
    setUsers([]);
    load();
  }

  async function toggleActive(s: SpotlightRow) {
    const { error } = await supabase.from("spotlights").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("spotlights").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Spotlight removed");
    load();
  }

  const selectedUser = users.find(u => u.id === form.user_id) ?? items.find(i => i.user_id === form.user_id)?.profile ?? null;

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-4">
      <Card className="p-5 glass-strong border-amber-400/30 h-fit">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-amber-300" />
          <h3 className="font-bold">Create Spotlight</h3>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Find user</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, in-game name, gang..." />
            {users.length > 0 && (
              <div className="mt-2 border border-border rounded-md max-h-48 overflow-y-auto bg-card/60">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setForm(f => ({ ...f, user_id: u.id })); setUsers([]); setSearch(u.ingame_name || u.full_name || ""); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 text-sm border-b border-border/40 last:border-0"
                  >
                    {u.avatar_url ? <img src={u.avatar_url} className="h-7 w-7 rounded object-cover" alt="" /> : <div className="h-7 w-7 rounded bg-muted grid place-items-center text-xs">{(u.ingame_name||u.full_name||"?")[0]}</div>}
                    <span className="flex-1 truncate">
                      <span className="font-bold">{u.ingame_name || u.full_name}</span>
                      {u.gang_name && <span className="text-[10px] text-muted-foreground"> · {u.gang_name}</span>}
                    </span>
                    <Badge variant="outline" className="text-[9px]">{u.vip_tier ?? "bronze"}</Badge>
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <div className="mt-2 text-xs text-emerald-300">Selected: {selectedUser.ingame_name || selectedUser.full_name}</div>
            )}
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Headline</Label>
            <Input value={form.headline} onChange={(e) => setForm(f => ({ ...f, headline: e.target.value }))} placeholder="e.g. Top earner of the week" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Message (optional)</Label>
            <Textarea value={form.message} onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Why are they in the spotlight?" rows={3} />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Expires in (hours, 0 = never)</Label>
            <Input type="number" min={0} value={form.expires_hours} onChange={(e) => setForm(f => ({ ...f, expires_hours: Number(e.target.value) }))} />
          </div>
          <Button disabled={submitting} onClick={submit} className="btn-luxury w-full">
            <Star className="h-4 w-4 mr-2" /> {submitting ? "Lighting up…" : "Spotlight user"}
          </Button>
          <p className="text-[10px] text-muted-foreground">A celebratory message will also be auto-posted to the general chat.</p>
        </div>
      </Card>

      <div className="space-y-3">
        <h3 className="font-bold flex items-center gap-2"><Star className="h-4 w-4 text-amber-300" />Active & past spotlights</h3>
        {items.length === 0 && <p className="text-sm text-muted-foreground">No spotlights yet.</p>}
        {items.map((s) => {
          const p = s.profile;
          const name = p?.ingame_name || p?.full_name || "Player";
          const expired = s.expires_at && new Date(s.expires_at) < new Date();
          return (
            <Card key={s.id} className={`p-3 flex items-center gap-3 ${s.is_active && !expired ? "border-amber-400/40" : "opacity-60"}`}>
              {p?.avatar_url ? <img src={p.avatar_url} className="h-10 w-10 rounded-lg object-cover" alt="" /> : <div className="h-10 w-10 rounded-lg bg-muted grid place-items-center font-bold">{name[0]}</div>}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{name} · <span className="text-amber-300">{s.headline}</span></div>
                {s.message && <div className="text-xs text-muted-foreground truncate">{s.message}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(s.created_at).toLocaleString()}
                  {s.expires_at && <> · {expired ? "expired" : "expires"} {new Date(s.expires_at).toLocaleString()}</>}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => toggleActive(s)}>{s.is_active ? "Hide" : "Show"}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
