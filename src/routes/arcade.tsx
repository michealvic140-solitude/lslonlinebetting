import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Coins, Gamepad2, Sparkles, CircleDollarSign } from "lucide-react";

export const Route = createFileRoute("/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — Coin Flip, Wheel & Scratch Cards | LSL" },
      { name: "description", content: "Play LSL arcade games: flip a coin, spin the wheel of fortune and reveal scratch cards to multiply your tokens." },
      { property: "og:title", content: "LSL Arcade" },
      { property: "og:description", content: "Coin flip, wheel of fortune and scratch cards." },
    ],
  }),
  component: ArcadePage,
});

function ArcadePage() {
  const { user, profile, refresh } = useAuth();
  const [s, setS] = useState<any>(null);

  async function load() {
    const { data } = await (supabase as any).from("app_settings")
      .select("coinflip_enabled,coinflip_min,coinflip_max,coinflip_payout,wheel_enabled,wheel_min,wheel_max,scratch_enabled,scratch_price")
      .eq("id", 1).maybeSingle();
    setS(data ?? {});
  }
  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <div className="relative overflow-hidden rounded-3xl p-8 mb-8 border border-primary/30 bg-gradient-to-br from-fuchsia-500/10 via-background to-background">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-fuchsia-400/20 blur-3xl" />
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-gold grid place-items-center shadow-gold"><Gamepad2 className="h-7 w-7 text-background" /></div>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold gradient-gold-text">Arcade</h1>
              <p className="text-sm text-muted-foreground">Quick games of chance. Win big, instantly.</p>
            </div>
          </div>
          {user && <p className="text-xs text-muted-foreground mt-3">Balance: <span className="text-primary font-bold">{profile?.token_balance?.toLocaleString() ?? 0}</span> tokens</p>}
        </div>

        {!user && <Card className="p-8 text-center"><p>Please <Link to="/login" className="text-primary underline">sign in</Link> to play.</p></Card>}

        {user && s && (
          <Tabs defaultValue="coinflip">
            <TabsList className="grid grid-cols-3 max-w-md mb-6">
              <TabsTrigger value="coinflip">Coin Flip</TabsTrigger>
              <TabsTrigger value="wheel">Wheel</TabsTrigger>
              <TabsTrigger value="scratch">Scratch</TabsTrigger>
            </TabsList>
            <TabsContent value="coinflip"><CoinFlip s={s} onDone={() => { refresh(); }} /></TabsContent>
            <TabsContent value="wheel"><Wheel s={s} onDone={() => { refresh(); }} /></TabsContent>
            <TabsContent value="scratch"><Scratch s={s} onDone={() => { refresh(); }} /></TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}

function CoinFlip({ s, onDone }: { s: any; onDone: () => void }) {
  const min = Number(s.coinflip_min ?? 100000);
  const [choice, setChoice] = useState<"heads" | "tails">("heads");
  const [stake, setStake] = useState(min);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  if (!s.coinflip_enabled) return <Card className="p-8 text-center text-muted-foreground">Coin flip is currently closed.</Card>;

  async function play() {
    setBusy(true); setLast(null);
    const { data, error } = await (supabase.rpc as any)("play_coinflip", { _choice: choice, _stake: stake });
    setBusy(false);
    if (error) return toast.error(error.message);
    setLast(data);
    if (data.payout > 0) toast.success(`It's ${data.outcome}! You won ${Number(data.payout).toLocaleString()} tokens 🎉`);
    else toast.error(`It's ${data.outcome}. Better luck next time.`);
    onDone();
  }
  return (
    <Card className="p-6 max-w-md mx-auto border-primary/30 text-center space-y-4">
      <div className="text-6xl">{last ? (last.outcome === "heads" ? "🪙" : "🌝") : "🪙"}</div>
      <div className="flex gap-2 justify-center">
        {(["heads", "tails"] as const).map((c) => (
          <Button key={c} variant={choice === c ? "default" : "outline"} onClick={() => setChoice(c)} className="capitalize w-28">{c}</Button>
        ))}
      </div>
      <Input type="number" value={stake} min={min} onChange={(e) => setStake(Number(e.target.value))} />
      <div className="text-xs text-muted-foreground">Win pays <span className="text-emerald-300 font-bold">{(stake * Number(s.coinflip_payout ?? 1.95)).toLocaleString()}</span> ({Number(s.coinflip_payout ?? 1.95)}x)</div>
      <Button className="btn-luxury w-full" onClick={play} disabled={busy}>{busy ? "Flipping…" : "Flip Coin"}</Button>
      {last && <Badge variant="outline" className={last.payout > 0 ? "border-emerald-500/50 text-emerald-300" : "border-destructive/50 text-destructive"}>{last.payout > 0 ? `WON ${Number(last.payout).toLocaleString()}` : "LOST"}</Badge>}
    </Card>
  );
}

function Wheel({ s, onDone }: { s: any; onDone: () => void }) {
  const min = Number(s.wheel_min ?? 100000);
  const [stake, setStake] = useState(min);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  if (!s.wheel_enabled) return <Card className="p-8 text-center text-muted-foreground">The wheel is currently closed.</Card>;
  async function play() {
    setBusy(true); setLast(null);
    const { data, error } = await (supabase.rpc as any)("play_wheel", { _stake: stake });
    setBusy(false);
    if (error) return toast.error(error.message);
    setLast(data);
    if (data.payout > 0) toast.success(`Landed on ${data.outcome}! Won ${Number(data.payout).toLocaleString()} 🎉`);
    else toast.error(`Landed on ${data.outcome}. No win this time.`);
    onDone();
  }
  return (
    <Card className="p-6 max-w-md mx-auto border-primary/30 text-center space-y-4">
      <div className={`text-6xl transition-transform ${busy ? "animate-spin" : ""}`}>🎡</div>
      <div className="text-xs text-muted-foreground">Multipliers: 0x · 0.5x · 1.2x · 1.5x · 2x · 3x · 5x</div>
      <Input type="number" value={stake} min={min} onChange={(e) => setStake(Number(e.target.value))} />
      <Button className="btn-luxury w-full" onClick={play} disabled={busy}>{busy ? "Spinning…" : "Spin the Wheel"}</Button>
      {last && <Badge variant="outline" className={last.payout > 0 ? "border-emerald-500/50 text-emerald-300" : "border-destructive/50 text-destructive"}>{last.outcome} · {last.payout > 0 ? `WON ${Number(last.payout).toLocaleString()}` : "NO WIN"}</Badge>}
    </Card>
  );
}

function Scratch({ s, onDone }: { s: any; onDone: () => void }) {
  const price = Number(s.scratch_price ?? 500000);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  if (!s.scratch_enabled) return <Card className="p-8 text-center text-muted-foreground">Scratch cards are currently closed.</Card>;
  async function play() {
    setBusy(true); setLast(null);
    const { data, error } = await (supabase.rpc as any)("play_scratch", {});
    setBusy(false);
    if (error) return toast.error(error.message);
    setLast(data);
    if (data.payout > 0) toast.success(`You revealed ${data.outcome}! Won ${Number(data.payout).toLocaleString()} 🎉`);
    else toast.error(`No prize this card. Try again!`);
    onDone();
  }
  return (
    <Card className="p-6 max-w-md mx-auto border-primary/30 text-center space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-amber-500/10 to-fuchsia-500/10 p-8">
        <div className="text-5xl mb-2">{last ? (last.payout > 0 ? "💎" : "🃏") : "🎫"}</div>
        <div className="text-sm font-bold">{last ? (last.payout > 0 ? `${last.outcome} — ${Number(last.payout).toLocaleString()} tokens!` : "No prize") : "Buy a card to reveal your prize"}</div>
      </div>
      <div className="text-xs text-muted-foreground">Card price: <span className="text-primary font-bold">{price.toLocaleString()}</span> tokens · prizes up to 10x</div>
      <Button className="btn-luxury w-full" onClick={play} disabled={busy}><CircleDollarSign className="h-4 w-4 mr-1" />{busy ? "Revealing…" : "Buy & Scratch"}</Button>
    </Card>
  );
}