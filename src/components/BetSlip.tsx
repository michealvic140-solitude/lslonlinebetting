import { useEffect, useState } from "react";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Ticket, X, ChevronUp, ChevronDown, Trash2, Coins, CheckCircle2, Copy, Share2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

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
    <button onClick={onClick}
      className="fixed bottom-24 md:bottom-6 right-4 z-40 h-14 px-5 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-2xl flex items-center gap-2 font-bold backdrop-blur-xl border border-primary/30 hover:scale-105 transition">
      <Ticket className="h-5 w-5" />
      <span>Bet Slip</span>
      <span className="bg-background/30 text-xs rounded-full h-6 min-w-6 px-2 grid place-items-center">{count}</span>
    </button>
  );
}

function BetSlipDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { selections, remove, clear, reorder, totalOdds, stake, setStake } = useBetSlip();
  const { user, profile, refresh } = useAuth();
  const [minStake, setMinStake] = useState(2_000_000);
  const [maxPayout, setMaxPayout] = useState(100_000_000);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<any>(null);
  const confirm = useConfirm();
  const nav = useNavigate();

  useEffect(() => {
    supabase.from("app_settings").select("min_stake,max_payout").eq("id", 1).maybeSingle()
      .then(({ data }) => {
        if (data?.min_stake) setMinStake(Number(data.min_stake));
        if ((data as any)?.max_payout) setMaxPayout(Number((data as any).max_payout));
      });
  }, [open]);

  const rawPayout = Math.floor(stake * totalOdds);
  const payout = Math.min(rawPayout, maxPayout);
  const capped = rawPayout > maxPayout;

  async function place() {
    if (!user || !profile) { nav({ to: "/login" }); return; }
    if (selections.length === 0) return;
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
      const snapshot = { ...bet, _selections: selections, _payout: payout };
      clear(); refresh();
      setPlaced(snapshot);
    } catch (e: any) {
      toast.error(e.message || "Failed to place bet");
    } finally { setSubmitting(false); }
  }

  function closeAll() { setPlaced(null); onClose(); }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && closeAll()}>
      <SheetContent side="right" className="w-full sm:max-w-md backdrop-blur-2xl bg-card/80 border-l-primary/30">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {placed ? <><CheckCircle2 className="h-5 w-5 text-emerald-400" />Ticket Placed</> : <><Ticket className="h-5 w-5 text-primary" />Bet Slip</>}
          </SheetTitle>
        </SheetHeader>

        {placed ? (
          <PlacedPreview bet={placed} onView={() => { closeAll(); nav({ to: "/ticket/$id", params: { id: placed.id } }); }} onClose={closeAll} />
        ) : (
        <>
        <div className="mt-4 space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {selections.length === 0 && <p className="text-sm text-muted-foreground">No selections yet. Tap odds on a match to add.</p>}
          {selections.map((s, i) => (
            <Card key={s.odd_id} className="glass p-3 text-sm">
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-0.5">
                  <button disabled={i===0} onClick={() => reorder(i, i-1)} className="text-muted-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                  <button disabled={i===selections.length-1} onClick={() => reorder(i, i+1)} className="text-muted-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.match_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.market_name} · {s.selection_label}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-primary">{s.odds.toFixed(2)}</div>
                  <button onClick={() => remove(s.odd_id)} className="text-destructive"><X className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {selections.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total odds</span>
              <span className="font-bold text-primary">{totalOdds.toFixed(2)}</span>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Stake (min {minStake.toLocaleString()})</label>
              <Input type="number" min={minStake} step={100000} value={stake} onChange={(e) => setStake(Number(e.target.value))} />
              <div className="flex flex-wrap gap-1 mt-1">
                {[minStake, minStake*2, minStake*5, profile?.token_balance ?? 0].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                  <button key={v} onClick={() => setStake(v)} className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-primary/20">{v === (profile?.token_balance ?? 0) ? "MAX" : v.toLocaleString()}</button>
                ))}
              </div>
            </div>
            <Card className="glass p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Potential payout</span>
              <span className="font-bold text-accent flex items-center gap-1"><Coins className="h-3 w-3" />{payout.toLocaleString()}</span>
            </Card>
            {capped && (
              <p className="text-[10px] text-amber-400 text-center">
                Payout capped at the maximum of {maxPayout.toLocaleString()} tokens (uncapped: {rawPayout.toLocaleString()}).
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={clear} className="flex-1"><Trash2 className="h-4 w-4 mr-1" />Clear</Button>
              <Button className="btn-luxury flex-1" disabled={submitting} onClick={place}>{submitting ? "Placing…" : "Place Bet"}</Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Tokens are deducted on placement. Cash-out available only after the match ends and your bet wins.</p>
          </div>
        )}
        </>
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
