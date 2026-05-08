export type MatchStatus = "live" | "scheduled" | "ended";

export interface Odd { id: string; label: string; value: number }
export interface Match {
  id: string;
  name: string;
  home: { name: string; tag: string; color: string };
  away: { name: string; tag: string; color: string };
  startTime: string; // ISO
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  location: string;
  odds: Odd[];
  market: string;
}

const future = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();
const past = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

export const matches: Match[] = [
  {
    id: "m1", name: "Round 14 · Night Hunt", market: "Match Winner",
    home: { name: "Crimson Vipers", tag: "CRV", color: "oklch(0.6 0.22 25)" },
    away: { name: "Golden Wolves", tag: "GWV", color: "oklch(0.82 0.17 90)" },
    startTime: past(12), status: "live", homeScore: 14, awayScore: 11,
    location: "Lomita Range · Bay 3",
    odds: [
      { id: "o1", label: "Vipers", value: 1.85 },
      { id: "o2", label: "Draw", value: 4.20 },
      { id: "o3", label: "Wolves", value: 2.10 },
    ],
  },
  {
    id: "m2", name: "Round 14 · Daybreak Duel", market: "Match Winner",
    home: { name: "Iron Phantoms", tag: "IRP", color: "oklch(0.5 0.05 270)" },
    away: { name: "Emerald Reapers", tag: "EMR", color: "oklch(0.65 0.17 158)" },
    startTime: future(45), status: "scheduled", homeScore: 0, awayScore: 0,
    location: "Lomita Range · Bay 1",
    odds: [
      { id: "o4", label: "Phantoms", value: 2.40 },
      { id: "o5", label: "Draw", value: 3.80 },
      { id: "o6", label: "Reapers", value: 1.65 },
    ],
  },
  {
    id: "m3", name: "Round 14 · Midnight Showdown", market: "Match Winner",
    home: { name: "Skull Syndicate", tag: "SKS", color: "oklch(0.85 0 0)" },
    away: { name: "Obsidian Pact", tag: "OBP", color: "oklch(0.3 0.04 270)" },
    startTime: future(180), status: "scheduled", homeScore: 0, awayScore: 0,
    location: "Lomita Range · Outdoor",
    odds: [
      { id: "o7", label: "Syndicate", value: 1.55 },
      { id: "o8", label: "Draw", value: 4.50 },
      { id: "o9", label: "Pact", value: 2.70 },
    ],
  },
  {
    id: "m4", name: "Round 13 · Sniper's Verdict", market: "Match Winner",
    home: { name: "Crimson Vipers", tag: "CRV", color: "oklch(0.6 0.22 25)" },
    away: { name: "Skull Syndicate", tag: "SKS", color: "oklch(0.85 0 0)" },
    startTime: past(60 * 24), status: "ended", homeScore: 21, awayScore: 18,
    location: "Lomita Range · Bay 2",
    odds: [
      { id: "o10", label: "Vipers", value: 1.95 },
      { id: "o11", label: "Draw", value: 4.00 },
      { id: "o12", label: "Syndicate", value: 1.95 },
    ],
  },
  {
    id: "m5", name: "Round 14 · Twilight Trial", market: "Match Winner",
    home: { name: "Golden Wolves", tag: "GWV", color: "oklch(0.82 0.17 90)" },
    away: { name: "Emerald Reapers", tag: "EMR", color: "oklch(0.65 0.17 158)" },
    startTime: future(60 * 8), status: "scheduled", homeScore: 0, awayScore: 0,
    location: "Lomita Range · Bay 4",
    odds: [
      { id: "o13", label: "Wolves", value: 2.05 },
      { id: "o14", label: "Draw", value: 3.90 },
      { id: "o15", label: "Reapers", value: 1.80 },
    ],
  },
];

export interface Shooter {
  id: string; name: string; alias: string; gang: string;
  points: number; wins: number; kdr: number; role: "Shooter" | "Captain" | "Veteran" | "Rookie";
}

