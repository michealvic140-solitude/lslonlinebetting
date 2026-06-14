import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Shield, Users, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

type Team = { id: string; name: string; logo_url: string | null; gang_type: "G" | "F" | null };
type Player = { id: string; team_id: string | null; name: string; position: string | null; avatar_url: string | null; is_substitute: boolean | null };
type Gang = { gang_name: string; gang_type: "G" | "F" | null; members: number };

/** Uploads an image picked from device storage to a public bucket and returns its URL. */
async function uploadImage(bucket: string, file: File, prefix: string): Promise<string | null> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${prefix}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) { toast.error(error.message); return null; }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Image picker field: choose a photo from the phone/computer instead of pasting a URL. */
function ImageUploadField({ label, bucket, prefix, value, onChange, rounded }: {
  label: string; bucket: string; prefix: string; value: string | null | undefined;
  onChange: (url: string | null) => void; rounded?: "full" | "md";
}) {
  const [busy, setBusy] = useState(false);
  const r = rounded === "full" ? "rounded-full" : "rounded";
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        {value
          ? <img src={value} alt="" className={`h-12 w-12 object-cover border border-primary/30 ${r}`} />
          : <div className={`h-12 w-12 grid place-items-center bg-primary/15 text-primary text-xs font-bold border border-primary/20 ${r}`}>IMG</div>}
        <div className="flex-1 space-y-1">
          <Input type="file" accept="image/*" disabled={busy} onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setBusy(true);
            const url = await uploadImage(bucket, f, prefix);
            setBusy(false);
            if (url) { onChange(url); toast.success("Image uploaded"); }
          }} />
          {value && <button type="button" className="text-[10px] text-destructive" onClick={() => onChange(null)}>Remove image</button>}
          {busy && <div className="text-[10px] text-muted-foreground">Uploading…</div>}
        </div>
      </div>
    </div>
  );
}

export function ClansAdminPanel() {
  return (
    <Card className="border-primary/30 bg-card/90 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-gold grid place-items-center shadow-gold">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.32em] text-primary/80">Roster Forge</div>
          <div className="text-xl font-display gradient-gold-text">Clans Manager</div>
        </div>
      </div>
      <Tabs defaultValue="gangs">
        <TabsList className="bg-card/70 border border-primary/20">
          <TabsTrigger value="gangs"><Shield className="h-3 w-3 mr-1" />Gangs</TabsTrigger>
          <TabsTrigger value="teams"><Users className="h-3 w-3 mr-1" />Teams</TabsTrigger>
          <TabsTrigger value="players"><UserCircle2 className="h-3 w-3 mr-1" />Players</TabsTrigger>
        </TabsList>
        <TabsContent value="gangs" className="mt-3"><GangsTab /></TabsContent>
        <TabsContent value="teams" className="mt-3"><TeamsTab /></TabsContent>
        <TabsContent value="players" className="mt-3"><PlayersTab /></TabsContent>
      </Tabs>
    </Card>
  );
}

