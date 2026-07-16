import { useMemo } from "react";
import { Crown, Target, Trophy, Users, Crosshair, Swords } from "lucide-react";
import { ScaleToFit } from "./ScaleToFit";
import _ecbLogo from "@/assets/ecb-logo.png.asset.json";
const lslLogo = _ecbLogo.url;

export type TParticipant = { id: string; name: string; logo_url: string | null; is_eliminated: boolean; current_round: number; is_disqualified?: boolean };
export type TMatch = {
  id: string; round: number; round_name: string | null; slot: number; label: string | null;
  participant_a_id: string | null; participant_b_id: string | null;
  score_a: number | null; score_b: number | null; winner_id: string | null; status: string;
  match_id?: string | null; result_label?: string | null;
};
export type Tournament = { id: string; name: string; tagline: string | null; event_date: string | null; status: string; champion_id: string | null; futures_match_id?: string | null };

// ---- layout constants (design canvas in px, scaled to fit) ----
const CARD_H = 60;
const GAP_Y = 22;
const COL_W = 200;
const CARD_PAD = 12;
const CHAMP_W = 230;
const HEADER_H = 200;
const FOOTER_H = 190;
const SIDE_PAD = 36;

function roundLabel(playersInRound: number) {
  if (playersInRound <= 2) return { title: "GRAND FINAL", sub: "2 PLAYERS" };
  if (playersInRound <= 4) return { title: "SEMIFINALS", sub: "4 PLAYERS" };
  if (playersInRound <= 8) return { title: "QUARTERFINALS", sub: "8 PLAYERS" };
  if (playersInRound <= 16) return { title: "ROUND OF 16", sub: "16 PLAYERS" };
  return { title: `ROUND OF ${playersInRound}`, sub: `${playersInRound} PLAYERS` };
}

function roundIcon(playersInRound: number) {
  if (playersInRound <= 2) return Trophy;
  if (playersInRound <= 4) return Users;
  if (playersInRound <= 8) return Crosshair;
  if (playersInRound <= 16) return Swords;
  return Users;
}