export const shooters: Shooter[] = [
  { id: "s1", name: "Marco 'Halo' Reyes", alias: "Halo", gang: "Golden Wolves", points: 9820, wins: 47, kdr: 3.4, role: "Captain" },
  { id: "s2", name: "Devon Cross", alias: "Phantom", gang: "Iron Phantoms", points: 8740, wins: 42, kdr: 2.9, role: "Captain" },
  { id: "s3", name: "Selene Vargas", alias: "Vex", gang: "Crimson Vipers", points: 8210, wins: 39, kdr: 3.1, role: "Veteran" },
  { id: "s4", name: "Kai Ortega", alias: "Reap", gang: "Emerald Reapers", points: 7980, wins: 38, kdr: 2.7, role: "Captain" },
  { id: "s5", name: "Jonas 'Bone' Mireles", alias: "Bone", gang: "Skull Syndicate", points: 7510, wins: 36, kdr: 2.5, role: "Captain" },
  { id: "s6", name: "Aria Kwon", alias: "Echo", gang: "Golden Wolves", points: 6890, wins: 33, kdr: 2.6, role: "Shooter" },
  { id: "s7", name: "Mateo Salas", alias: "Drift", gang: "Obsidian Pact", points: 6420, wins: 31, kdr: 2.3, role: "Captain" },
  { id: "s8", name: "Riya Patel", alias: "Spire", gang: "Iron Phantoms", points: 6190, wins: 30, kdr: 2.4, role: "Shooter" },
  { id: "s9", name: "Cole Whitman", alias: "Trace", gang: "Crimson Vipers", points: 5840, wins: 28, kdr: 2.2, role: "Veteran" },
  { id: "s10", name: "Nia Foster", alias: "Glint", gang: "Emerald Reapers", points: 5610, wins: 27, kdr: 2.1, role: "Shooter" },
  { id: "s11", name: "Tobias Lin", alias: "Frost", gang: "Skull Syndicate", points: 5320, wins: 26, kdr: 2.0, role: "Shooter" },
  { id: "s12", name: "Eden Marquez", alias: "Ember", gang: "Obsidian Pact", points: 4980, wins: 24, kdr: 1.9, role: "Rookie" },
];

export interface Gang {
  id: string; name: string; tag: string; color: string;
  members: number; points: number; wins: number; motto: string;
}

export const gangs: Gang[] = [
  { id: "g1", name: "Golden Wolves", tag: "GWV", color: "oklch(0.82 0.17 90)", members: 24, points: 28450, wins: 132, motto: "By gold we hunt." },
  { id: "g2", name: "Iron Phantoms", tag: "IRP", color: "oklch(0.5 0.05 270)", members: 22, points: 26120, wins: 124, motto: "Unseen. Unmoved." },
  { id: "g3", name: "Crimson Vipers", tag: "CRV", color: "oklch(0.6 0.22 25)", members: 21, points: 24890, wins: 118, motto: "Strike first, strike last." },
  { id: "g4", name: "Emerald Reapers", tag: "EMR", color: "oklch(0.65 0.17 158)", members: 20, points: 23410, wins: 113, motto: "Patience cuts deepest." },
  { id: "g5", name: "Skull Syndicate", tag: "SKS", color: "oklch(0.85 0 0)", members: 19, points: 21750, wins: 104, motto: "Bones don't lie." },
  { id: "g6", name: "Obsidian Pact", tag: "OBP", color: "oklch(0.3 0.04 270)", members: 18, points: 19880, wins: 96, motto: "Forged in shadow." },
];

export const announcements = [
  { id: "a1", title: "Season 4 Finals — January 18", body: "Top 4 gangs clash in a winner-takes-all bracket. 50,000 token prize pool." },
  { id: "a2", title: "New Market: Headshot Streaks", body: "Bet on consecutive headshot streaks per round. Live odds throughout." },
  { id: "a3", title: "Veteran Verification Drive", body: "Submit your veteran credentials in-app to unlock the Veteran badge." },
];
