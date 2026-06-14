import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, X, Plus, Trash2, Shield, Lock, MessageSquare, AlertTriangle, LogOut, BarChart3, Check, Coins, Wallet, Tag, Eye, Trophy, Users, Calendar, Ticket, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { logAudit } from "@/lib/audit";
import { type AppRole, ROLE_LABELS } from "@/lib/roles";

function FuturesAdminPanel() {
  const [futures, setFutures] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [settings, setSettings] = useState({ futures_section_title: "TOURNAMENT FUTURES", futures_min_stake: 1, futures_max_payout: 100000000, futures_max_selections: 1 });
  const [draft, setDraft] = useState({ title: "Gang Champion of the Season", next_title: "Round 1", opens_at: "", closes_at: "", options: "", min_stake: 1, max_payout: 100000000, max_selections: 1 });
  const [restrictRepeat, setRestrictRepeat] = useState(false);
  const [searchQuery, setSearchQuery] = useState(""); // Search state

  // Filter players and teams by search query
  const filteredPlayers = useMemo(
    () => players.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [players, searchQuery]
  );

  const filteredTeams = useMemo(
    () => teams.filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [teams, searchQuery]
  );

  async function load() {
    const [{ data: s }, { data: f }, { data: tm }, { data: pl }] = await Promise.all([
      supabase.from("app_settings").select("futures_section_title,futures_min_stake,futures_max_payout,futures_max_selections").eq("id", 1).maybeSingle(),
      supabase.from("matches").select("*, markets(id,name,is_open,odds(id,label,value,is_winner,market_id,future_candidate_type,future_emblem_url,future_status,future_next_title,future_next_at,future_progress))").eq("match_kind", "future").eq("is_archived", false).order("start_time", { ascending: false }),
      supabase.from("teams").select("id,name,logo_url,gang_type").order("name"),
      supabase.from("players").select("id,name,avatar_url,team_id,teams!team_id(name)").order("name"),
    ]);
    if (s) setSettings({ futures_section_title: (s as any).futures_section_title ?? "TOURNAMENT FUTURES", futures_min_stake: Number((s as any).futures_min_stake ?? 1), futures_max_payout: Number((s as any).futures_max_payout ?? 100000000), futures_max_selections: Number((s as any).futures_max_selections ?? 1) });
    setFutures(f ?? []);
    setTeams(tm ?? []);
    setPlayers(pl ?? []);
  }
  useEffect(() => { load(); }, []);

  async function ensureFutureTeams() {
    const { data } = await supabase.from("teams").select("id,name").in("name", ["LSL Futures", "Season Field"]);
    let a = data?.find((t) => t.name === "LSL Futures")?.id;
    let b = data?.find((t) => t.name === "Season Field")?.id;
    if (!a) { const { data: row } = await supabase.from("teams").insert({ name: "LSL Futures" }).select("id").single(); a = row?.id; }
    if (!b) { const { data: row } = await supabase.from("teams").insert({ name: "Season Field" }).select("id").single(); b = row?.id; }
    return { a, b };
  }

  async function saveSettings() {
    const { error } = await supabase.from("app_settings").update(settings as any).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Futures settings saved");
  }

  function addCandidate(label: string, odds = 5, type = "contender", emblem?: string | null) {
    const row = [label, odds.toFixed(2), type, emblem ?? ""].join(" | ");
    setDraft((d) => ({ ...d, options: `${d.options}${d.options.trim() ? "\n" : ""}${row}` }));
  }

  async function createFuture() {
    const options = draft.options.split("\n").map((line) => {
      const parts = line.includes("|") ? line.split("|").map((x) => x.trim()) : line.split(/[,@]/).map((x) => x.trim());
      const [label, odd, type, emblem] = parts;
      return { label, value: Number(odd), future_candidate_type: type || null, future_emblem_url: emblem || null };
    }).filter((x) => x.label && Number.isFinite(x.value) && x.value >= 1.01);
    if (!draft.title.trim() || !draft.closes_at || options.length < 2) { toast.error("Add title, close date, and at least two outcomes like: Spain, 5.50"); return; }
    const ids = await ensureFutureTeams();
    if (!ids.a || !ids.b) { toast.error("Could not prepare futures teams"); return; }
    const { data: m, error } = await supabase.from("matches").insert({
      name: draft.title.trim(), home_team_id: ids.a, away_team_id: ids.b, match_kind: "future", is_featured: true, marketing_enabled: true,
      restrict_repeat_contender: restrictRepeat,
      location: `Opens ${new Date(draft.opens_at).toLocaleString()} · ${draft.next_title || "Tournament"}`, start_time: new Date(draft.closes_at).toISOString(), lock_time: new Date(draft.opens_at).toISOString(), status: "scheduled",
    } as any).select().single();
    if (error) { toast.error(error.message); return; }
    const { data: market } = await supabase.from("markets").insert({ match_id: m.id, name: draft.title.trim() }).select().single();
    if (market) await supabase.from("odds").insert(options.map((o) => ({ market_id: market.id, label: o.label, value: o.value, future_candidate_type: o.future_candidate_type, future_emblem_url: o.future_emblem_url, future_next_title: draft.next_title || null, future_next_at: draft.opens_at ? new Date(draft.opens_at).toISOString() : null })) as any);
    await supabase.from("app_settings").update({ futures_min_stake: draft.min_stake, futures_max_payout: draft.max_payout, futures_max_selections: draft.max_selections } as any).eq("id", 1);
    await logAudit("future_market_created", "match", m.id, { title: draft.title, options: options.length });
    toast.success("Futures market created");
    setDraft({ title: "Gang Champion of the Season", opens_at: draft.opens_at, closes_at: "", options: "", min_stake: draft.min_stake, max_payout: draft.max_payout, max_selections: draft.max_selections, next_title: "Round 1" });
    load();
  }

  async function deleteFuture(id: string) {
    await supabase.from("matches").update({ is_archived: true }).eq("id", id);
    load();
  }

  return (
    <div className="space-y-4">
      <Card className="glass-strong p-4 space-y-3">
        <div className="font-bold">Futures Settings</div>
        <Input value={settings.futures_section_title} onChange={(e) => setSettings({ ...settings, futures_section_title: e.target.value })} />
        <Button variant="outline" onClick={saveSettings}>Save Section Settings</Button>
        <div className="h-px bg-border" />
        
        <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Market title" />
        <Input value={draft.next_title} onChange={(e) => setDraft({ ...draft, next_title: e.target.value })} placeholder="Current / next round title" />
        <div><label className="text-xs text-muted-foreground">Opening date</label><Input type="datetime-local" value={draft.opens_at} onChange={(e) => setDraft({ ...draft, opens_at: e.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Closing date</label><Input type="datetime-local" value={draft.closes_at} onChange={(e) => setDraft({ ...draft, closes_at: e.target.value })} /></div>
        
        {/* Search bar for shooters and clans */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">Search shooters & clans</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name..."
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
        </div>

        {/* Quick-add buttons with scrollable container */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Quick add (showing {filteredTeams.length + filteredPlayers.length} of {teams.length + players.length})</label>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1 border border-border/50 rounded p-2 bg-card/50">
            {/* Clans */}
            {filteredTeams.map((t) => (
              <Button key={t.id} size="sm" variant="outline" onClick={() => addCandidate(t.name, 5, t.gang_type === "F" ? "Faction / Clan" : "Gang", t.logo_url)} className="text-left justify-start">
                {t.logo_url && <img src={t.logo_url} alt="" className="h-4 w-4 rounded-full mr-2" />}
                <span className="truncate">{t.name}</span>
              </Button>
            ))}
            
            {/* Shooters */}
            {filteredPlayers.map((p) => (
              <Button key={p.id} size="sm" variant="outline" onClick={() => addCandidate(p.name, 8, "Shooter", p.avatar_url)} className="text-left justify-start">
                {p.avatar_url && <img src={p.avatar_url} alt="" className="h-4 w-4 rounded-full mr-2" />}
                <span className="truncate">{p.name}</span>
              </Button>
            ))}
            
            {/* Empty state */}
            {filteredTeams.length === 0 && filteredPlayers.length === 0 && (
              <span className="col-span-2 text-xs text-muted-foreground text-center py-4">
                {searchQuery ? "No matches found" : "No shooters or clans available"}
              </span>
            )}
          </div>
        </div>

        <Textarea rows={8} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} placeholder={"One option per line:\nGang A | 5.50 | Gang | image-url\nTop Shooter | 8.00 | Shooter | image-url\nBest Clan | 10.00 | Faction / Clan | image-url"} />
        <div className="grid grid-cols-3 gap-2">
          <div><label className="text-[10px] text-muted-foreground">Min stake</label><Input type="number" min={1} value={draft.min_stake} onChange={(e) => setDraft({ ...draft, min_stake: Number(e.target.value) })} /></div>
          <div><label className="text-[10px] text-muted-foreground">Max payout</label><Input type="number" min={1} value={draft.max_payout} onChange={(e) => setDraft({ ...draft, max_payout: Number(e.target.value) })} /></div>
          <div><label className="text-[10px] text-muted-foreground">Max picks</label><Input type="number" min={1} max={50} value={draft.max_selections} onChange={(e) => setDraft({ ...draft, max_selections: Math.min(50, Math.max(1, Number(e.target.value))) })} /></div>
        </div>
        <Button className="btn-luxury w-full" onClick={createFuture}><Plus className="h-4 w-4 mr-1" />Create Futures Market</Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={restrictRepeat} onChange={(e) => setRestrictRepeat(e.target.checked)} className="h-4 w-4 accent-primary" />
          <span>One bet per contender — users may place many tickets in this tournament, but cannot bet the same shooter/gang twice.</span>
        </label>
      </Card>

      <div className="space-y-3">
        {futures.map((f) => (
          <Card key={f.id} className="glass p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{f.name}</div>
              <Button size="sm" variant="destructive" onClick={() => deleteFuture(f.id)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default FuturesAdminPanel;
