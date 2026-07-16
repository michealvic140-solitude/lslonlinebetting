import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trophy, Calendar, Plus, X, Radio } from "lucide-react";

type Tournament = {
  id: string;
  name: string | null;
  starts_at: string | null;
  status: string | null;
  current_stage: string | null;
  stage_gap_seconds: number | null;
  bracket_size: number | null;
};

/**
 * Championship Virtual admin — toggle the arena open/closed and schedule
 * upcoming 16-team knockout tournaments. Live bracket execution runs from
 * the server; this panel just gates access and schedules matchups.
 */
export function ChampionshipAdminPanel() {
  const [enabled, setEnabled] = useState(false);
  const [footballEnabled, setFootballEnabled] = useState(false);
  const [footballInstantEnabled, setFootballInstantEnabled] = useState(false);
  const [autoRestart, setAutoRestart] = useState(true);
  const [kind, setKind] = useState<"championship_virtual" | "championship_football">("championship_virtual");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [gap, setGap] = useState(20);
  const [saving, setSaving] = useState(false);
  const [footballTeamCount, setFootballTeamCount] = useState<number>(0);
  const [genericTeamCount, setGenericTeamCount] = useState<number>(0);
  const [bookingSecs, setBookingSecs] = useState(120);
  const [liveSecs, setLiveSecs] = useState(30);
  const [savingTimings, setSavingTimings] = useState(false);

  const sb = supabase as any;

  async function load() {
    const [{ data: s }, { data: ts }, { count: fbCount }, { count: gnCount }] = await Promise.all([
      sb.from("app_settings").select("virtual_championship_enabled,virtual_championship_football_enabled,virtual_championship_auto_restart,virtual_football_instant_enabled,championship_booking_seconds,championship_stage_live_seconds,championship_stage_gap_seconds").eq("id", 1).maybeSingle(),
      sb
        .from("tournaments")
        .select("id,name,starts_at,status,current_stage,stage_gap_seconds,bracket_size")
        .in("kind", ["championship_virtual","championship_football"])
        .order("starts_at", { ascending: false })
        .limit(20),
      sb.from("teams").select("id", { count: "exact", head: true }).in("sport", ["football", "both"]),
      sb.from("teams").select("id", { count: "exact", head: true }).or("sport.eq.generic,sport.eq.both,sport.is.null"),
    ]);
    setEnabled(!!s?.virtual_championship_enabled);
    setFootballEnabled(!!s?.virtual_championship_football_enabled);
    setFootballInstantEnabled(!!s?.virtual_football_instant_enabled);
    setAutoRestart(s?.virtual_championship_auto_restart ?? true);
    setBookingSecs(s?.championship_booking_seconds ?? 120);
    setLiveSecs(s?.championship_stage_live_seconds ?? 30);
    if (s?.championship_stage_gap_seconds) setGap(s.championship_stage_gap_seconds);
    setTournaments((ts ?? []) as Tournament[]);
    setFootballTeamCount(fbCount ?? 0);
    setGenericTeamCount(gnCount ?? 0);
  }

  async function saveTimings() {
    setSavingTimings(true);
    const { error } = await sb.from("app_settings").update({
      championship_booking_seconds: Math.max(15, bookingSecs),
      championship_stage_live_seconds: Math.max(10, liveSecs),
      championship_stage_gap_seconds: Math.max(5, gap),
    }).eq("id", 1);
    setSavingTimings(false);
    if (error) return toast.error(error.message);
    toast.success("Championship timings saved");
  }

  useEffect(() => { load(); }, []);

  async function toggleFlag(col: string, v: boolean, setter: (b: boolean) => void, label: string) {
    setter(v);
    const { error } = await sb.from("app_settings").update({ [col]: v }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    toast.success(`${label} ${v ? "on" : "off"}`);
  }

  async function autoTagFootballTeams() {
    if (genericTeamCount < 16) {
      toast.error("Need at least 16 teams total to auto-tag");
      return;
    }
    const { data: picks } = await sb.from("teams").select("id").or("sport.eq.generic,sport.eq.both,sport.is.null").limit(16);
    const ids = (picks ?? []).map((p: any) => p.id);
    if (ids.length === 0) return;
    const { error } = await sb.from("teams").update({ sport: "football" }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Tagged ${ids.length} teams as football`);
    load();
  }

  async function schedule() {
    if (!name.trim()) return toast.error("Name required");
    if (!startsAt) return toast.error("Pick a start time");
    setSaving(true);
    const { error } = await sb.from("tournaments").insert({
      name: name.trim(),
      kind,
      status: "scheduled",
      starts_at: new Date(startsAt).toISOString(),
      stage_gap_seconds: gap,
      bracket_size: 16,
      current_stage: "R16",
      is_featured: false,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${kind === "championship_football" ? "Football Cup" : "Championship"} scheduled`);
    setName(""); setStartsAt("");
    load();
  }

  async function cancel(id: string) {
    const { error } = await sb.from("tournaments").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cancelled"); load();
  }

  async function startNow(id: string) {
    const { error } = await sb.rpc("championship_start", { p_tournament: id });
    if (error) return toast.error(error.message);
    toast.success("Bracket drawn — tournament live");
    load();
  }

  return (
    <div className="space-y-4">
      <Card className="glass p-5 border-primary/30">
        <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border border-primary/20 bg-background/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-gold grid place-items-center shadow-gold">
              <Trophy className="h-5 w-5 text-background" />
            </div>
            <div>
              <div className="font-black text-base">Championship Virtual</div>
              <div className="text-xs text-muted-foreground">16-team knockout tournaments (R16 → QF → SF → Final)</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={enabled ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-muted/50 text-muted-foreground bg-muted/20"}>
              {enabled ? "Open" : "Closed"}
            </Badge>
            <Switch checked={enabled} onCheckedChange={(v) => toggleFlag("virtual_championship_enabled", v, setEnabled, "Championship Virtual")} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border border-primary/20 bg-background/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 grid place-items-center">
              <Trophy className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <div className="font-black text-base">Championship E-Football</div>
              <div className="text-xs text-muted-foreground">Same engine, uses football-tagged teams</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={footballEnabled ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-muted/50 text-muted-foreground bg-muted/20"}>
              {footballEnabled ? "Open" : "Closed"}
            </Badge>
            <Switch checked={footballEnabled} onCheckedChange={(v) => toggleFlag("virtual_championship_football_enabled", v, setFootballEnabled, "Championship E-Football")} />
          </div>
        </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div>
            <div className="font-black text-sm">Auto-restart after completion</div>
            <div className="text-xs text-muted-foreground">When a tournament ends, immediately reshuffle 16 random teams from the same sport pool and start a new one.</div>
          </div>
          <Switch checked={autoRestart} onCheckedChange={(v) => toggleFlag("virtual_championship_auto_restart", v, setAutoRestart, "Auto-restart")} />
        </div>

        <div className="mt-3 p-3 rounded-lg border border-primary/30 bg-background/40 space-y-3">
          <div>
            <div className="font-black text-sm">Championship timings</div>
            <div className="text-xs text-muted-foreground">Applied to every championship (virtual + football). Booking is the window before a tournament goes live where users can lock in their one championship bet.</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Booking window (seconds)</Label>
              <Input type="number" min={15} max={3600} value={bookingSecs} onChange={(e) => setBookingSecs(Number(e.target.value) || 120)} />
              <div className="text-[10px] text-muted-foreground mt-1">e.g. 120 = 2 min booking</div>
            </div>
            <div>
              <Label>Stage live duration (seconds)</Label>
              <Input type="number" min={10} max={600} value={liveSecs} onChange={(e) => setLiveSecs(Number(e.target.value) || 30)} />
              <div className="text-[10px] text-muted-foreground mt-1">How long each stage plays out</div>
            </div>
            <div>
              <Label>Gap between stages (seconds)</Label>
              <Input type="number" min={5} max={300} value={gap} onChange={(e) => setGap(Number(e.target.value) || 20)} />
              <div className="text-[10px] text-muted-foreground mt-1">Pause after live ends before next stage kicks off</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={saveTimings} disabled={savingTimings}>
            {savingTimings ? "Saving…" : "Save timings"}
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
          <div>
            <div className="font-black text-sm">Instant E-Football (per-user shootouts)</div>
            <div className="text-xs text-muted-foreground">
              Opens the /virtual/football-instant arena. Each user's penalty shootout starts privately when they place their bet.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={footballInstantEnabled ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-muted/50 text-muted-foreground bg-muted/20"}>
              {footballInstantEnabled ? "Open" : "Closed"}
            </Badge>
            <Switch checked={footballInstantEnabled} onCheckedChange={(v) => toggleFlag("virtual_football_instant_enabled", v, setFootballInstantEnabled, "Instant E-Football")} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border border-primary/20 bg-background/40 text-xs">
          <div>
            <div className="font-bold">Football team pool: <span className={footballTeamCount >= 16 ? "text-emerald-300" : "text-destructive"}>{footballTeamCount}</span></div>
            <div className="text-muted-foreground">Need at least 16 football-tagged teams for the football cup and instant shootouts. Tag teams in Clans admin or use quick-tag.</div>
          </div>
          {footballTeamCount < 16 && (
            <Button size="sm" variant="outline" onClick={autoTagFootballTeams} disabled={genericTeamCount < 16}>
              Auto-tag 16 teams as football
            </Button>
          )}
        </div>
      </Card>

      <Card className="glass p-5 border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="h-4 w-4 text-primary" />
          <div className="font-black">Schedule new tournament</div>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday Night Knockout" />
          </div>
          <div>
            <Label>Kind</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="championship_virtual">Championship Virtual</option>
              <option value="championship_football">Championship E-Football</option>
            </select>
          </div>
          <div>
            <Label>Starts at</Label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <Label>Gap between stages (s)</Label>
            <Input type="number" min={5} max={120} value={gap} onChange={(e) => setGap(Number(e.target.value) || 20)} />
          </div>
        </div>
        <Button className="btn-luxury mt-4" onClick={schedule} disabled={saving}>
          <Calendar className="h-4 w-4 mr-1" />{saving ? "Scheduling…" : "Schedule tournament"}
        </Button>
      </Card>

      <Card className="glass p-5 border-primary/20">
        <div className="font-black mb-3">Upcoming & recent</div>
        {tournaments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No championship tournaments yet.</p>
        ) : (
          <div className="space-y-2">
            {tournaments.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 p-3 rounded-md border border-border bg-background/40">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    <Calendar className="h-3 w-3" />
                    {t.starts_at ? new Date(t.starts_at).toLocaleString() : "—"}
                    <span className="opacity-40">·</span>
                    <span>gap {t.stage_gap_seconds ?? 20}s</span>
                    <span className="opacity-40">·</span>
                    <span>{t.bracket_size ?? 16} teams</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={
                      t.status === "live"
                        ? "border-red-500/50 text-red-300 bg-red-500/10"
                        : t.status === "scheduled"
                          ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
                          : t.status === "completed"
                            ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                            : "border-muted/50 text-muted-foreground"
                    }
                  >
                    {t.status === "live" ? <Radio className="h-3 w-3 mr-1 animate-pulse" /> : null}
                    {(t.status ?? "draft").toUpperCase()}
                  </Badge>
                  {t.status === "scheduled" && (
                    <Button variant="outline" size="sm" onClick={() => startNow(t.id)}>Start now</Button>
                  )}
                  {t.status !== "completed" && t.status !== "cancelled" && (
                    <Button variant="ghost" size="sm" onClick={() => cancel(t.id)}><X className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="glass p-4 border-primary/30 text-xs text-muted-foreground">
        <div className="font-bold text-primary mb-1">How it works</div>
        "Start now" auto-drafts 16 random teams into R16 and moves the tournament live. The engine then advances rounds every {gap}s: R16 → QF → SF → Final. Users can bet on outright champion, reach-stage (F/SF/QF), eliminated-at-stage, and per-match winners while stages are open.
      </Card>
    </div>
  );
}