function GangsTab() {
  const confirm = useConfirm();
  const [gangs, setGangs] = useState<Gang[]>([]);
  async function load() {
    const { data } = await supabase.from("profiles").select("gang_name, gang_type").not("gang_name", "is", null);
    const map = new Map<string, Gang>();
    (data ?? []).forEach((p: any) => {
      if (!p.gang_name) return;
      const k = p.gang_name;
      const cur = map.get(k) ?? { gang_name: k, gang_type: p.gang_type, members: 0 };
      cur.members += 1;
      map.set(k, cur);
    });
    setGangs(Array.from(map.values()).sort((a, b) => b.members - a.members));
  }
  useEffect(() => { load(); }, []);
  async function removeGang(name: string) {
    if (!await confirm({ title: `Disband ${name}?`, description: `The gang / faction tag "${name}" will be removed from every member profile. Members keep their accounts and tokens.`, tone: "danger", confirmText: "Disband gang" })) return;
    const { error } = await supabase.from("profiles").update({ gang_name: null, gang_type: null } as any).eq("gang_name", name);
    if (error) return toast.error(error.message);
    toast.success("Gang / faction removed");
    load();
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Gangs are tracked from member profiles. Members join a gang by setting it on their profile.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
        {gangs.map((g) => (
          <div key={g.gang_name} className="rounded-lg border border-primary/20 bg-card/70 p-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <div className="font-bold truncate">{g.gang_name}</div>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-bold">{g.gang_type === "G" ? "GANG" : g.gang_type === "F" ? "FACTION" : "CREW"}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{g.members} member{g.members === 1 ? "" : "s"}</div>
            <Button size="sm" variant="destructive" className="mt-2 h-7 text-[10px]" onClick={() => removeGang(g.gang_name)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
          </div>
        ))}
        {gangs.length === 0 && <div className="text-xs text-muted-foreground">No gangs yet.</div>}
      </div>
    </div>
  );
}

function TeamsTab() {
  const confirm = useConfirm();
  const [teams, setTeams] = useState<Team[]>([]);
  const [edit, setEdit] = useState<Partial<Team> | null>(null);
  async function load() {
    const { data } = await supabase.from("teams").select("*").order("name");
    setTeams((data ?? []) as Team[]);
  }
  useEffect(() => { load(); }, []);
  async function save(t: Partial<Team>) {
    if (!t.name?.trim()) { toast.error("Name required"); return; }
    if (t.id) {
      const { error } = await supabase.from("teams").update({ name: t.name, logo_url: t.logo_url ?? null, gang_type: (t.gang_type ?? null) as any }).eq("id", t.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("teams").insert({ name: t.name, logo_url: t.logo_url ?? null, gang_type: (t.gang_type ?? null) as any });
      if (error) return toast.error(error.message);
    }
    setEdit(null); toast.success("Saved"); load();
  }
  async function remove(id: string) {
    if (!await confirm({ title: "Delete this team?", description: "The team / gang entry will be removed. Matches that already used it keep their stored team info.", tone: "danger", confirmText: "Delete team" })) return;
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEdit({})}><Plus className="h-3 w-3 mr-1" />New Team</Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
        {teams.map((t) => (
          <div key={t.id} className="rounded-lg border border-primary/20 bg-card/70 p-3 flex items-center gap-2">
            {t.logo_url
              ? <img src={t.logo_url} alt="" className="h-9 w-9 rounded object-cover border border-primary/30" />
              : <div className="h-9 w-9 rounded bg-primary/20 grid place-items-center text-xs font-bold text-primary">{t.name.charAt(0).toUpperCase()}</div>}
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{t.name}</div>
              <div className="text-[10px] text-muted-foreground">{t.gang_type === "G" ? "Gang" : t.gang_type === "F" ? "Faction" : "Team"}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setEdit(t)}><Pencil className="h-3 w-3" /></Button>
            <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
          </div>
        ))}
        {teams.length === 0 && <div className="text-xs text-muted-foreground">No teams yet.</div>}
      </div>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Edit team" : "New team"}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Input placeholder="Team name" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <ImageUploadField label="Team logo (upload from device — optional)" bucket="team-logos" prefix="team" rounded="md" value={edit.logo_url} onChange={(url) => setEdit({ ...edit, logo_url: url })} />
              <Select value={(edit.gang_type as any) ?? "none"} onValueChange={(v) => setEdit({ ...edit, gang_type: v === "none" ? null : (v as any) })}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Team —</SelectItem>
                  <SelectItem value="G">Gang</SelectItem>
                  <SelectItem value="F">Faction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={() => save(edit)}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PlayersTab() {
  const confirm = useConfirm();
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [edit, setEdit] = useState<Partial<Player> | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  async function load() {
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from("players").select("*").order("name"),
      supabase.from("teams").select("*").order("name"),
    ]);
    setPlayers((p ?? []) as Player[]); setTeams((t ?? []) as Team[]);
  }
  useEffect(() => { load(); }, []);
  async function save(pl: Partial<Player>) {
    if (!pl.name?.trim()) { toast.error("Name required"); return; }
    const row: any = { name: pl.name, team_id: pl.team_id ?? null, position: pl.position ?? null, avatar_url: pl.avatar_url ?? null, is_substitute: !!pl.is_substitute };
    if (pl.id) {
      const { error } = await supabase.from("players").update(row).eq("id", pl.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("players").insert(row);
      if (error) return toast.error(error.message);
    }
    setEdit(null); toast.success("Saved"); load();
  }
  async function remove(id: string) {
    if (!await confirm({ title: "Delete this player?", description: "The shooter will be removed from the roster. Leaderboard history already recorded is kept.", tone: "danger", confirmText: "Delete player" })) return;
    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }
  const filtered = teamFilter === "all" ? players : players.filter((p) => p.team_id === teamFilter);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setEdit({})}><Plus className="h-3 w-3 mr-1" />New Player</Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
        {filtered.map((p) => {
          const team = teams.find((t) => t.id === p.team_id);
          return (
            <div key={p.id} className="rounded-lg border border-primary/20 bg-card/70 p-3 flex items-center gap-2">
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover border border-primary/30" />
                : <div className="h-9 w-9 rounded-full bg-primary/20 grid place-items-center text-xs font-bold text-primary">{p.name.charAt(0).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{p.name} {p.is_substitute && <span className="text-[8px] uppercase text-muted-foreground">sub</span>}</div>
                <div className="text-[10px] text-muted-foreground truncate">{team?.name ?? "Free agent"} · {p.position ?? "—"}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setEdit(p)}><Pencil className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-xs text-muted-foreground">No players.</div>}
      </div>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? "Edit player" : "New player"}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Input placeholder="Player name" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <Input placeholder="Position (e.g. AWP, IGL)" value={edit.position ?? ""} onChange={(e) => setEdit({ ...edit, position: e.target.value })} />
              <ImageUploadField label="Shooter avatar (upload from device — optional)" bucket="player-avatars" prefix="player" rounded="full" value={edit.avatar_url} onChange={(url) => setEdit({ ...edit, avatar_url: url })} />
              <Select value={edit.team_id ?? "none"} onValueChange={(v) => setEdit({ ...edit, team_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Free agent —</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!edit.is_substitute} onChange={(e) => setEdit({ ...edit, is_substitute: e.target.checked })} />
                Substitute
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={() => save(edit)}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}