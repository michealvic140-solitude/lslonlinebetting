import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Dice5, Plus, Lock, Trophy, Trash2, RefreshCw, Settings2, ShieldAlert, Coins, History } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

const DEFAULT_SCORES = ["0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:1", "1:2", "2:2", "3:0", "0:3", "3:1", "1:3", "3:2", "2:3", "3:3"];

type TeamOpt = { id: string; name: string };
type Round = {
  id: string; name: string; status: string; start_time: string; lock_time: string | null;
  home_team_id: string; away_team_id: string;
  home_score: number; away_score: number; virtual_first_blood_team_id: string | null;
  locked_by: string | null; locked_at: string | null; settled_by: string | null; settled_at: string | null;
  home_team: { id: string; name: string } | null;
  away_team: { id: string; name: string } | null;
};

type AuditEntry = { id: string; action: string; target_id: string | null; actor_id: string | null; created_at: string; metadata: any };

export function VirtualAdminPanel() {
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [resolveOf, setResolveOf] = useState<Round | null>(null);
  const [lockConfirm, setLockConfirm] = useState<Round | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});

  const reload = async () => {
    const [{ data: ts }, { data: rs }, { data: al }] = await Promise.all([
      supabase.from("teams").select("id,name").order("name"),
      supabase.from("matches")
        .select("id,name,status,start_time,lock_time,home_team_id,away_team_id,home_score,away_score,virtual_first_blood_team_id,locked_by,locked_at,settled_by,settled_at,home_team:teams!home_team_id(id,name),away_team:teams!away_team_id(id,name)")
        .eq("is_virtual", true).order("start_time", { ascending: false }).limit(50),
      supabase.from("audit_logs").select("id,action,target_id,actor_id,created_at,metadata")
        .in("action", ["virtual_round_locked", "virtual_round_resolved", "virtual_round_created"])
        .order("created_at", { ascending: false }).limit(30),
    ]);
    setTeams((ts ?? []) as any);
    setRounds((rs ?? []) as any);
    setAudit((al ?? []) as any);
    const ids = new Set<string>();
    (rs ?? []).forEach((r: any) => { if (r.locked_by) ids.add(r.locked_by); if (r.settled_by) ids.add(r.settled_by); });
    (al ?? []).forEach((a: any) => { if (a.actor_id) ids.add(a.actor_id); });
    if (ids.size) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,ingame_name").in("id", Array.from(ids));
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.ingame_name || p.full_name || p.id.slice(0,6); });
      setActors(map);
    }
  };

  useEffect(() => {
    reload();
    const ch = supabase.channel("admin-virtual")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: "is_virtual=eq.true" }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function quickCreate() {
    if (teams.length < 2) return toast.error("Need at least 2 teams. Create teams in Matches first.");
    const a = teams[Math.floor(Math.random() * teams.length)];
    let b = teams[Math.floor(Math.random() * teams.length)];
    while (b.id === a.id) b = teams[Math.floor(Math.random() * teams.length)];
    try {
      await createRound({ teamAId: a.id, teamBId: b.id, teamAName: a.name, teamBName: b.name, startInSec: 5, lockInSec: 35, oddsA: 1.95, oddsDraw: 3.5, oddsB: 1.95, totalLine: 4.5, oddsOver: 1.85, oddsUnder: 1.85, oddsFirstA: 1.95, oddsFirstB: 1.95, csOdds: 7, includeWinner: true, includeFirstBlood: true, includeTotal: true, includeCS: true });
      toast.success("Round created");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <CycleControl />
      <VirtualWalletPanel />
      <PendingPayouts />
      <Card className="glass p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-black flex items-center gap-2"><Dice5 className="h-5 w-5 text-primary" /> Virtual Gangs · Instant Rounds</h3>
            <p className="text-xs text-muted-foreground">Same team roster as regular matches. Lock & resolve actions are audit-logged.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/virtual/history"><Button size="sm" variant="outline"><History className="h-3 w-3 mr-1" />History</Button></Link>
            <Button size="sm" variant="outline" onClick={reload}><RefreshCw className="h-3 w-3 mr-1" />Refresh</Button>
            <Button size="sm" variant="outline" onClick={quickCreate}><Dice5 className="h-3 w-3 mr-1" />Quick Round</Button>
            <Button size="sm" onClick={() => setComposerOpen(true)}><Plus className="h-3 w-3 mr-1" />New Round</Button>
          </div>
        </div>
      </Card>

      <RewardsSettings />

      <Card className="glass p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Rounds ({rounds.length})</div>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {rounds.length === 0 && <p className="text-sm text-muted-foreground">No virtual rounds yet.</p>}
          {rounds.map((r) => {
            const lockMs = r.lock_time ? new Date(r.lock_time).getTime() : 0;
            const isLockedByTime = !!lockMs && lockMs <= Date.now();
            const ended = r.status === "ended";
            const locked = ended || r.status === "live" || isLockedByTime;
            const tone = ended ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
              : locked ? "bg-destructive/15 border-destructive/40 text-destructive"
              : "bg-primary/15 border-primary/40 text-primary";
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-2.5 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{r.home_team?.name} vs {r.away_team?.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(r.start_time).toLocaleString()} · {r.status}
                    {ended && <span className="text-emerald-400"> · final {r.home_score}-{r.away_score}</span>}
                    {r.locked_by && <span> · 🔒 by {actors[r.locked_by] ?? "—"}</span>}
                    {r.settled_by && <span> · ✓ by {actors[r.settled_by] ?? "—"}</span>}
                  </div>
                </div>
                <Badge variant="outline" className={tone}>{ended ? "SETTLED" : locked ? "LOCKED" : "OPEN"}</Badge>
                <div className="flex gap-1">
                  {!ended && (
                    <>
                      {!locked && <Button size="sm" variant="outline" onClick={() => setLockConfirm(r)}><Lock className="h-3 w-3 mr-1" />Lock</Button>}
                      <Button size="sm" onClick={() => setResolveOf(r)}><Trophy className="h-3 w-3 mr-1" />Resolve</Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!confirm("Delete this round?")) return;
                    await supabase.from("markets").delete().eq("match_id", r.id);
                    await supabase.from("matches").delete().eq("id", r.id);
                    toast.success("Deleted");
                  }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="glass p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5" />Audit log</div>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto text-xs">
          {audit.length === 0 && <p className="text-muted-foreground">No audit entries yet.</p>}
          {audit.map((a) => (
            <div key={a.id} className="flex items-start gap-2 border-b border-border/40 py-1.5">
              <Badge variant="outline" className="text-[9px] shrink-0">{a.action.replace("virtual_round_","")}</Badge>
              <div className="flex-1 min-w-0">
                <div className="truncate">{actors[a.actor_id ?? ""] ?? "—"}{a.metadata?.name ? ` · ${a.metadata.name}` : ""}{a.metadata?.home !== undefined ? ` · ${a.metadata.home}-${a.metadata.away}` : ""}</div>
                <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {composerOpen && <ComposerDialog teams={teams} onClose={() => setComposerOpen(false)} onSave={createRound} />}
      {resolveOf && <ResolveDialog round={resolveOf} onClose={() => setResolveOf(null)} />}
      {lockConfirm && <LockConfirmDialog round={lockConfirm} onClose={() => setLockConfirm(null)} />}
    </div>
  );
}

function LockConfirmDialog({ round, onClose }: { round: Round; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Lock round · {round.home_team?.name} vs {round.away_team?.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Locking immediately closes all markets and prevents new bets. This action is recorded in the audit log with your admin ID.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={async () => {
            setBusy(true);
            const { error } = await supabase.rpc("admin_lock_virtual_round", { _match_id: round.id });
            setBusy(false);
            if (error) return toast.error(error.message);
            toast.success("Round locked");
            onClose();
          }}><Lock className="h-3 w-3 mr-1" />Lock Now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RewardsSettings() {
  const [cfg, setCfg] = useState<any>({ virtual_payout_multiplier: 1, virtual_min_stake: 100000, virtual_max_stake: 10000000, virtual_max_payout: 100000000, virtual_min_selections: 1, virtual_max_selections: 20, virtual_xp_per_win: 15, virtual_win_bonus_tokens: 0 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from("app_settings").select("virtual_payout_multiplier,virtual_min_stake,virtual_max_stake,virtual_max_payout,virtual_min_selections,virtual_max_selections,virtual_xp_per_win,virtual_win_bonus_tokens").eq("id", 1).maybeSingle()
      .then(({ data }) => { if (data) setCfg((prev: any) => ({ ...prev, ...data })); });
  }, []);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("app_settings").update(cfg).eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Reward settings saved");
  };
  return (
    <Card className="glass p-4">
      <div className="flex items-center gap-2 mb-3"><Settings2 className="h-4 w-4 text-primary" /><div className="text-sm font-bold">Virtual reward & stake settings</div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Payout × multiplier" value={cfg.virtual_payout_multiplier} step={0.05} onChange={(v) => setCfg({ ...cfg, virtual_payout_multiplier: v })} />
        <Field label="Min stake (tokens)" value={cfg.virtual_min_stake} step={10000} onChange={(v) => setCfg({ ...cfg, virtual_min_stake: v })} />
        <Field label="Max stake (tokens)" value={cfg.virtual_max_stake} step={100000} onChange={(v) => setCfg({ ...cfg, virtual_max_stake: v })} />
        <Field label="Max payout (tokens)" value={cfg.virtual_max_payout ?? 0} step={1000000} onChange={(v) => setCfg({ ...cfg, virtual_max_payout: v })} />
        <Field label="Min selections / ticket" value={cfg.virtual_min_selections} step={1} onChange={(v) => setCfg({ ...cfg, virtual_min_selections: Math.max(1, v) })} />
        <Field label="Max selections / ticket" value={cfg.virtual_max_selections} step={1} onChange={(v) => setCfg({ ...cfg, virtual_max_selections: Math.max(1, v) })} />
        <Field label="XP per win" value={cfg.virtual_xp_per_win} step={1} onChange={(v) => setCfg({ ...cfg, virtual_xp_per_win: v })} />
        <Field label="Win bonus (tokens)" value={cfg.virtual_win_bonus_tokens} step={10000} onChange={(v) => setCfg({ ...cfg, virtual_win_bonus_tokens: v })} />
      </div>
      <div className="mt-3 flex justify-end"><Button size="sm" disabled={busy} onClick={save}><Coins className="h-3 w-3 mr-1" />Save settings</Button></div>
    </Card>
  );
}

function Field({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div><Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="h-9" /></div>
  );
}

type Cfg = {
  teamAId: string; teamBId: string; teamAName: string; teamBName: string;
  startInSec: number; lockInSec: number;
  oddsA: number; oddsDraw: number; oddsB: number;
  oddsFirstA: number; oddsFirstB: number;
  totalLine: number; oddsOver: number; oddsUnder: number;
  csOdds: number;
  includeWinner: boolean; includeFirstBlood: boolean; includeTotal: boolean; includeCS: boolean;
};

async function getVirtualCategoryId(): Promise<string | null> {
  const { data } = await supabase.from("categories").select("id").eq("name", "Virtual Gangs").maybeSingle();
  return data?.id ?? null;
}

async function createRound(cfg: Cfg) {
  const catId = await getVirtualCategoryId();
  const start = new Date(Date.now() + cfg.startInSec * 1000);
  const lock = new Date(Date.now() + cfg.lockInSec * 1000);
  const { data: match, error } = await supabase.from("matches").insert({
    name: `${cfg.teamAName} vs ${cfg.teamBName}`,
    home_team_id: cfg.teamAId, away_team_id: cfg.teamBId,
    start_time: start.toISOString(), lock_time: lock.toISOString(),
    status: "scheduled", is_virtual: true, category_id: catId,
  }).select("id").single();
  if (error) throw error;
  const matchId = match.id;

  if (cfg.includeWinner) {
    const { data: mk } = await supabase.from("markets").insert({ match_id: matchId, name: "Match Winner" }).select("id").single();
    if (mk) await supabase.from("odds").insert([
      { market_id: mk.id, label: cfg.teamAName, value: cfg.oddsA },
      { market_id: mk.id, label: "Draw", value: cfg.oddsDraw },
      { market_id: mk.id, label: cfg.teamBName, value: cfg.oddsB },
    ]);
  }
  if (cfg.includeFirstBlood) {
    const { data: mk } = await supabase.from("markets").insert({ match_id: matchId, name: "First Blood" }).select("id").single();
    if (mk) await supabase.from("odds").insert([
      { market_id: mk.id, label: cfg.teamAName, value: cfg.oddsFirstA },
      { market_id: mk.id, label: cfg.teamBName, value: cfg.oddsFirstB },
    ]);
  }
  if (cfg.includeTotal) {
    const { data: mk } = await supabase.from("markets").insert({ match_id: matchId, name: `Total Kills O/U ${cfg.totalLine}` }).select("id").single();
    if (mk) await supabase.from("odds").insert([
      { market_id: mk.id, label: `Over ${cfg.totalLine}`, value: cfg.oddsOver },
      { market_id: mk.id, label: `Under ${cfg.totalLine}`, value: cfg.oddsUnder },
    ]);
  }
  if (cfg.includeCS) {
    const { data: mk } = await supabase.from("markets").insert({ match_id: matchId, name: "Correct Score" }).select("id").single();
    if (mk) await supabase.from("odds").insert(DEFAULT_SCORES.map((s) => ({ market_id: mk.id, label: s, value: cfg.csOdds })));
  }
  await supabase.from("audit_logs").insert({ action: "virtual_round_created", target_type: "match", target_id: matchId, metadata: { name: `${cfg.teamAName} vs ${cfg.teamBName}` } });
}

function ComposerDialog({ teams, onClose, onSave }: { teams: TeamOpt[]; onClose: () => void; onSave: (c: Cfg) => Promise<void> }) {
  const [cfg, setCfg] = useState<Cfg>({
    teamAId: teams[0]?.id ?? "", teamBId: teams[1]?.id ?? "",
    teamAName: teams[0]?.name ?? "", teamBName: teams[1]?.name ?? "",
    startInSec: 5, lockInSec: 35,
    oddsA: 1.95, oddsDraw: 3.5, oddsB: 1.95,
    oddsFirstA: 1.95, oddsFirstB: 1.95,
    totalLine: 4.5, oddsOver: 1.85, oddsUnder: 1.85,
    csOdds: 7,
    includeWinner: true, includeFirstBlood: true, includeTotal: true, includeCS: true,
  });
  const upd = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const setTeam = (which: "A" | "B", id: string) => {
    const t = teams.find((x) => x.id === id);
    if (!t) return;
    if (which === "A") setCfg((c) => ({ ...c, teamAId: id, teamAName: t.name }));
    else setCfg((c) => ({ ...c, teamBId: id, teamBName: t.name }));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Virtual Round</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Team A (same roster as matches)</Label>
              <Select value={cfg.teamAId} onValueChange={(v) => setTeam("A", v)}>
                <SelectTrigger><SelectValue placeholder="Pick team" /></SelectTrigger>
                <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Team B</Label>
              <Select value={cfg.teamBId} onValueChange={(v) => setTeam("B", v)}>
                <SelectTrigger><SelectValue placeholder="Pick team" /></SelectTrigger>
                <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Start in (sec)</Label><Input type="number" value={cfg.startInSec} onChange={(e) => upd("startInSec", +e.target.value)} /></div>
            <div><Label>Lock at (sec from now)</Label><Input type="number" value={cfg.lockInSec} onChange={(e) => upd("lockInSec", +e.target.value)} /></div>
          </div>

          <MarketBlock label="Match Winner" enabled={cfg.includeWinner} onToggle={(v) => upd("includeWinner", v)}>
            <NumIn label={`${cfg.teamAName || "Home"}`} v={cfg.oddsA} on={(v) => upd("oddsA", v)} />
            <NumIn label="Draw" v={cfg.oddsDraw} on={(v) => upd("oddsDraw", v)} />
            <NumIn label={`${cfg.teamBName || "Away"}`} v={cfg.oddsB} on={(v) => upd("oddsB", v)} />
          </MarketBlock>

          <MarketBlock label="First Blood" enabled={cfg.includeFirstBlood} onToggle={(v) => upd("includeFirstBlood", v)}>
            <NumIn label={`${cfg.teamAName || "A"}`} v={cfg.oddsFirstA} on={(v) => upd("oddsFirstA", v)} />
            <NumIn label={`${cfg.teamBName || "B"}`} v={cfg.oddsFirstB} on={(v) => upd("oddsFirstB", v)} />
          </MarketBlock>

          <MarketBlock label="Total Kills O/U" enabled={cfg.includeTotal} onToggle={(v) => upd("includeTotal", v)}>
            <NumIn label="Line" v={cfg.totalLine} on={(v) => upd("totalLine", v)} step={0.5} />
            <NumIn label="Over" v={cfg.oddsOver} on={(v) => upd("oddsOver", v)} />
            <NumIn label="Under" v={cfg.oddsUnder} on={(v) => upd("oddsUnder", v)} />
          </MarketBlock>

          <MarketBlock label="Correct Score (16 scorelines)" enabled={cfg.includeCS} onToggle={(v) => upd("includeCS", v)}>
            <NumIn label="Flat odds per scoreline" v={cfg.csOdds} on={(v) => upd("csOdds", v)} />
          </MarketBlock>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => {
            if (!cfg.teamAId || !cfg.teamBId) return toast.error("Pick two teams");
            if (cfg.teamAId === cfg.teamBId) return toast.error("Teams must differ");
            try { await onSave(cfg); toast.success("Round created"); onClose(); }
            catch (e: any) { toast.error(e.message); }
          }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarketBlock({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: (v: boolean) => void; children: any }) {
  return (
    <div className="rounded-lg border border-border p-3 bg-background/30">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-bold">{label}</div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && <div className="grid grid-cols-3 gap-2">{children}</div>}
    </div>
  );
}

function NumIn({ label, v, on, step = 0.05 }: { label: string; v: number; on: (n: number) => void; step?: number }) {
  return (
    <div><Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Input type="number" step={step} value={v} onChange={(e) => on(+e.target.value)} /></div>
  );
}

function ResolveDialog({ round, onClose }: { round: Round; onClose: () => void }) {
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [first, setFirst] = useState<string>(round.home_team_id);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step === "edit" ? "Resolve" : "Confirm settlement"} · {round.home_team?.name} vs {round.away_team?.name}</DialogTitle>
        </DialogHeader>
        {step === "edit" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{round.home_team?.name} score</Label><Input type="number" min={0} value={home} onChange={(e) => setHome(+e.target.value)} /></div>
              <div><Label>{round.away_team?.name} score</Label><Input type="number" min={0} value={away} onChange={(e) => setAway(+e.target.value)} /></div>
            </div>
            <div>
              <Label>First blood</Label>
              <Select value={first} onValueChange={setFirst}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={round.home_team_id}>{round.home_team?.name}</SelectItem>
                  <SelectItem value={round.away_team_id}>{round.away_team?.name}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <div className="font-bold flex items-center gap-2 text-amber-300 mb-2"><ShieldAlert className="h-4 w-4" />Final settlement</div>
              <div>This will mark <b>{round.home_team?.name} {home} – {away} {round.away_team?.name}</b>, settle every bet attached, credit winners, and log your admin ID to the audit trail. It cannot be undone.</div>
            </div>
            <div className="text-xs text-muted-foreground">First blood: <b>{first === round.home_team_id ? round.home_team?.name : round.away_team?.name}</b></div>
          </div>
        )}
        <DialogFooter>
          {step === "edit" ? (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setStep("confirm")}>Review</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("edit")} disabled={busy}>Back</Button>
              <Button disabled={busy} onClick={async () => {
                setBusy(true);
                const { error } = await supabase.rpc("resolve_virtual_round", {
                  _match_id: round.id, _home_score: home, _away_score: away, _first_blood_team_id: first,
                });
                setBusy(false);
                if (error) return toast.error(error.message);
                toast.success("Resolved & payouts credited");
                onClose();
              }}>Confirm & Publish</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CycleControl() {
  const [cfg, setCfg] = useState<{ running: boolean; durSec: number; animSec: number; maxScore: number; lastTick: string | null }>({ running: false, durSec: 120, animSec: 15, maxScore: 8, lastTick: null });
  const [busy, setBusy] = useState(false);
  const load = () => supabase.from("app_settings").select("virtual_cycle_running,virtual_round_duration_seconds,virtual_animation_seconds,virtual_max_score,virtual_cycle_last_tick").eq("id", 1).maybeSingle()
    .then(({ data }) => { if (data) setCfg({ running: !!(data as any).virtual_cycle_running, durSec: Number((data as any).virtual_round_duration_seconds ?? 120), animSec: Number((data as any).virtual_animation_seconds ?? 15), maxScore: Number((data as any).virtual_max_score ?? 8), lastTick: (data as any).virtual_cycle_last_tick }); });
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  async function toggle(running: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_virtual_cycle" as any, { _running: running });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(running ? "Cycle started — rounds will auto-spawn" : "Cycle paused");
    load();
  }
  async function saveTimings() {
    setBusy(true);
    const { error } = await supabase.from("app_settings").update({ virtual_round_duration_seconds: cfg.durSec, virtual_animation_seconds: cfg.animSec, virtual_max_score: cfg.maxScore }).eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message); toast.success("Saved");
  }
  return (
    <Card className="glass p-4 border-primary/30">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Cycle engine</div>
          <div className="text-lg font-black flex items-center gap-2">
            <span className={cfg.running ? "text-emerald-400" : "text-muted-foreground"}>●</span>
            {cfg.running ? "RUNNING — auto-spawning rounds" : "PAUSED"}
          </div>
          <div className="text-[10px] text-muted-foreground">Last tick: {cfg.lastTick ? new Date(cfg.lastTick).toLocaleTimeString() : "—"}</div>
        </div>
        <div className="flex gap-2">
          {cfg.running ? (
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => toggle(false)}><Lock className="h-3 w-3 mr-1" />Pause cycle</Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => toggle(true)}><Dice5 className="h-3 w-3 mr-1" />Start cycle</Button>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Field label="Round (sec)" value={cfg.durSec} step={10} onChange={(v) => setCfg({ ...cfg, durSec: v })} />
        <Field label="Animation (sec)" value={cfg.animSec} step={1} onChange={(v) => setCfg({ ...cfg, animSec: v })} />
        <Field label="Max score" value={cfg.maxScore} step={1} onChange={(v) => setCfg({ ...cfg, maxScore: v })} />
      </div>
      <div className="mt-2 flex justify-end"><Button size="sm" variant="outline" disabled={busy} onClick={saveTimings}>Save timings</Button></div>
    </Card>
  );
}

function PendingPayouts() {
  const [rows, setRows] = useState<any[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => supabase.from("virtual_payout_requests").select("id,bet_id,user_id,match_id,stake,amount,status,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(50)
    .then(async ({ data }) => {
      const list = data ?? [];
      if (list.length) {
        const uids = Array.from(new Set(list.map((r: any) => r.user_id)));
        const { data: profs } = await supabase.from("profiles").select("id,ingame_name,full_name").in("id", uids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = p.ingame_name || p.full_name || p.id.slice(0, 6); });
        setRows(list.map((r: any) => ({ ...r, _user: map[r.user_id] ?? r.user_id.slice(0, 6) })));
      } else setRows([]);
    });
  useEffect(() => {
    load();
    const ch = supabase.channel("admin-vpr").on("postgres_changes", { event: "*", schema: "public", table: "virtual_payout_requests" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  async function review(id: string, approve: boolean) {
    if (!approve && !reason) return toast.error("Add a decline reason");
    setBusy(id);
    const { error } = await supabase.rpc("admin_review_virtual_payout" as any, { _id: id, _approve: approve, _reason: approve ? null : reason });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(approve ? "Approved — user can claim" : "Declined — stake refunded");
    setReason("");
  }
  return (
    <Card className="glass p-4 border-accent/30">
      <div className="flex items-center gap-2 mb-3"><Coins className="h-4 w-4 text-accent" /><div className="text-sm font-bold">Pending payouts ({rows.length})</div></div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No pending payouts.</p>}
      <div className="space-y-2 max-h-[320px] overflow-y-auto">
        {rows.map((r) => (
          <div key={r.id} className="rounded-md border border-border bg-background/40 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="font-bold truncate">{r._user}</div>
                <div className="text-[10px] text-muted-foreground">Stake {Number(r.stake).toLocaleString()} → Payout <b className="text-accent">{Number(r.amount).toLocaleString()}</b></div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" disabled={busy === r.id} onClick={() => review(r.id, true)}>Approve</Button>
                <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => review(r.id, false)}>Decline</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <div className="mt-2"><Input placeholder="Decline reason (required when declining)" value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 text-xs" /></div>
      )}
    </Card>
  );
}

function VirtualWalletPanel() {
  const [wallet, setWallet] = useState<{ balance: number; total_in: number; total_out: number } | null>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [amount, setAmount] = useState<number>(1000000);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [concurrent, setConcurrent] = useState<number>(4);

  const load = async () => {
    const [{ data: w }, { data: t }, { data: s }] = await Promise.all([
      supabase.from("virtual_house_wallet").select("balance,total_in,total_out").eq("id", 1).maybeSingle(),
      supabase.from("virtual_house_transactions").select("id,kind,amount,balance_after,reason,created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("app_settings").select("virtual_concurrent_rounds").eq("id", 1).maybeSingle(),
    ]);
    if (w) setWallet(w as any);
    setTxs((t ?? []) as any);
    if (s) setConcurrent(Number((s as any).virtual_concurrent_rounds ?? 4));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-vhw")
      .on("postgres_changes", { event: "*", schema: "public", table: "virtual_house_wallet" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "virtual_house_transactions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function adjust(sign: 1 | -1) {
    if (!amount || amount <= 0) return toast.error("Enter a positive amount");
    if (!reason.trim()) return toast.error("Reason is required");
    setBusy(true);
    const { error } = await supabase.rpc("virtual_wallet_admin_adjust" as any, { _amount: sign * amount, _reason: reason });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(sign > 0 ? "Wallet funded" : "Wallet debited");
    setReason("");
  }

  async function saveConcurrent() {
    setBusy(true);
    const { error } = await supabase.from("app_settings").update({ virtual_concurrent_rounds: Math.max(1, concurrent) }).eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Concurrency saved");
  }

  return (
    <Card className="glass p-4 border-accent/30">
      <div className="flex items-center gap-2 mb-3">
        <Coins className="h-4 w-4 text-accent" />
        <div className="text-sm font-bold">Virtual House Wallet</div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Balance</div>
          <div className="text-2xl font-black text-accent tabular-nums">{Number(wallet?.balance ?? 0).toLocaleString()}</div>
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total in</div>
          <div className="text-lg font-bold tabular-nums">{Number(wallet?.total_in ?? 0).toLocaleString()}</div>
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total out</div>
          <div className="text-lg font-bold tabular-nums">{Number(wallet?.total_out ?? 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto_auto] gap-2 items-end mb-3">
        <Field label="Amount" value={amount} step={100000} onChange={setAmount} />
        <div>
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9" placeholder="Funding / adjustment note" />
        </div>
        <Button size="sm" disabled={busy} onClick={() => adjust(1)}><Plus className="h-3 w-3 mr-1" />Fund</Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => adjust(-1)}>Debit</Button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end mb-3">
        <Field label="Concurrent virtual rounds" value={concurrent} step={1} onChange={setConcurrent} />
        <Button size="sm" variant="outline" disabled={busy} onClick={saveConcurrent}>Save</Button>
      </div>

      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Recent wallet activity</div>
      <div className="space-y-1 max-h-[220px] overflow-y-auto text-xs">
        {txs.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
        {txs.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
            <div className="min-w-0">
              <div className="font-bold truncate">{t.kind} {t.reason ? <span className="text-muted-foreground font-normal">· {t.reason}</span> : null}</div>
              <div className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
            </div>
            <div className={`font-mono font-bold tabular-nums ${t.amount >= 0 ? "text-emerald-400" : "text-destructive"}`}>{t.amount >= 0 ? "+" : ""}{Number(t.amount).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
