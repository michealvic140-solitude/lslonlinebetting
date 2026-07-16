import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, X, Swords, Lock, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Ticket } from "lucide-react";

type Kind = "outright" | "reach_final" | "reach_semi" | "reach_quarter" | "eliminated_at" | "match_winner";
type Team = { id: string; name: string | null; logo_url: string | null };
type TMatch = { id: string; round_name: string; participant_a_id: string | null; participant_b_id: string | null; status: string | null };

const ODDS: Record<Kind, number> = {
  outright: 16.0, reach_final: 4.0, reach_semi: 2.0, reach_quarter: 1.5,
  eliminated_at: 4.0, match_winner: 1.9,
};

export function ChampionshipBetPanel({
  tournamentId,
  teamIds,
  currentStage,
  status,
}: {
  tournamentId: string;
  teamIds: string[];
  currentStage: string | null;
  status?: string | null;
}) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [tab, setTab] = useState<Kind>("outright");
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [liveMatches, setLiveMatches] = useState<TMatch[]>([]);
  const [existing, setExisting] = useState<{ id: string; kind: string; stake: number; odds: number } | null>(null);
  const [voucherBetId, setVoucherBetId] = useState<string | null>(null);

  const canBook = status === "booking" && !existing;

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("championship_bets")
        .select("id,kind,stake,odds")
        .eq("user_id", user.id).eq("tournament_id", tournamentId)
        .maybeSingle();
      setExisting((data ?? null) as any);
      if (data?.id) {
        const { data: v } = await (supabase as any)
          .from("bets")
          .select("id")
          .eq("championship_bet_id", data.id)
          .eq("user_id", user.id)
          .maybeSingle();
        setVoucherBetId(v?.id ?? null);
      } else {
        setVoucherBetId(null);
      }
    })();
  }, [user?.id, tournamentId]);

  useEffect(() => {
    if (!teamIds.length) return;
    (async () => {
      const { data } = await (supabase as any).from("teams").select("id,name,logo_url").in("id", teamIds);
      setTeams(Object.fromEntries(((data ?? []) as Team[]).map((t) => [t.id, t])));
    })();
  }, [teamIds.join(",")]);

  useEffect(() => {
    if (!currentStage) return;
    const load = async () => {
      const { data } = await (supabase as any)
        .from("tournament_matches")
        .select("id,round_name,participant_a_id,participant_b_id,status")
        .eq("tournament_id", tournamentId)
        .eq("round_name", currentStage)
        .eq("status", "pending");
      setLiveMatches((data ?? []) as TMatch[]);
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [tournamentId, currentStage]);

  const place = async (params: { kind: Kind; team_id?: string; stage?: string; match_id?: string }) => {
    if (!user) return toast.error("Sign in to bet");
    if (!canBook) return toast.error("Booking is closed for this championship");
    if (stake <= 0) return toast.error("Enter a stake");
    setBusy(true);
    const { error } = await (supabase as any).rpc("place_championship_bet", {
      p_tournament: tournamentId,
      p_kind: params.kind,
      p_team: params.team_id ?? null,
      p_stage: params.stage ?? null,
      p_match: params.match_id ?? null,
      p_stake: stake,
      p_odds: ODDS[params.kind],
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Bet staked · potential ${(stake * ODDS[params.kind]).toFixed(0)} ECB`);
    setExisting({ id: "new", kind: params.kind, stake, odds: ODDS[params.kind] });
    // Fetch voucher shortly after so "View voucher" appears.
    setTimeout(async () => {
      const { data: cb } = await (supabase as any).from("championship_bets").select("id").eq("user_id", user!.id).eq("tournament_id", tournamentId).maybeSingle();
      if (cb?.id) {
        const { data: v } = await (supabase as any).from("bets").select("id").eq("championship_bet_id", cb.id).maybeSingle();
        if (v?.id) setVoucherBetId(v.id);
      }
    }, 250);
  };

  const cancelPick = async () => {
    if (!existing) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("cancel_championship_bet", { p_tournament: tournamentId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Pick cancelled · stake refunded");
    setExisting(null);
    setVoucherBetId(null);
  };

  const teamList = useMemo(() => teamIds.map((id) => teams[id]).filter(Boolean) as Team[], [teamIds, teams]);

  if (existing && status === "booking") {
    return (
      <Card className="glass p-4 border-emerald-500/40 space-y-3">
        <div className="flex items-center gap-2 text-emerald-300 font-black">
          <CheckCircle2 className="h-4 w-4" /> Your championship pick is in
        </div>
        <div className="text-xs text-muted-foreground">
          Stake <span className="text-foreground font-bold">{existing.stake} ECB</span> · potential payout{" "}
          <span className="text-amber-300 font-bold">{(existing.stake * existing.odds).toFixed(0)} ECB</span>.
          Change or remove your pick anytime while booking is open.
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={busy} onClick={cancelPick} className="border-primary/40">
            <Pencil className="h-3 w-3 mr-1" /> Change pick
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={cancelPick}>
            <Trash2 className="h-3 w-3 mr-1" /> Cancel bet
          </Button>
          {voucherBetId && (
            <Link to="/ticket/$id" params={{ id: voucherBetId }}>
              <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-300"><Ticket className="h-3 w-3 mr-1"/>View voucher</Button>
            </Link>
          )}
        </div>
      </Card>
    );
  }

  if (existing) {
    return (
      <Card className="glass p-4 border-emerald-500/40 space-y-2">
        <div className="flex items-center gap-2 text-emerald-300 font-black">
          <Lock className="h-4 w-4" /> Pick locked · booking closed
        </div>
        <div className="text-xs text-muted-foreground">
          Potential payout <span className="text-amber-300 font-bold">{(existing.stake * existing.odds).toFixed(0)} ECB</span> if it lands.
        </div>
        {voucherBetId && (
          <Link to="/ticket/$id" params={{ id: voucherBetId }}>
            <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-300 mt-1"><Ticket className="h-3 w-3 mr-1"/>View bet voucher</Button>
          </Link>
        )}
      </Card>
    );
  }

  if (status !== "booking") {
    return (
      <Card className="glass p-4 border-muted/40 text-center text-muted-foreground text-sm space-y-1">
        <Lock className="h-5 w-5 mx-auto opacity-60" />
        Booking is closed — the tournament is live. Wait for the next championship to open booking.
      </Card>
    );
  }

  return (
    <Card className="glass p-4 border-primary/30 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-black flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /> Championship Markets <span className="text-[10px] text-amber-300 font-bold uppercase tracking-widest">· One bet per tournament</span></div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Stake</span>
          <Input type="number" min={1} value={stake} onChange={(e) => setStake(Number(e.target.value) || 0)} className="h-8 w-24" />
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList className="grid grid-cols-4 h-auto">
          <TabsTrigger value="outright" className="text-[10px]">Champion</TabsTrigger>
          <TabsTrigger value="reach_final" className="text-[10px]">Reach stage</TabsTrigger>
          <TabsTrigger value="eliminated_at" className="text-[10px]">Eliminated at</TabsTrigger>
          <TabsTrigger value="match_winner" className="text-[10px]">Per-match</TabsTrigger>
        </TabsList>

        <TabsContent value="outright" className="grid grid-cols-2 gap-2 mt-3 max-h-72 overflow-auto">
          {teamList.map((t) => (
            <BetBtn key={t.id} icon={<Trophy className="h-3 w-3" />} label={t.name ?? "—"} odds={ODDS.outright} disabled={busy}
              onClick={() => place({ kind: "outright", team_id: t.id })} />
          ))}
          {teamList.length === 0 && <div className="col-span-2 text-xs text-muted-foreground py-6 text-center">Teams appear once the bracket is drawn.</div>}
        </TabsContent>

        <TabsContent value="reach_final" className="space-y-3 mt-3">
          <Sub tab={tab === "reach_final"} teams={teamList} kind="reach_final" busy={busy} place={place} stage="F" />
          <Sub tab={tab === "reach_final"} teams={teamList} kind="reach_semi" busy={busy} place={place} stage="SF" title="Reach Semifinal" />
          <Sub tab={tab === "reach_final"} teams={teamList} kind="reach_quarter" busy={busy} place={place} stage="QF" title="Reach Quarterfinal" />
        </TabsContent>

        <TabsContent value="eliminated_at" className="space-y-3 mt-3">
          {["R16","QF","SF","F"].map((s) => (
            <div key={s}>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Eliminated at {s}</div>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto">
                {teamList.map((t) => (
                  <BetBtn key={t.id + s} icon={<X className="h-3 w-3" />} label={t.name ?? "—"} odds={ODDS.eliminated_at} disabled={busy}
                    onClick={() => place({ kind: "eliminated_at", team_id: t.id, stage: s })} />
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="match_winner" className="space-y-2 mt-3">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Current stage: {currentStage ?? "—"}</div>
          {liveMatches.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">No open matches right now.</div>
          ) : liveMatches.map((m) => {
            const a = m.participant_a_id ? teams[m.participant_a_id] : null;
            const b = m.participant_b_id ? teams[m.participant_b_id] : null;
            return (
              <div key={m.id} className="flex items-center gap-2">
                <BetBtn icon={<Swords className="h-3 w-3" />} label={a?.name ?? "A"} odds={ODDS.match_winner} disabled={busy}
                  onClick={() => place({ kind: "match_winner", team_id: a?.id, match_id: m.id })} />
                <BetBtn icon={<Swords className="h-3 w-3" />} label={b?.name ?? "B"} odds={ODDS.match_winner} disabled={busy}
                  onClick={() => place({ kind: "match_winner", team_id: b?.id, match_id: m.id })} />
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function Sub({ teams, kind, busy, place, stage, title, tab }: {
  teams: Team[]; kind: Kind; busy: boolean;
  place: (p: { kind: Kind; team_id?: string; stage?: string; match_id?: string }) => void;
  stage: string; title?: string; tab: boolean;
}) {
  if (!tab) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{title ?? "Reach Final"}</div>
      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto">
        {teams.map((t) => (
          <BetBtn key={t.id + stage + kind} icon={<Target className="h-3 w-3" />} label={t.name ?? "—"} odds={ODDS[kind]} disabled={busy}
            onClick={() => place({ kind, team_id: t.id, stage })} />
        ))}
      </div>
    </div>
  );
}

function BetBtn({ icon, label, odds, disabled, onClick }: { icon: React.ReactNode; label: string; odds: number; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="justify-between h-auto py-2 border-primary/20 hover:border-primary/60 hover:bg-primary/10"
    >
      <span className="flex items-center gap-1.5 min-w-0 truncate">{icon}<span className="truncate">{label}</span></span>
      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px] font-black shrink-0">{odds.toFixed(2)}x</Badge>
    </Button>
  );
}