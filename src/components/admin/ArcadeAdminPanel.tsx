import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Gamepad2, Coins, Disc3, Ticket } from "lucide-react";

type Cfg = {
  coinflip_enabled: boolean; coinflip_min: number; coinflip_max: number; coinflip_payout: number;
  wheel_enabled: boolean; wheel_min: number; wheel_max: number;
  scratch_enabled: boolean; scratch_price: number;
};

export function ArcadeAdminPanel() {
  const [c, setC] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("app_settings")
      .select("coinflip_enabled,coinflip_min,coinflip_max,coinflip_payout,wheel_enabled,wheel_min,wheel_max,scratch_enabled,scratch_price")
      .eq("id", 1).maybeSingle()
      .then(({ data }: any) => setC({
        coinflip_enabled: !!data?.coinflip_enabled, coinflip_min: Number(data?.coinflip_min ?? 100000), coinflip_max: Number(data?.coinflip_max ?? 5000000), coinflip_payout: Number(data?.coinflip_payout ?? 1.95),
        wheel_enabled: !!data?.wheel_enabled, wheel_min: Number(data?.wheel_min ?? 100000), wheel_max: Number(data?.wheel_max ?? 5000000),
        scratch_enabled: !!data?.scratch_enabled, scratch_price: Number(data?.scratch_price ?? 500000),
      }));
  }, []);

  async function save() {
    if (!c) return;
    setSaving(true);
    const { error } = await (supabase as any).from("app_settings").update({ ...c }).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Arcade settings saved");
  }

  if (!c) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const set = (patch: Partial<Cfg>) => setC((p) => ({ ...(p as Cfg), ...patch }));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 font-bold"><Gamepad2 className="h-4 w-4 text-primary" />Arcade Controls</div>

      <Card className="p-4 space-y-3 border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><Coins className="h-4 w-4 text-amber-300" />Coin Flip</div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{c.coinflip_enabled ? "Active" : "Paused"}</span><Switch checked={c.coinflip_enabled} onCheckedChange={(v) => set({ coinflip_enabled: v })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Min stake"><Input type="number" value={c.coinflip_min} onChange={(e) => set({ coinflip_min: Number(e.target.value) })} /></Field>
          <Field label="Max stake"><Input type="number" value={c.coinflip_max} onChange={(e) => set({ coinflip_max: Number(e.target.value) })} /></Field>
          <Field label="Payout (x)"><Input type="number" step="0.05" value={c.coinflip_payout} onChange={(e) => set({ coinflip_payout: Number(e.target.value) })} /></Field>
        </div>
      </Card>

      <Card className="p-4 space-y-3 border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><Disc3 className="h-4 w-4 text-fuchsia-300" />Wheel of Fortune</div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{c.wheel_enabled ? "Active" : "Paused"}</span><Switch checked={c.wheel_enabled} onCheckedChange={(v) => set({ wheel_enabled: v })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min stake"><Input type="number" value={c.wheel_min} onChange={(e) => set({ wheel_min: Number(e.target.value) })} /></Field>
          <Field label="Max stake"><Input type="number" value={c.wheel_max} onChange={(e) => set({ wheel_max: Number(e.target.value) })} /></Field>
        </div>
      </Card>

      <Card className="p-4 space-y-3 border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><Ticket className="h-4 w-4 text-emerald-300" />Scratch Card</div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{c.scratch_enabled ? "Active" : "Paused"}</span><Switch checked={c.scratch_enabled} onCheckedChange={(v) => set({ scratch_enabled: v })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Card price"><Input type="number" value={c.scratch_price} onChange={(e) => set({ scratch_price: Number(e.target.value) })} /></Field>
        </div>
      </Card>

      <Button className="btn-luxury" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save arcade settings"}</Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[10px] uppercase text-muted-foreground block mb-1">{label}</label>{children}</div>;
}