export function TournamentBracket({
  tournament, participants, matches, onMatchClick,
}: {
  tournament: Tournament;
  participants: Record<string, TParticipant>;
  matches: TMatch[];
  onMatchClick?: (m: TMatch) => void;
}) {
  const layout = useMemo(() => {
    const rounds: TMatch[][] = [];
    const byRound = new Map<number, TMatch[]>();
    for (const m of matches) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m);
    }
    const roundNums = Array.from(byRound.keys()).sort((a, b) => a - b);
    for (const r of roundNums) rounds.push(byRound.get(r)!.sort((a, b) => a.slot - b.slot));

    // y centers per round
    const centers: number[][] = [];
    rounds.forEach((rms, ri) => {
      if (ri === 0) {
        centers.push(rms.map((_, i) => i * (CARD_H + GAP_Y) + CARD_H / 2));
      } else {
        const prev = centers[ri - 1];
        centers.push(
          rms.map((_, j) => {
            const a = prev[2 * j] ?? prev[j] ?? 0;
            const b = prev[2 * j + 1] ?? a;
            return (a + b) / 2;
          }),
        );
      }
    });
    const firstCount = rounds[0]?.length ?? 0;
    const bracketH = Math.max(firstCount * (CARD_H + GAP_Y), CARD_H + GAP_Y);
    const canvasW = rounds.length * COL_W + CHAMP_W + SIDE_PAD * 2;
    return { rounds, centers, bracketH, canvasW };
  }, [matches]);

  const { rounds, centers, bracketH, canvasW } = layout;
  const totalH = HEADER_H + 26 + bracketH + FOOTER_H;
  const champion = tournament.champion_id ? participants[tournament.champion_id] : null;

  const cardLeft = (ri: number) => SIDE_PAD + ri * COL_W + CARD_PAD;
  const cardRight = (ri: number) => SIDE_PAD + ri * COL_W + COL_W - CARD_PAD;
  const cardW = COL_W - CARD_PAD * 2;

  return (
    <ScaleToFit width={canvasW} height={totalH}>
      <div
        className="relative font-sans"
        style={{ width: canvasW, height: totalH, background: "radial-gradient(ellipse at 50% 0%, #0a1b12, #050a07 55%, #000 90%)" }}
      >
        {/* angular tech frame */}
        <div className="pointer-events-none absolute inset-3 rounded-2xl border border-amber-400/25" style={{ clipPath: "polygon(0 22px, 22px 0, calc(100% - 22px) 0, 100% 22px, 100% calc(100% - 22px), calc(100% - 22px) 100%, 22px 100%, 0 calc(100% - 22px))" }} />
        <div className="pointer-events-none absolute inset-[14px] rounded-2xl border border-emerald-400/10" />
        {/* faded watermark logo + tactical glow */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 50% at 50% 55%, rgba(16,80,48,0.18), transparent 70%)" }} />
        <img src={lslLogo} alt="" className="pointer-events-none absolute inset-0 m-auto opacity-[0.05]" style={{ width: 640 }} />

        {/* ---------- HEADER ---------- */}
        <div className="absolute left-0 right-0 flex items-center justify-between px-9" style={{ top: 22, height: HEADER_H - 40 }}>
          <div className="flex items-center gap-4">
            <img src={lslLogo} alt="E-Football Competition Bet" className="h-20 w-20 object-contain drop-shadow-[0_0_18px_rgba(212,175,55,0.4)]" />
            <div>
              <div className="text-[24px] font-black tracking-[0.22em] text-emerald-300 leading-none drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]">{tournament.name.toUpperCase()}</div>
              <div className="text-[46px] font-black tracking-tight gradient-gold-text leading-[0.95]">KNOCKOUT BRACKET</div>
              <div className="text-[14px] font-bold tracking-[0.28em] text-amber-100/70 mt-1">{(tournament.tagline ?? "").toUpperCase()}</div>
            </div>
          </div>
          {tournament.event_date && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-black/40 px-4 py-2 text-amber-200 font-bold">
              <Target className="h-5 w-5" />
              {new Date(tournament.event_date).toLocaleDateString("en-GB")}
            </div>
          )}
        </div>

        {/* ---------- ROUND HEADERS ---------- */}
        <div className="absolute" style={{ top: HEADER_H - 50, left: 0, right: 0, height: 44 }}>
          {rounds.map((rms, ri) => {
            const lbl = roundLabel(rms.length * 2);
            const RIcon = roundIcon(rms.length * 2);
            return (
              <div key={ri} className="absolute text-center" style={{ left: SIDE_PAD + ri * COL_W, width: COL_W }}>
                <div className="flex items-center justify-center gap-1.5">
                  <RIcon className="h-4 w-4 text-emerald-400" />
                  <span className="text-[15px] font-black tracking-[0.12em] text-amber-300">{lbl.title}</span>
                </div>
                <div className="text-[11px] font-bold tracking-[0.2em] text-amber-100/50">{lbl.sub}</div>
              </div>
            );
          })}
          <div className="absolute text-center" style={{ left: SIDE_PAD + rounds.length * COL_W, width: CHAMP_W }}>
            <div className="flex items-center justify-center gap-1.5">
              <Crown className="h-4 w-4 text-emerald-400" />
              <span className="text-[15px] font-black tracking-[0.12em] text-amber-300">CHAMPION</span>
            </div>
            <div className="text-[11px] font-bold tracking-[0.2em] text-amber-100/50">ONLY ONE KING</div>
          </div>
        </div>

        {/* ---------- BRACKET ---------- */}
        <div className="absolute" style={{ top: HEADER_H + 26, left: 0, width: canvasW, height: bracketH }}>
          {/* connectors */}
          <svg className="absolute inset-0" width={canvasW} height={bracketH} style={{ pointerEvents: "none" }}>
            {rounds.map((rms, ri) =>
              ri === 0 ? null : rms.map((_, j) => {
                const prev = centers[ri - 1];
                const ym = centers[ri][j];
                const x1 = cardRight(ri - 1);
                const x2 = cardLeft(ri);
                const midX = (x1 + x2) / 2;
                const feeders = [prev[2 * j], prev[2 * j + 1]].filter((v) => v != null);
                return feeders.map((yf, k) => (
                  <path key={`${ri}-${j}-${k}`} d={`M ${x1} ${yf} H ${midX} V ${ym} H ${x2}`} stroke="rgba(212,175,55,0.55)" strokeWidth={2} fill="none" />
                ));
              }),
            )}
            {/* final -> champion */}
            {rounds.length > 0 && centers[rounds.length - 1]?.[0] != null && (
              <path
                d={`M ${cardRight(rounds.length - 1)} ${centers[rounds.length - 1][0]} H ${SIDE_PAD + rounds.length * COL_W + 20}`}
                stroke="rgba(212,175,55,0.55)" strokeWidth={2} fill="none"
              />
            )}
          </svg>

          {/* match cards */}
          {rounds.map((rms, ri) =>
            rms.map((m, j) => {
              const y = centers[ri][j];
              const a = m.participant_a_id ? participants[m.participant_a_id] : null;
              const b = m.participant_b_id ? participants[m.participant_b_id] : null;
              const winA = m.winner_id && m.winner_id === m.participant_a_id;
              const winB = m.winner_id && m.winner_id === m.participant_b_id;
              const done = m.status === "completed";
              return (
                <button
                  key={m.id}
                  onClick={onMatchClick ? () => onMatchClick(m) : undefined}
                  className={`absolute rounded-lg border text-left transition-all ${onMatchClick ? "cursor-pointer hover:border-amber-300 hover:shadow-[0_0_18px_rgba(212,175,55,0.35)]" : "cursor-default"} ${done ? "border-amber-400/60" : "border-amber-400/25"}`}
                  style={{
                    left: cardLeft(ri), top: y - CARD_H / 2, width: cardW, height: CARD_H,
                    background: "linear-gradient(160deg, rgba(10,30,18,0.95), rgba(4,10,6,0.96))",
                  }}
                >
                  {m.label && <div className="absolute -top-[15px] left-2 text-[10px] font-black tracking-widest text-amber-300">{m.label}</div>}
                  {m.match_id && <div className="absolute -top-[15px] right-2 text-[9px] font-black tracking-widest text-emerald-400">● LIVE-LINKED</div>}
                  <Side name={a?.name} logo={a?.logo_url} win={!!winA} score={m.score_a} dimmed={done && !winA} dq={!!a?.is_disqualified} />
                  <div className="mx-2 h-px bg-amber-400/20" />
                  <Side name={b?.name} logo={b?.logo_url} win={!!winB} score={m.score_b} dimmed={done && !winB} dq={!!b?.is_disqualified} />
                </button>
              );
            }),
          )}

          {/* seed numbers for the opening round */}
          {rounds[0]?.map((_, j) => {
            const y = centers[0][j];
            return (
              <div key={`seed-${j}`}>
                <SeedBadge n={2 * j + 1} cy={y - CARD_H / 4} />
                <SeedBadge n={2 * j + 2} cy={y + CARD_H / 4} />
              </div>
            );
          })}

          {/* champion box */}
          <div
            className="absolute rounded-2xl border-2 border-amber-400/70 grid place-items-center"
            style={{
              left: SIDE_PAD + rounds.length * COL_W + 24, top: (centers[rounds.length - 1]?.[0] ?? bracketH / 2) - 150,
              width: CHAMP_W - 50, height: 300,
              background: "linear-gradient(160deg, rgba(40,32,6,0.9), rgba(8,8,8,0.95))",
              boxShadow: "0 0 40px -8px rgba(212,175,55,0.5)",
            }}
          >
            <ChampionTrophy />
            <div className="text-[22px] font-black tracking-[0.18em] gradient-gold-text mt-3">CHAMPION</div>
            <div className="flex gap-1.5 text-amber-300 mt-1 text-[18px] drop-shadow-[0_0_8px_rgba(212,175,55,0.7)]">★ ★ ★</div>
            <div className="text-[16px] font-bold text-amber-100 mt-2 px-2 text-center truncate max-w-full">
              {champion ? champion.name : "— TBD —"}
            </div>
            {champion && <Crown className="absolute -top-5 h-9 w-9 text-amber-300" />}
          </div>
        </div>

        {/* ---------- FORMAT FOOTER ---------- */}
        <div className="absolute left-9 right-9" style={{ bottom: 28, height: FOOTER_H - 56 }}>
          <div className="rounded-2xl border border-amber-400/30 bg-black/50 h-full flex flex-col items-center justify-center gap-3 px-6">
            <div className="text-[18px] font-black tracking-[0.2em] text-amber-300">TOURNAMENT FORMAT</div>
            <div className="flex items-center gap-3 flex-wrap justify-center text-amber-100/80 text-[13px] font-bold tracking-wider">
              {rounds.map((rms, ri) => {
                const lbl = roundLabel(rms.length * 2);
                return (
                  <div key={ri} className="flex items-center gap-3">
                    <span>{lbl.title}</span>
                    <span className="text-amber-400">→</span>
                  </div>
                );
              })}
              <span className="flex items-center gap-1 text-amber-300"><Crown className="h-5 w-5" /> CHAMPION</span>
            </div>
          </div>
        </div>
      </div>
    </ScaleToFit>
  );
}

