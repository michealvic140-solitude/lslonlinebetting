import { useEffect, useState } from "react";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Ticket, X, Trash2, Coins, CheckCircle2, Copy, Share2, ExternalLink, Gem, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DraggableFab } from "@/components/DraggableFab";

export function BetSlipFab() {
  const { selections, open, setOpen } = useBetSlip();
  const { user } = useAuth();
  if (!user || selections.length === 0) return (
    <FabShell onClick={() => setOpen(true)} count={selections.length} />
  );
  return (
    <>
      <FabShell onClick={() => setOpen(true)} count={selections.length} />
      <BetSlipDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function FabShell({ onClick, count }: { onClick: () => void; count: number }) {
  if (count === 0) return null;
  return (
    <DraggableFab
      storageKey="lsl-betslip-fab-pos"
      defaultSide="right"
      ariaLabel="Open bet slip"
      onClick={onClick}
      className="overflow-hidden rounded-2xl border border-primary/40 bg-gradient-luxury text-foreground shadow-luxury backdrop-blur-2xl hover:-translate-y-1 transition min-w-44"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-gold" />
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="h-10 w-10 rounded-xl bg-gradient-gold text-primary-foreground grid place-items-center shadow-gold"><Ticket className="h-5 w-5" /></span>
        <span className="text-left leading-tight">
          <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">Ready slip</span>
          <span className="block font-extrabold">{count} selection{count === 1 ? "" : "s"}</span>
        </span>
        <span className="ml-auto h-7 min-w-7 rounded-full bg-accent/20 text-accent border border-accent/30 text-xs font-black grid place-items-center px-2">{count}</span>
      </div>
    </DraggableFab>
  );
}

function BetSlipDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { selections, remove, clear, totalOdds, stake, setStake } = useBetSlip();
  const { user, profile, refresh } = useAuth();
  const [realMinStake, setRealMinStake] = useState(2_000_000);
  const [realMaxPayout, setRealMaxPayout] = useState(100_000_000);
  const [virtMinStake, setVirtMinStake] = useState(100_000);
  const [virtMaxPayout, setVirtMaxPayout] = useState(100_000_000);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<any>(null);
  const confirm = useConfirm();
  const nav = useNavigate();

  useEffect(() => {
    supabase.from("app_settings").select("min_stake,max_payout,virtual_min_stake,virtual_max_payout").eq("id", 1).maybeSingle()
      .then(({ data }) => {
        if (data?.min_stake) setRealMinStake(Number(data.min_stake));
        if ((data as any)?.max_payout) setRealMaxPayout(Number((data as any).max_payout));
        if ((data as any)?.virtual_min_stake) setVirtMinStake(Number((data as any).virtual_min_stake));
        if ((data as any)?.virtual_max_payout) setVirtMaxPayout(Number((data as any).virtual_max_payout));
      });
  }, [open]);

  const isVirtualTicket = selections.length > 0 && selections.every((s) => s.is_virtual);
  const isMixedTicket = selections.some((s) => s.is_virtual) && selections.some((s) => !s.is_virtual);
  const minStake = isVirtualTicket ? virtMinStake : realMinStake;
  const maxPayout = isVirtualTicket ? virtMaxPayout : realMaxPayout;
  const rawPayout = Math.floor(stake * totalOdds);
  const payout = Math.min(rawPayout, maxPayout);
  const capped = rawPayout > maxPayout;

  async function place() {
    if (!user || !profile) { nav({ to: "/login" }); return; }
    if (selections.length === 0) return;
    if (isMixedTicket) {
      toast.error("Virtual and real match selections must be placed on separate slips.");
      return;
    }
    if (!isVirtualTicket && selections.length < 2) {
      toast.error(`Add at least 2 selections to place a bet (you have ${selections.length}).`);
      return;
    }
    if (profile.is_restricted) { toast.error("Your account is restricted from betting."); return; }
    if (stake < minStake) { toast.error(`Minimum stake is ${minStake.toLocaleString()} tokens`); return; }
    if (stake > (profile.token_balance ?? 0)) { toast.error("Insufficient balance"); return; }

    const ok = await confirm({
      title: "Confirm bet placement",
      description: `Stake ${stake.toLocaleString()} on ${selections.length} selection(s) at total odds ${totalOdds.toFixed(2)}. Potential payout: ${payout.toLocaleString()} tokens${capped ? ` (capped at max ${maxPayout.toLocaleString()})` : ""}. Tokens will be deducted immediately.`,
      confirmText: "Place Bet",
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      if (isVirtualTicket) {
        const { data: placedVirtual, error } = await (supabase as any).rpc("place_virtual_ticket", {
          _selections: selections.map((s) => ({ odd_id: s.odd_id })),
          _stake: stake,
        });
        if (error) throw error;
        const betId = placedVirtual?.bet_id;
        const { data: freshBet } = betId
          ? await supabase.from("bets").select("*").eq("id", betId).maybeSingle()
          : { data: null } as any;
        toast.success(`Virtual ticket placed! ${placedVirtual?.tracking_id ?? ""}`);
        const snapshot = { ...(freshBet ?? placedVirtual), id: betId, _selections: selections, _payout: placedVirtual?.payout ?? payout, _is_virtual: true };
        clear(); refresh();
        setPlaced(snapshot);
        return;
      }
      const { data: bet, error: be } = await supabase.from("bets").insert({
        user_id: user.id, stake, total_odds: totalOdds, potential_payout: payout, status: "open",
      }).select().single();
      if (be) throw be;
      const rows = selections.map((s) => ({
        bet_id: bet.id, match_id: s.match_id, market_id: s.market_id, odd_id: s.odd_id,
        locked_odds: s.odds, selection_label: s.selection_label,
      }));
      const { error: se } = await supabase.from("bet_selections").insert(rows);
      if (se) {
        // rollback bet so we don't leave an orphan
        await supabase.from("bets").delete().eq("id", bet.id);
        throw se;
      }
      // deduct tokens
      await supabase.from("profiles").update({ token_balance: (profile.token_balance ?? 0) - stake }).eq("id", user.id);
      await supabase.from("notifications").insert({ user_id: user.id, title: "Bet placed", body: `Ticket ${bet.tracking_id} · ${stake.toLocaleString()} tokens staked.`, link: `/ticket/${bet.id}` });
      toast.success(`Bet placed! Ticket ${bet.tracking_id}`);
      const snapshot = { ...bet, _selections: selections, _payout: payout, _is_virtual: false };
      clear(); refresh();
      setPlaced(snapshot);
    } catch (e: any) {
      toast.error(e.message || "Failed to place bet");
    } finally { setSubmitting(false); }
  }

  function closeAll() { setPlaced(null); onClose(); }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && closeAll()}>
      <SheetContent side="right" className="w-full sm:max-w-md h-[100dvh] max-h-[100dvh] backdrop-blur-2xl bg-card/90 border-l-primary/30 p-0 overflow-y-auto">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-gold" />
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 px-6 pt-6">
            <span className="h-11 w-11 rounded-2xl bg-gradient-gold text-primary-foreground grid place-items-center shadow-gold">
              {placed ? <CheckCircle2 className="h-5 w-5" /> : <Ticket className="h-5 w-5" />}
            </span>
            <span className="leading-tight">
              <span className="block text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{isVirtualTicket ? "Virtual ticket desk" : "Real match ticket desk"}</span>
              <span className="block text-2xl gradient-gold-text">{placed ? "Ticket Placed" : "Bet Slip"}</span>
            </span>
          </SheetTitle>
        </SheetHeader>

        {placed ? (
          <PlacedPreview bet={placed} onView={() => { closeAll(); nav({ to: "/ticket/$id", params: { id: placed.id } }); }} onClose={closeAll} />
        ) : (
        <div className="flex min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="px-6 mt-4 space-y-3 max-h-none overflow-visible pr-4">
          {selections.length === 0 && <p className="text-sm text-muted-foreground">No selections yet. Tap odds on a match to add.</p>}
          {selections.map((s) => (
            <Card key={s.odd_id} className="relative overflow-hidden glass p-3 text-sm border-primary/20">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-gold opacity-70" />
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold truncate">{s.match_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.market_name}</div>
                  <Badge variant="outline" className="mt-2 border-accent/40 text-accent bg-accent/10 text-[10px]">{s.selection_label}</Badge>
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Odds</div>
                  <div className="font-mono font-black text-primary text-lg">{s.odds.toFixed(2)}</div>
                  <button onClick={() => remove(s.odd_id)} className="text-destructive"><X className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {selections.length > 0 && (
          <div className="sticky bottom-0 mt-4 space-y-4 border-t border-border px-6 py-5 bg-background/90 backdrop-blur-xl shadow-luxury">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Card className="glass p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total odds</div>
                <div className="font-black text-2xl gradient-gold-text">{totalOdds.toFixed(2)}</div>
              </Card>
              <Card className="glass p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Selections</div>
                <div className="font-black text-2xl text-accent">{selections.length}</div>
              </Card>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Stake (min {minStake.toLocaleString()})</label>
              <Input className="mt-1 h-12 text-lg font-bold" type="number" min={minStake} step={100000} value={stake} onChange={(e) => setStake(Number(e.target.value))} />
              <div className="flex flex-wrap gap-1 mt-1">
                {[minStake, minStake*2, minStake*5, profile?.token_balance ?? 0].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                  <button key={v} onClick={() => setStake(v)} className="text-[10px] px-2.5 py-1 rounded-full bg-muted hover:bg-primary/20 border border-border">{v === (profile?.token_balance ?? 0) ? "MAX" : v.toLocaleString()}</button>
                ))}
              </div>
            </div>
            <Card className="relative overflow-hidden glass p-4 flex items-center justify-between border-accent/30">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Gem className="h-3 w-3 text-primary" />Potential payout</div>
                <div className="font-black text-2xl text-accent flex items-center gap-1"><Coins className="h-5 w-5" />{payout.toLocaleString()}</div>
              </div>
              <ShieldCheck className="h-8 w-8 text-primary/50" />
            </Card>
            {capped && (
              <p className="text-[10px] text-amber-400 text-center">
                Payout capped at the maximum of {maxPayout.toLocaleString()} tokens (uncapped: {rawPayout.toLocaleString()}).
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={clear} className="flex-1"><Trash2 className="h-4 w-4 mr-1" />Clear</Button>
              <Button className="btn-luxury flex-1" disabled={submitting || selections.length < 2} onClick={place}>{submitting ? "Placing…" : `Place Bet${selections.length < 2 ? ` (need ${2 - selections.length} more)` : ""}`}</Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Minimum 2 selections required. Tokens are deducted on placement. Cash-out available only after the match ends and your bet wins.</p>
          </div>
        )}
        </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PlacedPreview({ bet, onView, onClose }: { bet: any; onView: () => void; onClose: () => void }) {
  const sels = bet._selections ?? [];
  function copy(t: string) { navigator.clipboard.writeText(t); toast.success("Copied"); }
  async function share() {
    const url = `${window.location.origin}/?code=${bet.booking_code}`;
    if (navigator.share) { try { await navigator.share({ title: `LSL Booking ${bet.booking_code}`, url }); return; } catch {/*ignore*/} }
    navigator.clipboard.writeText(url); toast.success("Share link copied");
  }
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
        <div className="text-sm text-muted-foreground">Your bet has been booked</div>
        <div className="font-extrabold text-lg gradient-gold-text mt-1">{bet.tracking_id}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/40 p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Booking Code</div>
          <button onClick={() => copy(bet.booking_code)} className="font-mono font-bold text-base inline-flex items-center gap-1 hover:text-primary">{bet.booking_code}<Copy className="h-3 w-3" /></button>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Stake</div>
          <div className="font-bold">{Number(bet.stake).toLocaleString()}</div>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Total Odds</div>
          <div className="font-bold text-primary">{Number(bet.total_odds).toFixed(2)}</div>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Potential Payout</div>
          <div className="font-bold text-accent">{Number(bet._payout ?? bet.potential_payout).toLocaleString()}</div>
        </div>
        <div className="rounded-xl bg-muted/40 p-3 col-span-2">
          <div className="text-[10px] uppercase text-muted-foreground">Voucher Type</div>
          <div className="font-bold">{bet._is_virtual ? "Virtual matches" : "Real matches"}</div>
        </div>
      </div>
      <div className="space-y-2 max-h-[28vh] overflow-y-auto pr-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Selections ({sels.length})</div>
        {sels.map((s: any) => (
          <div key={s.odd_id} className="rounded-lg border border-border bg-background/40 p-2 text-xs">
            <div className="font-bold truncate">{s.match_name}</div>
            <div className="text-muted-foreground truncate">{s.market_name} · {s.selection_label} <span className="text-primary font-mono ml-1">{Number(s.odds).toFixed(2)}</span></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={share}><Share2 className="h-4 w-4 mr-1" />Share</Button>
        <Button className="btn-luxury" onClick={onView}><ExternalLink className="h-4 w-4 mr-1" />View Ticket</Button>
      </div>
      <Button variant="ghost" className="w-full" onClick={onClose}>Close</Button>
    </div>
  );
}
