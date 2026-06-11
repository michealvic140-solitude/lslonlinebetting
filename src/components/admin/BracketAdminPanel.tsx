import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Trophy, Crown, Image as ImageIcon, Shield, Target, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

type Tournament = { id: string; name: string; subtitle: string | null; opening_round_size: number; total_rounds: number; background_image_url: string | null; champion_participant_id: string | null; status: string; tournament_date: string | null };
type Participant = { id: string; tournament_id: string; name: string; avatar_url: string | null; kind: string; seed: number; eliminated_round: number | null; is_champion: boolean };
type BMatch = { id: string; tournament_id: string; round: number; slot: number; match_code: string | null; participant1_id: string | null; participant2_id: string | null; score1: number | null; score2: number | null; winner_participant_id: string | null; status: string };

export function BracketAdminPanel() {
  const confirm = useConfirm();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<BMatch[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "LOMITA SHOOTERS LEAGUE", opening_round_size: 26, background_image_url: "" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  async function loadTournaments() {
    const { data } = await supabase.from("tournaments").select("*").order("created_at", { ascending: false });
    setTournaments((data ?? []) as Tournament[]);
    if (!activeId && data?.[0]) setActiveId((data[0] as any).id);
  }
  async function loadDetail(id: string) {
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from("tournament_participants").select("*").eq("tournament_id", id).order("seed").order("created_at"),
      supabase.from("tournament_matches").select("*").eq("tournament_id", id).order("round").order("slot"),
    ]);
    setParticipants((p ?? []) as Participant[]);
    setMatches((m ?? []) as BMatch[]);
  }
  async function loadClans() {
    const [{ data: t }, { data: pl }] = await Promise.all([
      supabase.from("teams").select("id,name,logo_url,gang_type").order("name"),
      supabase.from("players").select("id,name,avatar_url").order("name"),
    ]);
    setTeams(t ?? []); setPlayers(pl ?? []);
  }
  useEffect(() => { loadTournaments(); loadClans(); }, []);
  useEffect(() => { if (activeId) loadDetail(activeId); }, [activeId]);
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase.channel(`bracket-admin-${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${activeId}` }, () => loadDetail(activeId))
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter: `tournament_id=eq.${activeId}` }, () => loadDetail(activeId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  async function createTournament() {
    if (!draft.name.trim()) return toast.error("Name required");
    const { data, error } = await supabase.from("tournaments").insert({ name: draft.name.trim(), opening_round_size: draft.opening_round_size, background_image_url: draft.background_image_url || null } as any).select().single();
    if (error) return toast.error(error.message);
    toast.success("Tournament created");
    setCreating(false); setActiveId((data as any).id); loadTournaments();
  }
  async function deleteTournament(id: string) {
    const ok = await confirm({ title: "Delete tournament?", description: "Bracket, participants and results will be permanently removed.", tone: "danger", confirmText: "Delete" });
    if (!ok) return;
    await supabase.from("tournaments").delete().eq("id", id);
    setActiveId(null); loadTournaments();
  }
  async function updateTournament(patch: Partial<Tournament>) {
    if (!activeId) return;
    await supabase.from("tournaments").update(patch as any).eq("id", activeId);
    loadTournaments();
  }
  async function addParticipant(name: string, avatar_url: string | null, kind: string, source: { team_id?: string; player_id?: string }) {
    if (!activeId) return;
    const seed = participants.length;
    await supabase.from("tournament_participants").insert({ tournament_id: activeId, name, avatar_url, kind, seed, source_team_id: source.team_id ?? null, source_player_id: source.player_id ?? null } as any);
    loadDetail(activeId);
  }
  async function removeParticipant(id: string) {
    await supabase.from("tournament_participants").delete().eq("id", id);
    if (activeId) loadDetail(activeId);
  }
  async function generateBracket() {
    if (!activeId) return;
    if (participants.length < 2) return toast.error("Add at least 2 participants");
    const ok = await confirm({ title: "Generate bracket?", description: `Builds the empty grid for ${participants.length} participants and seats round 1. This replaces any existing bracket results.`, confirmText: "Generate", tone: "danger" });
    if (!ok) return;
    await supabase.from("tournaments").update({ opening_round_size: participants.length } as any).eq("id", activeId);
    const { error } = await supabase.rpc("bracket_generate", { _tournament_id: activeId } as any);
    if (error) return toast.error(error.message);
    toast.success("Bracket built");
    loadTournaments(); loadDetail(activeId);
  }
  async function setWinner(match: BMatch, winnerId: string | null, s1: string, s2: string) {
    const score1 = s1 === "" ? null : Number(s1);
    const score2 = s2 === "" ? null : Number(s2);
    const { error } = await supabase.rpc("bracket_set_winner", { _match_id: match.id, _winner_id: winnerId, _score1: score1, _score2: score2 } as any);
    if (error) return toast.error(error.message);
    toast.success(winnerId ? "Winner advanced" : "Result cleared");
    if (activeId) loadDetail(activeId);
    loadTournaments();
  }

  const active = tournaments.find((t) => t.id === activeId);

  return (
    <Card className="border-primary/30 bg-card/90 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-gold grid place-items-center shadow-gold"><Trophy className="h-5 w-5 text-primary-foreground" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.32em] text-primary/80">Tournament System</div>
          <div className="text-xl font-display gradient-gold-text truncate">Knockout Bracket Manager</div>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-3 w-3 mr-1" />New Tournament</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tournaments.map((t) => (
          <Button key={t.id} size="sm" variant={t.id === activeId ? "default" : "outline"} onClick={() => setActiveId(t.id)}>
            {t.status === "completed" && <Crown className="h-3 w-3 mr-1 text-primary" />}
            {t.name}
          </Button>
        ))}
        {tournaments.length === 0 && <div className="text-xs text-muted-foreground">No tournaments yet.</div>}
      </div>

      {active && (
        <div className="space-y-3">
          <div className="grid lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tournament Name</label>
              <Input value={active.name} onChange={(e) => updateTournament({ name: e.target.value })} />
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Subtitle</label>
              <Input value={active.subtitle ?? ""} onChange={(e) => updateTournament({ subtitle: e.target.value })} placeholder="ONE LEAGUE. NO MERCY. RESPECT THE GAME." />
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Background Image URL (header / page bg)</label>
              <div className="flex gap-2"><Input value={active.background_image_url ?? ""} onChange={(e) => updateTournament({ background_image_url: e.target.value })} placeholder="https://..." /><Button size="icon" variant="outline"><ImageIcon className="h-3 w-3" /></Button></div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Opening Round Size (configurable, e.g. 26)</label>
              <Input type="number" min={2} max={128} value={active.opening_round_size} onChange={(e) => updateTournament({ opening_round_size: Math.max(2, Number(e.target.value)) })} />
              <div className="flex gap-2">
                <Button onClick={generateBracket} className="btn-luxury flex-1"><RefreshCw className="h-3 w-3 mr-1" />Generate / Rebuild Bracket</Button>
                <Button variant="destructive" onClick={() => deleteTournament(active.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
              <div className="text-[10px] text-muted-foreground">Total Rounds: {active.total_rounds || "—"} · Status: {active.status}</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Participants ({participants.length})</label>
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
              <div className="rounded-lg border border-primary/15 bg-background/30 p-2 max-h-72 overflow-y-auto space-y-1">
                {participants.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-muted-foreground">#{i + 1}</span>
                    {p.avatar_url ? <img src={p.avatar_url} className="h-5 w-5 rounded object-cover" alt="" /> : <span className="h-5 w-5 rounded bg-primary/20 grid place-items-center text-[9px] font-bold">{p.name[0]}</span>}
                    <span className="flex-1 truncate font-semibold">{p.name}</span>
                    <span className="text-[9px] uppercase text-muted-foreground">{p.kind}</span>
                    {p.is_champion && <Crown className="h-3 w-3 text-primary" />}
                    {p.eliminated_round && !p.is_champion && <span className="text-[9px] text-destructive">out R{p.eliminated_round}</span>}
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeParticipant(p.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                ))}
                {participants.length === 0 && <div className="text-[10px] text-muted-foreground p-3 text-center">Add gangs, factions and shooters from your Clans Manager.</div>}
              </div>
            </div>
          </div>

          {matches.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bracket Results — mark winner per match (auto-advances)</div>
              <div className="space-y-3">
                {Array.from(new Set(matches.map((m) => m.round))).map((r) => (
                  <div key={r}>
                    <div className="text-xs font-bold text-primary mb-1">Round {r}{r === active.total_rounds ? " · Grand Final" : ""}</div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {matches.filter((m) => m.round === r).map((m) => (
                        <BracketAdminMatchRow key={m.id} match={m} participants={participants} onSet={setWinner} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Tournament</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Tournament name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <label className="text-[10px] uppercase text-muted-foreground">Opening Round Size</label>
            <Input type="number" min={2} max={128} value={draft.opening_round_size} onChange={(e) => setDraft({ ...draft, opening_round_size: Number(e.target.value) })} />
            <label className="text-[10px] uppercase text-muted-foreground">Background Image URL (optional)</label>
            <Input placeholder="https://..." value={draft.background_image_url} onChange={(e) => setDraft({ ...draft, background_image_url: e.target.value })} />
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button onClick={createTournament}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add Participants from Clans Manager</DialogTitle></DialogHeader>
          <Input placeholder={`Search ${teams.length} clans + ${players.length} shooters…`} value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
          <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
            {teams.filter((t) => !pickerSearch || t.name.toLowerCase().includes(pickerSearch.toLowerCase())).map((t) => (
              <Button key={`t-${t.id}`} size="sm" variant="outline" className="justify-start" onClick={() => addParticipant(t.name, t.logo_url, t.gang_type === "F" ? "faction" : "gang", { team_id: t.id })}>
                <Shield className="h-3 w-3 mr-1 text-primary" />{t.name}
              </Button>
            ))}
            {players.filter((p) => !pickerSearch || p.name.toLowerCase().includes(pickerSearch.toLowerCase())).map((p) => (
              <Button key={`p-${p.id}`} size="sm" variant="outline" className="justify-start" onClick={() => addParticipant(p.name, p.avatar_url, "shooter", { player_id: p.id })}>
                <Target className="h-3 w-3 mr-1 text-primary" />{p.name}
              </Button>
            ))}
          </div>
          <DialogFooter><Button onClick={() => setPickerOpen(false)}><Check className="h-3 w-3 mr-1" />Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function BracketAdminMatchRow({ match, participants, onSet }: { match: BMatch; participants: Participant[]; onSet: (m: BMatch, w: string | null, s1: string, s2: string) => void }) {
  const p1 = participants.find((p) => p.id === match.participant1_id);
  const p2 = participants.find((p) => p.id === match.participant2_id);
  const [s1, setS1] = useState<string>(match.score1?.toString() ?? "");
  const [s2, setS2] = useState<string>(match.score2?.toString() ?? "");
  return (
    <div className="rounded-lg border border-primary/20 bg-background/30 p-2 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-primary/80">{match.match_code}</span>
        {match.winner_participant_id && <span className="text-[9px] text-primary">✓ DONE</span>}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
        <span className={`truncate ${match.winner_participant_id === p1?.id ? "font-bold text-primary" : ""}`}>{p1?.name ?? "— TBD —"}</span>
        <Input className="h-6 w-12 text-[10px]" value={s1} onChange={(e) => setS1(e.target.value)} placeholder="0" />
        <Button size="sm" className="h-6 text-[9px]" variant={match.winner_participant_id === p1?.id ? "default" : "outline"} disabled={!p1} onClick={() => p1 && onSet(match, p1.id, s1, s2)}>WIN</Button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
        <span className={`truncate ${match.winner_participant_id === p2?.id ? "font-bold text-primary" : ""}`}>{p2?.name ?? "— TBD —"}</span>
        <Input className="h-6 w-12 text-[10px]" value={s2} onChange={(e) => setS2(e.target.value)} placeholder="0" />
        <Button size="sm" className="h-6 text-[9px]" variant={match.winner_participant_id === p2?.id ? "default" : "outline"} disabled={!p2} onClick={() => p2 && onSet(match, p2.id, s1, s2)}>WIN</Button>
      </div>
      {match.winner_participant_id && <Button size="sm" variant="ghost" className="h-5 text-[9px] w-full" onClick={() => onSet(match, null, s1, s2)}>Clear result</Button>}
    </div>
  );
}