function Side({ name, logo, win, score, dimmed, dq }: { name?: string | null; logo?: string | null; win: boolean; score: number | null; dimmed: boolean; dq?: boolean }) {
  return SideRow({ name, logo, win, score, dimmed, dq });
}

/** Gold trophy flanked by laurel branches — matches the bracket reference art. */
function ChampionTrophy() {
  const leaf = (cx: number, cy: number, rot: number) => (
    <ellipse cx={cx} cy={cy} rx="5.5" ry="3" fill="url(#laurelGold)" transform={`rotate(${rot} ${cx} ${cy})`} />
  );
  return (
    <svg width="150" height="104" viewBox="0 0 150 104" fill="none" className="drop-shadow-[0_0_20px_rgba(212,175,55,0.6)]">
      <defs>
        <linearGradient id="trophyGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe9a8" />
          <stop offset="0.45" stopColor="#e8c45a" />
          <stop offset="1" stopColor="#a9772a" />
        </linearGradient>
        <linearGradient id="laurelGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d27a" />
          <stop offset="1" stopColor="#9c6e28" />
        </linearGradient>
      </defs>
      {/* left laurel */}
      <g>
        <path d="M40 96 C24 84 18 64 22 44" stroke="url(#laurelGold)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {leaf(22, 46, 50)}{leaf(20, 58, 35)}{leaf(22, 70, 20)}{leaf(28, 82, 5)}{leaf(36, 92, -10)}
      </g>
      {/* right laurel (mirrored) */}
      <g transform="translate(150 0) scale(-1 1)">
        <path d="M40 96 C24 84 18 64 22 44" stroke="url(#laurelGold)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {leaf(22, 46, 50)}{leaf(20, 58, 35)}{leaf(22, 70, 20)}{leaf(28, 82, 5)}{leaf(36, 92, -10)}
      </g>
      {/* trophy cup */}
      <path d="M52 20 H98 V34 C98 52 88 62 75 62 C62 62 52 52 52 34 Z" fill="url(#trophyGold)" stroke="#7a5418" strokeWidth="1" />
      {/* handles */}
      <path d="M52 24 C40 24 40 42 52 44" stroke="url(#trophyGold)" strokeWidth="4" fill="none" />
      <path d="M98 24 C110 24 110 42 98 44" stroke="url(#trophyGold)" strokeWidth="4" fill="none" />
      {/* stem + base */}
      <rect x="71" y="62" width="8" height="12" fill="url(#trophyGold)" />
      <rect x="60" y="74" width="30" height="6" rx="2" fill="url(#trophyGold)" />
      <rect x="64" y="80" width="22" height="8" rx="2" fill="url(#trophyGold)" />
    </svg>
  );
}

