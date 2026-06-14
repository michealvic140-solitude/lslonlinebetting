import { supabase } from "@/integrations/supabase/client";

export type LbRow = {
  name: string;
  top_player?: string;
  gang_faction?: string;
  TS: number;
  W: number;
  L: number;
  D: number;
  P: number;
  PTS: number;
  manual_rank?: number | null;
  override_id?: string | null;
  is_override?: boolean;
};

export type Standings = { gangs: LbRow[]; shooters: LbRow[] };

export function sortRows(a: LbRow, b: LbRow) {
  if (a.manual_rank != null && b.manual_rank != null) return a.manual_rank - b.manual_rank;
  if (a.manual_rank != null) return -1;
  if (b.manual_rank != null) return 1;
  return b.PTS - a.PTS || b.W - a.W || b.TS - a.TS;
}

/** Single source of truth for the leaderboard — used by the public page AND the admin editor. */
export async function loadStandings(): Promise<Standings> {
  const { data: settings } = await supabase
    .from("app_settings")
    .select("leaderboard_gangs_reset_at, leaderboard_shooters_reset_at")
    .eq("id", 1)
    .maybeSingle();
  const gangsReset = (settings as any)?.leaderboard_gangs_reset_at ? new Date((settings as any).leaderboard_gangs_reset_at).getTime() : 0;
  const shootersReset = (settings as any)?.leaderboard_shooters_reset_at ? new Date((settings as any).leaderboard_shooters_reset_at).getTime() : 0;

  const { data: matches } = await supabase
    .from("matches")
    .select("home_team_id,away_team_id,home_player_id,away_player_id,home_score,away_score,winner_team_id,status,is_virtual,match_kind,settled_at,created_at,home_present,away_present")
    .eq("status", "ended")
    .eq("is_virtual", false);
  const { data: teams } = await supabase.from("teams").select("id,name");
  const { data: players } = await supabase.from("players").select("id,name,team_id");
  const { data: overrides } = await supabase.from("leaderboard_overrides").select("*");

  const teamMap = new Map<string, string>(); (teams ?? []).forEach((t) => teamMap.set(t.id, t.name));
  const playerMap = new Map<string, any>(); (players ?? []).forEach((p) => playerMap.set(p.id, p));
  const teamPlayers = new Map<string, string[]>();
  (players ?? []).forEach((p) => {
    if (!p.team_id) return;
    const a = teamPlayers.get(p.team_id) ?? [];
    a.push(p.name);
    teamPlayers.set(p.team_id, a);
  });

  const gangAgg = new Map<string, LbRow>();
  const playerAgg = new Map<string, LbRow>();
  (players ?? []).forEach((p) => {
    if (!p.name) return;
    const tname = p.team_id ? (teamMap.get(p.team_id) || "") : "";
    playerAgg.set(p.name, { name: p.name, gang_faction: tname || "—", TS: 0, W: 0, L: 0, D: 0, PTS: 0, P: 0 });
  });

  (matches ?? []).forEach((m: any) => {
    const ts = new Date(m.settled_at ?? m.created_at ?? 0).getTime();
    const countForGangs = ts >= gangsReset;
    const countForShooters = ts >= shootersReset;
    if (!countForGangs && !countForShooters) return;
    if (m.match_kind === "future") return;
    // Strict: a side only counts toward the leaderboard when explicitly marked Present.
    const homePresent = m.home_present === true;
    const awayPresent = m.away_present === true;

    if (m.match_kind === "shooter") {
      if (!countForShooters) return;
      const draw = Number(m.home_score ?? 0) === Number(m.away_score ?? 0);
      const winnerPlayerId = draw ? null : Number(m.home_score ?? 0) > Number(m.away_score ?? 0) ? m.home_player_id : m.away_player_id;
      const sides: Array<[string | null, boolean, number]> = [
        [m.home_player_id, homePresent, Number(m.home_score ?? 0)],
        [m.away_player_id, awayPresent, Number(m.away_score ?? 0)],
      ];
      for (const [pid, present, kills] of sides) {
        if (!present) continue;
        const pl = pid ? playerMap.get(pid) : null;
        if (!pl?.name) continue;
        const tname = pl.team_id ? (teamMap.get(pl.team_id) || "—") : "—";
        const pc = playerAgg.get(pl.name) ?? { name: pl.name, gang_faction: tname, TS: 0, W: 0, L: 0, D: 0, PTS: 0, P: 0 };
        pc.gang_faction = tname;
        pc.P += 1;
        pc.TS += kills; // total kills scored in this match
        if (draw) { pc.D += 1; pc.PTS += 1; }
        else if (winnerPlayerId === pid) { pc.W += 1; pc.PTS += 3; }
        else { pc.L += 1; }
        playerAgg.set(pl.name, pc);
      }
      return;
    }

    const sides: Array<["home" | "away", boolean, number]> = [
      ["home", homePresent, Number(m.home_score ?? 0)],
      ["away", awayPresent, Number(m.away_score ?? 0)],
    ];
    for (const [side, present, teamScore] of sides) {
      if (!present) continue;
      const tid = side === "home" ? m.home_team_id : m.away_team_id;
      const tname = teamMap.get(tid) || "Team";
      const won = m.winner_team_id === tid;
      const draw = m.winner_team_id == null;
      if (countForGangs) {
        const cur = gangAgg.get(tname) ?? { name: tname, top_player: (teamPlayers.get(tid) ?? [])[0], TS: 0, W: 0, L: 0, D: 0, PTS: 0, P: 0 };
        cur.P += 1;
        cur.TS += teamScore; // total kills scored by the gang in this match
        if (draw) { cur.D += 1; cur.PTS += 1; }
        else if (won) { cur.W += 1; cur.PTS += 3; }
        else { cur.L += 1; }
        gangAgg.set(tname, cur);
      }
      if (countForShooters) {
        (teamPlayers.get(tid) ?? []).forEach((pname) => {
          const pc = playerAgg.get(pname) ?? { name: pname, gang_faction: tname, TS: 0, W: 0, L: 0, D: 0, PTS: 0, P: 0 };
          pc.gang_faction = pc.gang_faction || tname;
          pc.P += 1;
          pc.TS += teamScore;
          if (draw) { pc.D += 1; pc.PTS += 1; }
          else if (won) { pc.W += 1; pc.PTS += 3; }
          else { pc.L += 1; }
          playerAgg.set(pname, pc);
        });
      }
    }
  });

  (overrides ?? []).forEach((o: any) => {
    const target = o.kind === "gang" ? gangAgg : playerAgg;
    if (o.is_hidden) { target.delete(o.name); return; }
    const existing = target.get(o.name);
    target.set(o.name, {
      name: o.name,
      top_player: o.top_player ?? existing?.top_player ?? undefined,
      gang_faction: o.top_player ?? existing?.gang_faction,
      TS: o.total_score ?? o.points ?? 0,
      W: o.wins, L: o.losses, D: o.draws, P: o.played, PTS: o.points,
      manual_rank: o.manual_rank,
      override_id: o.id,
      is_override: true,
    });
  });

  return {
    gangs: Array.from(gangAgg.values()).sort(sortRows),
    shooters: Array.from(playerAgg.values()).sort(sortRows),
  };
}
