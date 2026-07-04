import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Dice5, Plus, Trash2, Play, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmDialog";

export function LotteryAdminPanel() {
  const confirm = useConfirm();
  const [settings, setSettings] = useState({ lottery_enabled: false, lottery_min_stake: 100000, lottery_max_stake: 50000000, lottery_intro: "" });
  const [draws, setDraws] = useState<any[]>([]);
  const [draft, setDraft] = useState({ title: "Lucky Numbers Draw", number_max: 9, multiplier: 2 });
  const [drawDialog, setDrawDialog] = useState<any | null>(null);
  const [winningNumber, setWinningNumber] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from("app_settings").select("lottery_enabled,lottery_min_stake,lottery_max_stake,lottery_intro").eq("id", 1).maybeSingle(),
      supabase.from("lottery_draws").select("*, lottery_tickets(id,stake,status,payout)").order("created_at", { ascending: false }),
    ]);
    if (s) setSettings({
      lottery_enabled: !!(s as any).lottery_enabled,
      lottery_min_stake: Number((s as any).lottery_min_stake ?? 100000),
      lottery_max_stake: Number((s as any).lottery_max_stake ?? 50000000),
      lottery_intro: (s as any).lottery_intro ?? "",
    });
    setDraws(d ?? []);
  }
  useEffect(() => { load(); }, []);

  async function saveSettings() {
    setSaving(true);
    const { error } = await (supabase as any).from("app_settings").update({
      lottery_enabled: settings.lottery_enabled,
      lottery_min_stake: settings.lottery_min_stake,
      lottery_max_stake: settings.lottery_max_stake,
      lottery_intro: settings.lottery_intro,
    }).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lottery settings saved");
  }

  async function createDraw() {
    if (!draft.title.trim()) return toast.error("Enter a title");
    const { error } = await supabase.from("lottery_draws").insert({
      title: draft.title.trim(),
      number_max: Math.max(1, draft.number_max),
      multiplier: Math.max(1, draft.multiplier),
    });
    if (error) return toast.error(error.message);
    toast.success("Draw created");
    setDraft({ title: "Lucky Numbers Draw", number_max: 9, multiplier: 2 });
    load();
  }

  async function runDraw() {
    if (!drawDialog) return;
    const wn = winningNumber.trim() === "" ? null : Number(winningNumber);
    const { data, error } = await (supabase.rpc as any)("draw_lottery", { _draw_id: drawDialog.id, _winning_number: wn });
    if (error) return toast.error(error.message);
    toast.success(`Winning number: ${data.winning_number} · ${data.winners} winner(s) · paid ${Number(data.total_payout).toLocaleString()}`);
    setDrawDialog(null); setWinningNumber("");
    load();
  }

  async function deleteDraw(id: string) {
    if (!(await confirm({ title: "Delete draw?", description: "This removes the draw and all its tickets.", confirmText: "Delete", tone: "danger" }))) return;
    const { error } = await supabase.from("lottery_draws").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Draw deleted");
    load();
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h3 className="font-bold flex items-center gap-2 mb-4"><Dice5 className="h-5 w-5 text-primary" />Lottery Settings</h3>
        <div className="flex items-center justify-between mb-4 p-3 rounded-lg border border-border">
          <div>
            <div className="font-semibold text-sm">Lottery enabled</div>
            <div className="text-xs text-muted-foreground">Players can buy tickets when on.</div>
          </div>
          <Switch checked={settings.lottery_enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, lottery_enabled: v }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Min stake</label><Input type="number" value={settings.lottery_min_stake} onChange={(e) => setSettings((s) => ({ ...s, lottery_min_stake: Number(e.target.value) }))} /></div>
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Max stake</label><Input type="number" value={settings.lottery_max_stake} onChange={(e) => setSettings((s) => ({ ...s, lottery_max_stake: Number(e.target.value) }))} /></div>
        </div>
        <div className="mt-3"><label className="text-xs uppercase tracking-widest text-muted-foreground">Intro message</label><Textarea value={settings.lottery_intro} onChange={(e) => setSettings((s) => ({ ...s, lottery_intro: e.target.value }))} placeholder="Pick your lucky number and win big!" /></div>
        <Button className="btn-luxury mt-4" onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Button>
      </Card>

      <Card className="p-5">
        <h3 className="font-bold flex items-center gap-2 mb-4"><Plus className="h-5 w-5 text-primary" />Create a Draw</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Title</label><Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} /></div>
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Highest number (0–N)</label><Input type="number" min={1} value={draft.number_max} onChange={(e) => setDraft((d) => ({ ...d, number_max: Number(e.target.value) }))} /></div>
          <div><label className="text-xs uppercase tracking-widest text-muted-foreground">Payout multiplier</label><Input type="number" min={1} step={0.5} value={draft.multiplier} onChange={(e) => setDraft((d) => ({ ...d, multiplier: Number(e.target.value) }))} /></div>
        </div>
        <Button className="btn-luxury mt-4" onClick={createDraw}><Plus className="h-4 w-4 mr-1" />Create Draw</Button>
      </Card>

      <div className="space-y-3">
        <h3 className="font-bold flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" />Draws</h3>
        {draws.length === 0 && <p className="text-sm text-muted-foreground">No draws yet.</p>}
        {draws.map((dr) => {
          const tickets = dr.lottery_tickets ?? [];
          const pot = tickets.reduce((a: number, t: any) => a + Number(t.stake), 0);
          return (
            <Card key={dr.id} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-bold flex items-center gap-2">{dr.title}
                    <Badge variant="outline" className={dr.status === "drawn" ? "border-emerald-500/50 text-emerald-300" : "border-primary/50 text-primary"}>{dr.status.toUpperCase()}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Pick 0–{dr.number_max} · x{dr.multiplier} · {tickets.length} ticket(s) · pot {pot.toLocaleString()}{dr.status === "drawn" && <> · winner: <span className="text-emerald-300 font-bold">{dr.winning_number}</span></>}</div>
                </div>
                <div className="flex gap-2">
                  {dr.status !== "drawn" && (
                    <Button size="sm" className="btn-luxury" onClick={() => { setDrawDialog(dr); setWinningNumber(""); }}><Play className="h-4 w-4 mr-1" />Draw</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => deleteDraw(dr.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!drawDialog} onOpenChange={(o) => !o && setDrawDialog(null)}>
        <DialogContent className="glass-strong border-primary/30 max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Dice5 className="h-5 w-5 text-primary" />Run the draw</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Leave blank to let the system pick a random winning number, or set it manually (0–{drawDialog?.number_max}).</p>
          <Input type="number" min={0} max={drawDialog?.number_max} value={winningNumber} onChange={(e) => setWinningNumber(e.target.value)} placeholder="Random" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrawDialog(null)}>Cancel</Button>
            <Button className="btn-luxury" onClick={runDraw}><Play className="h-4 w-4 mr-1" />Settle Draw</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