function SeedBadge({ n, cy }: { n: number; cy: number }) {
  return (
    <div
      className="absolute grid place-items-center rounded-[5px] border border-amber-400/45 bg-black/70 text-[11px] font-black tabular-nums text-amber-300"
      style={{ left: 8, top: cy - 11, width: 24, height: 22 }}
    >
      {String(n).padStart(2, "0")}
    </div>
  );
}

function SideRow({ name, logo, win, score, dimmed, dq }: { name?: string | null; logo?: string | null; win: boolean; score: number | null; dimmed: boolean; dq?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-2.5 h-[29px] ${dimmed ? "opacity-40" : ""}`}>
      <span className="flex items-center gap-1.5 min-w-0">
        {logo
          ? <img src={logo} alt="" className="h-4 w-4 rounded-sm object-cover border border-amber-400/30 shrink-0" />
          : name ? <span className="h-4 w-4 rounded-sm bg-amber-400/15 border border-amber-400/30 grid place-items-center text-[8px] font-bold text-amber-300 shrink-0">{name.charAt(0).toUpperCase()}</span> : null}
        <span className={`text-[13px] font-bold truncate ${win ? "text-amber-300" : "text-amber-50/90"}`}>{name ?? "—"}</span>
        {dq && <span className="text-[8px] font-black tracking-widest text-red-400 border border-red-400/50 rounded px-1 shrink-0">DQ</span>}
      </span>
      {score != null && <span className={`text-[13px] font-black tabular-nums ${win ? "text-amber-300" : "text-amber-50/60"}`}>{score}</span>}
    </div>
  );
}