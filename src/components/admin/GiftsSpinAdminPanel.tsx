import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Gift, Sparkles, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function GiftsSpinAdminPanel() {
  const [spin, setSpin] = useState({ spin_enabled: false, spin_cooldown_hours: 24, spin_min_reward: 100000, spin_max_reward: 5000000 });
  const [savingSpin, setSavingSpin] = useState(false);

  const [mode, setMode] = useState<"all" | "one">("all");
  const [specialId, setSpecialId] = useState("");
  const [recipient, setRecipient] = useState<{ full_name: string; special_id: string } | null>(null);
  const [amount, setAmount] = useState(1_000_000);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [recent, setRecent] = useState<any[]>([]);

  async function load() {
    const [{ data: s }, { data: g }] = await Promise.all([
      supabase.from("app_settings").select("spin_enabled,spin_cooldown_hours,spin_min_reward,spin_max_reward").eq("id", 1).maybeSingle(),
      (supabase as any).from("user_gifts").select("id,amount,message,status,created_at,profiles:user_id(full_name)").order("created_at", { ascending: false }).limit(20),
    ]);
    if (s) setSpin({
      spin_enabled: !!(s as any).spin_enabled,
      spin_cooldown_hours: Number((s as any).spin_cooldown_hours ?? 24),
      spin_min_reward: Number((s as any).spin_min_reward ?? 100000),
      spin_max_reward: Number((s as any).spin_max_reward ?? 5000000),
    });
    setRecent(g ?? []);
  }
  useEffect(() => { load(); }, []);

  async function saveSpin() {
    setSavingSpin(true);
    const { error } = await (supabase as any).from("app_settings").update({
      spin_enabled: spin.spin_enabled,
      spin_cooldown_hours: Math.max(0, spin.spin_cooldown_hours),
      spin_min_reward: Math.max(0, spin.spin_min_reward),
      spin_max_reward: Math.max(0, spin.spin_max_reward),
    }).eq("id", 1);
    setSavingSpin(false);
    if (error) return toast.error(error.message);
    toast.success("Lucky spin settings saved");
  }

  async function lookup() {
    const id = specialId.trim();
    if (!id) return toast.error("Enter a Special ID");
    const { data, error } = await (supabase.rpc as any)("resolve_special_id", { _special_id: id });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) { setRecipient(null); return toast.error("No user found with that Special ID"); }
    setRecipient({ full_name: row.full_name, special_id: row.special_id });
  }

  async function sendGift() {
    if (amount <= 0) return toast.error("Enter a valid amount");
    let userId: string | null = null;
    if (mode === "one") {
      if (!recipient) return toast.error("Look up a recipient first");
      const { data } = await (supabase.rpc as any)("resolve_special_id", { _special_id: recipient.special_id });
      const row = Array.isArray(data) ? data[0] : data;
      userId = row?.id ?? null;
      if (!userId) return toast.error("Could not resolve recipient");
    }
    setSending(true);
    const { data, error } = await (supabase.rpc as any)("admin_send_gift", { _user_id: userId, _amount: amount, _message: message.trim() || null });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success(`Gift sent to ${data?.sent ?? 0} user(s)`);
    setMessage(""); setSpecialId(""); setRecipient(null);
    load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Send gift */}
      <Card className="p-5 border-primary/20">
        <h3 className="font-bold flex items-center gap-2 mb-4"><Gift className="h-5 w-5 text-primary" />Send a Claimable Gift</h3>
        <div className="flex gap-2 mb-4">
          <Button size="sm" variant={mode === "all" ? "default" : "outline"} onClick={() => setMode("all")}><Users className="h-4 w-4 mr-1" />All users</Button>
          <Button size="sm" variant={mode === "one" ? "default" : "outline"} onClick={() => setMode("one")}>Specific user</Button>
        </div>
        {mode === "one" && (
          <div className="mb-3">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Recipient Special ID</label>
            <div className="flex gap-2">
              <Input value={specialId} onChange={(e) => { setSpecialId(e.target.value.toUpperCase()); setRecipient(null); }} placeholder="e.g. XHA6HD8" />
              <Button variant="outline" onClick={lookup}>Check</Button>
            </div>
            {recipient && <p className="text-xs text-emerald-300 mt-1">Sending to <span className="font-bold">{recipient.full_name}</span></p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Amount (tokens)</label>
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Message (optional)</label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A little something from the house 🎁" rows={2} />
        </div>
        <Button onClick={sendGift} disabled={sending} className="btn-luxury"><Send className="h-4 w-4 mr-1" />{sending ? "Sending…" : "Send Gift"}</Button>
      </Card>

      {/* Lucky spin */}
      <Card className="p-5 border-amber-500/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-300" />Lucky Spin</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{spin.spin_enabled ? "Active" : "Disabled"}</span>
            <Switch checked={spin.spin_enabled} onCheckedChange={(v) => setSpin((p) => ({ ...p, spin_enabled: v }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Min reward</label>
            <Input type="number" min={0} value={spin.spin_min_reward} onChange={(e) => setSpin((p) => ({ ...p, spin_min_reward: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Max reward</label>
            <Input type="number" min={0} value={spin.spin_max_reward} onChange={(e) => setSpin((p) => ({ ...p, spin_max_reward: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Cooldown (hours)</label>
            <Input type="number" min={0} value={spin.spin_cooldown_hours} onChange={(e) => setSpin((p) => ({ ...p, spin_cooldown_hours: Number(e.target.value) }))} />
          </div>
        </div>
        <Button onClick={saveSpin} disabled={savingSpin} variant="outline">{savingSpin ? "Saving…" : "Save spin settings"}</Button>
      </Card>

      {/* Recent gifts */}
      <Card className="p-5 border-primary/20">
        <h3 className="font-bold mb-3">Recent Gifts</h3>
        <div className="space-y-2">
          {recent.length === 0 && <p className="text-sm text-muted-foreground">No gifts sent yet.</p>}
          {recent.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2">
              <div className="min-w-0">
                <span className="font-semibold">{g.profiles?.full_name ?? "User"}</span>
                <span className="text-muted-foreground"> · {Number(g.amount).toLocaleString()} tokens</span>
                {g.message && <div className="text-[11px] text-muted-foreground truncate">{g.message}</div>}
              </div>
              <Badge variant="outline" className={g.status === "claimed" ? "border-emerald-500/50 text-emerald-300" : "border-amber-500/50 text-amber-300"}>{g.status}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}