import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Plus, Trash2, Crown, Swords, Wand2, ArrowUp, ArrowDown, ImageIcon, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { TournamentBracket, type TMatch, type TParticipant, type Tournament } from "@/components/TournamentBracket";

/** Upload a bracket image from device storage to a public bucket and return its URL. */
async function uploadBracketImage(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `tournament-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("team-logos").upload(path, file, { upsert: true });
  if (error) { toast.error(error.message); return null; }
  return supabase.storage.from("team-logos").getPublicUrl(path).data.publicUrl;
}

function labelFor(matchesInRound: number, j: number) {
  if (matchesInRound === 1) return "FINAL";
  if (matchesInRound === 2) return `SF${j + 1}`;
  if (matchesInRound === 4) return `QF${j + 1}`;
  if (matchesInRound === 8) return `R16-${j + 1}`;
  return `M${j + 1}`;
}
function roundNameFor(playersInRound: number) {
  if (playersInRound <= 2) return "Grand Final";
  if (playersInRound <= 4) return "Semifinals";
  if (playersInRound <= 8) return "Quarterfinals";
  if (playersInRound <= 16) return "Round of 16";
  return `Round of ${playersInRound}`;
}

export function TournamentAdminPanel() {
  const confirm = useConfirm();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<TParticipant[]>([]);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [futureMatches, setFutureMatches] = useState<any[]>([]);
  const [linkableMatches, setLinkableMatches] = useState<Array<{ id: string; name: string; home_score: number | null; away_score: number | null; status: string }>>([]);
  const [roster, setRoster] = useState<Array<{ id: string; name: string; logo_url: string | null; kind: "player" | "team" }>>([]);

  // create form
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("ONE LEAGUE. NO MERCY. RESPECT THE GAME.");
  const [eventDate, setEventDate] = useState("");
  const [pName, setPName] = useState("");
  const [pLogo, setPLogo] = useState("");
  const [pLogoBusy, setPLogoBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState(""); // NEW: search state

  // result dialog
  const [resultMatch, setResultMatch] = useState<TMatch | null>(null);
  const [sA, setSA] = useState("");
  const [sB, setSB] = useState("");
  const [linkId, setLinkId] = useState("");

  const sel = useMemo(() => tournaments.find((t) => t.id === selId) ?? null, [tournaments, selId]);
  const partMap = useMemo(() => Object.fromEntries(participants.map((p) => [p.id, p])), [participants]);

  // Filter participants by search query
  const filteredParticipants = useMemo(
    () => participants.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [participants, searchQuery]
  );

  async function loadTournaments() {
    const { data } = await (supabase as any).from("tournaments").select("*").order("created_at", { ascending: false });
    setTournaments(data ?? []);
    if (!selId && data?.length) setSelId(data[0].id);
    const { data: fm } = await (supabase as any).from("matches").select("id,name").eq("match_kind", "future").eq("is_archived", false).order("created_at", { ascending: false });
    setFutureMatches(fm ?? []);
    const { data: lm } = await (supabase as any).from("matches").select("id,name,home_score,away_score,status").eq("is_archived", false).eq("is_virtual", false).order("start_time", { ascending: false }).limit(300);
    setLinkableMatches(lm ?? []);
    const [{ data: pls }, { data: tms }] = await Promise.all([
      supabase.from("players").select("id,name,avatar_url").order("name"),
      supabase.from("teams").select("id,name,logo_url").order("name"),
    ]);
    setRoster([
      ...((tms ?? []).map((t: any) => ({ id: `team:${t.id}`, name: t.name, logo_url: t.logo_url ?? null, kind: "team" as const }))),
      ...((pls ?? []).map((p: any) => ({ id: `player:${p.id}`, name: p.name, logo_url: p.avatar_url ?? null, kind: "player" as const }))),
    ]);
  }
  async function loadDetail(id: string) {
    const [{ data: ps }, { data: ms }] = await Promise.all([
      (supabase as any).from("tournament_participants").select("*").eq("tournament_id", id).order("seed").order("created_at"),
      (supabase as any).from("tournament_matches").select("*").eq("tournament_id", id).order("round").order("slot"),
    ]);
    setParticipants(ps ?? []);
    setMatches(ms ?? []);
  }
  useEffect(() => { loadTournaments(); }, []);
  useEffect(() => { if (selId) loadDetail(selId); }, [selId]);

  async function createTournament() {
    if (!name.trim()) { toast.error("Enter a tournament name"); return; }
    const { data, error } = await (supabase as any).from("tournaments").insert({
      name: name.trim(), tagline: tagline.trim() || null, event_date: eventDate || null, status: "active", is_featured: true,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setName(""); setEventDate("");
    await loadTournaments();
    setSelId(data.id);
    toast.success("Tournament created — now add participants");
  }

  async function addParticipant() {
    if (!sel) return;
    if (!pName.trim()) { toast.error("Enter participant name"); return; }
    const { error } = await (supabase as any).from("tournament_participants").insert({
      tournament_id: sel.id, name: pName.trim(), logo_url: pLogo.trim() || null, seed: participants.length + 1,
    });
    if (error) { toast.error(error.message); return; }
    setPName(""); setPLogo("");
    loadDetail(sel.id);
  }
  async function removeParticipant(id: string) {
    if (!sel) return;
    await (supabase as any).from("tournament_participants").delete().eq("id", id);
    loadDetail(sel.id);
  }

  // Reorder participants — the order IS the bracket seeding/placement used when generating.
  async function moveParticipant(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (!sel || other < 0 || other >= participants.length) return;
    const arr = [...participants];
    [arr[index], arr[other]] = [arr[other], arr[index]];
    setParticipants(arr.map((p, i) => ({ ...p, seed: i + 1 })));
    await Promise.all(arr.map((p, i) => (supabase as any).from("tournament_participants").update({ seed: i + 1 }).eq("id", p.id)));
  }

  async function generateBracket() {
    if (!sel) return;
    if (participants.length < 2) { toast.error("Add at least 2 participants"); return; }
    const ok = await confirm({
      title: "Generate the knockout bracket?",
      description: `This builds a single-elimination bracket for ${participants.length} participant${participants.length === 1 ? "" : "s"}. Any existing bracket matches for this tournament will be replaced.`,
      confirmText: "Generate bracket",
    });
    if (!ok) return;

    await (supabase as any).from("tournament_matches").delete().eq("tournament_id", sel.id);

    let size = 2;
    while (size < participants.length) size *= 2;
    const totalRounds = Math.log2(size);

    // standard single-elimination seeding order (1, size, …) so byes spread evenly
    let seedPos: number[] = [1, 2];
    for (let r = 1; r < totalRounds; r++) {
      const sum = seedPos.length * 2 + 1;
      const next: number[] = [];
      for (const p of seedPos) { next.push(p); next.push(sum - p); }
      seedPos = next;
    }
    // map each bracket slot to a participant id (or null = bye) using the manual order as seeding
    const slotIds: (string | null)[] = seedPos.map((seed) => participants[seed - 1]?.id ?? null);

    // build from final round down so we know next_match ids
    let aboveIds: string[] = [];
    let round1Rows: any[] = [];
    for (let r = totalRounds; r >= 1; r--) {
      const matchesInRound = size / Math.pow(2, r);
      const rows = Array.from({ length: matchesInRound }, (_, j) => {
        const next_match_id = r === totalRounds ? null : aboveIds[Math.floor(j / 2)] ?? null;
        const next_slot = r === totalRounds ? null : j % 2 === 0 ? "a" : "b";
        const row: any = {
          tournament_id: sel.id, round: r, slot: j,
          label: labelFor(matchesInRound, j), round_name: roundNameFor(matchesInRound * 2),
          next_match_id, next_slot, status: "pending",
        };
        if (r === 1) {
          row.participant_a_id = slotIds[2 * j] ?? null;
          row.participant_b_id = slotIds[2 * j + 1] ?? null;
        }
        return row;
      });
      const { data, error } = await (supabase as any).from("tournament_matches").insert(rows).select("id,slot,next_match_id,next_slot,participant_a_id,participant_b_id");
      if (error) { toast.error(error.message); return; }
      const sorted = (data ?? []).sort((a: any, b: any) => a.slot - b.slot);
      aboveIds = sorted.map((d: any) => d.id);
      if (r === 1) round1Rows = sorted;
    }

    // auto-advance byes: any first-round match with exactly one participant is won by default,
    // so we never render empty/incomplete bracket slots.
    for (const m of round1Rows) {
      const a = m.participant_a_id, b = m.participant_b_id;
      const hasA = !!a, hasB = !!b;
      if (hasA !== hasB) {
        const winner = a || b;
        await (supabase as any).from("tournament_matches").update({ winner_id: winner, status: "completed" }).eq("id", m.id);
        if (m.next_match_id) {
          const col = m.next_slot === "b" ? "participant_b_id" : "participant_a_id";
          await (supabase as any).from("tournament_matches").update({ [col]: winner }).eq("id", m.next_match_id);
        }
        await (supabase as any).from("tournament_participants").update({ current_round: 2 }).eq("id", winner);
      }
    }
    toast.success("Bracket generated");
    loadDetail(sel.id);
  }

  async function linkFutures(matchId: string) {
    if (!sel) return;
    await (supabase as any).from("tournaments").update({ futures_match_id: matchId || null }).eq("id", sel.id);
    loadTournaments();
    toast.success(matchId ? "Linked futures market for betting" : "Unlinked betting market");
  }

  async function deleteTournament() {
    if (!sel) return;
    const ok = await confirm({ title: "Delete this tournament?", description: "The whole bracket, participants and results will be permanently removed.", confirmText: "Delete tournament" });
    if (!ok) return;
    await (supabase as any).from("tournaments").delete().eq("id", sel.id);
    setSelId(null);
    loadTournaments();
  }

  function openResult(m: TMatch) {
    if (!m.participant_a_id && !m.participant_b_id) { toast.info("Both slots are empty — winners from the previous round will appear here."); return; }
    setResultMatch(m);
    setSA(m.score_a != null ? String(m.score_a) : "");
    setSB(m.score_b != null ? String(m.score_b) : "");
    setLinkId((m as any).match_id ?? "");
  }

  // Link / unlink a real match to this bracket slot. Once linked, the DB trigger
  // keeps score_a/score_b in sync with the live match's score automatically.
  async function linkLiveMatch(matchId: string) {
    if (!resultMatch) return;
    setLinkId(matchId);
    const { error } = await (supabase as any).from("tournament_matches").update({ match_id: matchId || null }).eq("id", resultMatch.id);
    if (error) { toast.error(error.message); return; }
    if (matchId) {
      const lm = linkableMatches.find((x) => x.id === matchId);
      if (lm) {
        // pull current scores immediately so the admin can review them
        await (supabase as any).from("tournament_matches").update({ score_a: lm.home_score ?? 0, score_b: lm.away_score ?? 0 }).eq("id", resultMatch.id);
        setSA(String(lm.home_score ?? 0));
        setSB(String(lm.away_score ?? 0));
      }
      toast.success("Linked — scores will auto-update from this match");
    } else {
      toast.success("Unlinked from live match");
    }
    setResultMatch({ ...resultMatch, match_id: matchId || null } as TMatch);
    if (sel) loadDetail(sel.id);
  }

  async function submitResult(winnerId: string | null, outcome: string | null = null, dqId: string | null = null) {
    if (!resultMatch) return;
    const { error } = await (supabase as any).rpc("set_tournament_result", {
      _match_id: resultMatch.id,
      _score_a: sA === "" ? null : Number(sA),
      _score_b: sB === "" ? null : Number(sB),
      _winner_id: winnerId,
      _outcome: outcome,
      _dq_id: dqId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(winnerId ? "Result saved — winner advanced" : "Scores saved");
    setResultMatch(null);
    loadDetail(sel!.id);
  }

  const rA = resultMatch?.participant_a_id ? partMap[resultMatch.participant_a_id] : null;
  const rB = resultMatch?.participant_b_id ? partMap[resultMatch.participant_b_id] : null;

  return (
    <div className="space-y-4">
      {/* create + selector */}
      <div className="grid lg:grid-cols-[380px_1fr] gap-4">
        <Card className="glass-strong p-4 space-y-3">
          <div className="font-bold flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" />Create Tournament</div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Tournament name (words, e.g. "Lomita Shooters League")</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shotgun Showdown" /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Tagline (short slogan)</Label><Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. ONE LEAGUE. NO MERCY. RESPECT THE GAME." /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Event date (calendar)</Label><Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></div>
          <Button className="btn-luxury w-full" onClick={createTournament}><Plus className="h-4 w-4 mr-1" />Create Tournament</Button>

          {tournaments.length > 0 && (
            <div className="pt-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Select tournament to manage</Label>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {tournaments.map((t) => (
                  <button key={t.id} onClick={() => setSelId(t.id)} className={`text-left rounded-md px-3 py-2 text-sm border ${selId === t.id ? "border-primary bg-primary/10" : "border-border"}`}>
                    <span className="font-bold">{t.name}</span> <Badge variant="outline" className="ml-1 text-[9px] capitalize">{t.status}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {sel && (
          <Card className="glass-strong p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold flex items-center gap-2"><Swords className="h-4 w-4 text-primary" />Participants — {sel.name}</div>
              <Button size="sm" variant="destructive" onClick={deleteTournament}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Participant — pick a seeded shooter/gang or type a name</Label>
                <div className="flex gap-2">
                  <Select value="" onValueChange={(v) => {
                    const r = roster.find((x) => x.id === v);
                    if (r) { setPName(r.name); if (r.logo_url) setPLogo(r.logo_url); }
                  }}>
                    <SelectTrigger className="w-40 shrink-0"><SelectValue placeholder="Select from list" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {roster.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No seeded players/teams</div>}
                      {roster.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          <span className="text-[10px] text-muted-foreground mr-1">{r.kind === "team" ? "GANG" : "SHOOTER"}</span>{r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="…or type manually" onKeyDown={(e) => e.key === "Enter" && addParticipant()} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Bracket image (upload — optional)</Label>
                <div className="flex items-center gap-2">
                  {pLogo
                    ? <img src={pLogo} alt="" className="h-9 w-9 rounded object-cover border border-primary/30" />
                    : <div className="h-9 w-9 rounded bg-primary/15 grid place-items-center text-primary"><ImageIcon className="h-4 w-4" /></div>}
                  <Input type="file" accept="image/*" className="w-40" disabled={pLogoBusy} onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    setPLogoBusy(true);
                    const url = await uploadBracketImage(f);
                    setPLogoBusy(false);
                    if (url) { setPLogo(url); toast.success("Image uploaded"); }
                  }} />
                </div>
              </div>
              <Button onClick={addParticipant} disabled={pLogoBusy}><Plus className="h-4 w-4" /></Button>
            </div>
            
            {/* Search bar for shooters */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search shooters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">The order below is the bracket placement — use the arrows to decide who faces who. Pairs are formed top-to-bottom (1 vs 2, 3 vs 4, …) when you generate the bracket.
              {searchQuery && ` (showing ${filteredParticipants.length} of ${participants.length})`}
            </p>
            <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">
              {filteredParticipants.length > 0 ? (
                filteredParticipants.map((p, idx) => {
                  const originalIndex = participants.findIndex((orig) => orig.id === p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2 rounded-md border border-primary/20 bg-card/60 px-2 py-1">
                      <span className="text-[10px] text-muted-foreground w-5 text-right">{originalIndex + 1}.</span>
                      {p.logo_url
                        ? <img src={p.logo_url} alt="" className="h-7 w-7 rounded object-cover border border-primary/30" />
                        : <div className="h-7 w-7 rounded bg-primary/15 grid place-items-center text-[10px] font-bold text-primary">{p.name.charAt(0).toUpperCase()}</div>}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                      <button onClick={() => moveParticipant(originalIndex, -1)} disabled={originalIndex === 0} className="text-muted-foreground disabled:opacity-30 hover:text-primary"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => moveParticipant(originalIndex, 1)} disabled={originalIndex === participants.length - 1} className="text-muted-foreground disabled:opacity-30 hover:text-primary"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeParticipant(p.id)} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  );
                })
              ) : searchQuery ? (
                <span className="text-xs text-muted-foreground text-center py-4">No shooters found matching "{searchQuery}"</span>
              ) : (
                <span className="text-xs text-muted-foreground">No participants yet.</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center pt-1">
              <Button className="btn-luxury" onClick={generateBracket}><Wand2 className="h-4 w-4 mr-1" />Generate / Rebuild Bracket</Button>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Betting market</Label>
                <select className="bg-background border border-border rounded-md text-sm px-2 py-1.5" value={sel.futures_match_id ?? ""} onChange={(e) => linkFutures(e.target.value)}>
                  <option value="">— none —</option>
                  {futureMatches.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* live bracket preview / editor */}
      {sel && matches.length > 0 && (
        <Card className="glass p-2">
          <div className="text-xs text-muted-foreground px-2 py-1">Tap any matchup to enter scores and mark the winner. The winner advances automatically.</div>
          <div className="h-[70vh] w-full rounded-xl overflow-hidden">
            <TournamentBracket tournament={sel} participants={partMap} matches={matches} onMatchClick={openResult} />
          </div>
        </Card>
      )}

      {/* glass result dialog */}
      <Dialog open={!!resultMatch} onOpenChange={(o) => !o && setResultMatch(null)}>
        <DialogContent className="glass-strong border-primary/30 max-w-md backdrop-blur-2xl shadow-luxury overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-gold" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Swords className="h-5 w-5 text-primary" />{resultMatch?.label ?? "Match"} Result</DialogTitle>
            <DialogDescription>Link a live match to auto-fill scores, then mark each shooter Won, Qualified, Lost or Disqualified.</DialogDescription>
          </DialogHeader>

          {/* link a real/live match — scores then auto-sync from it */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Linked live match (scores auto-update from it)</Label>
            <select
              className="w-full bg-background border border-border rounded-md text-sm px-2 py-1.5"
              value={linkId}
              onChange={(e) => linkLiveMatch(e.target.value)}
            >
              <option value="">— not linked —</option>
              {linkableMatches.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {f.home_score ?? 0}–{f.away_score ?? 0} ({f.status})
                </option>
              ))}
            </select>
            {linkId && <p className="text-[11px] text-emerald-400">Scores below are pulled from the live match. They auto-update whenever the match score changes.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground truncate">{rA?.name ?? "Slot A (TBD)"} — score</Label>
              <Input type="number" min={0} value={sA} onChange={(e) => setSA(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground truncate">{rB?.name ?? "Slot B (TBD)"} — score</Label>
              <Input type="number" min={0} value={sB} onChange={(e) => setSB(e.target.value)} placeholder="0" />
            </div>
          </div>
          <DialogFooter className="flex-col gap-3 sm:flex-col">
            {/* Participant A outcomes */}
            <div className="w-full space-y-1.5">
              <div className="text-xs font-bold flex items-center gap-1 text-amber-200 truncate"><Crown className="h-3.5 w-3.5 text-primary" />{rA?.name ?? "Slot A"}</div>
              <div className="grid grid-cols-4 gap-1.5">
                <Button size="sm" className="btn-luxury text-xs" disabled={!rA} onClick={() => submitResult(resultMatch!.participant_a_id, "won")}>Won</Button>
                <Button size="sm" variant="outline" className="text-xs" disabled={!rA} onClick={() => submitResult(resultMatch!.participant_a_id, "qualified")}>Qualified</Button>
                <Button size="sm" variant="outline" className="text-xs" disabled={!rB} onClick={() => submitResult(resultMatch!.participant_b_id, "won")}>Lost</Button>
                <Button size="sm" variant="destructive" className="text-xs" disabled={!rB || !rA} onClick={() => submitResult(resultMatch!.participant_b_id, "won", resultMatch!.participant_a_id)}>DQ</Button>
              </div>
            </div>
            {/* Participant B outcomes */}
            <div className="w-full space-y-1.5">
              <div className="text-xs font-bold flex items-center gap-1 text-amber-200 truncate"><Crown className="h-3.5 w-3.5 text-primary" />{rB?.name ?? "Slot B"}</div>
              <div className="grid grid-cols-4 gap-1.5">
                <Button size="sm" className="btn-luxury text-xs" disabled={!rB} onClick={() => submitResult(resultMatch!.participant_b_id, "won")}>Won</Button>
                <Button size="sm" variant="outline" className="text-xs" disabled={!rB} onClick={() => submitResult(resultMatch!.participant_b_id, "qualified")}>Qualified</Button>
                <Button size="sm" variant="outline" className="text-xs" disabled={!rA} onClick={() => submitResult(resultMatch!.participant_a_id, "won")}>Lost</Button>
                <Button size="sm" variant="destructive" className="text-xs" disabled={!rA || !rB} onClick={() => submitResult(resultMatch!.participant_a_id, "won", resultMatch!.participant_b_id)}>DQ</Button>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => submitResult(null)}>Save scores only (no winner yet)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
