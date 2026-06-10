import { supabase } from "@/integrations/supabase/client";

export type MatchStatus = "scheduled" | "live" | "ended" | "cancelled";

export interface OddRow {
  id: string;
  label: string;
  value: number;
  is_winner: boolean | null;
  market_id: string;
  future_candidate_type?: string | null;
  future_emblem_url?: string | null;
  future_status?: "active" | "qualified" | "disqualified" | "lost" | "winner" | "settled" | null;
  future_next_title?: string | null;
  future_next_at?: string | null;
  future_progress?: Array<{ status: string; title?: string; at?: string; note?: string }> | null;
}
export interface MarketRow { id: string; name: string; is_open: boolean; odds: OddRow[] }
export interface TeamRow { id: string; name: string; logo_url: string | null; gang_type: "G" | "F" | null }
export interface MatchRow {
  id: string; name: string; status: MatchStatus;
  start_time: string; location: string | null; is_featured: boolean;
  home_score: number; away_score: number;
  is_virtual?: boolean; lock_time?: string | null; match_kind?: "gang" | "shooter" | "future"; marketing_enabled?: boolean;
  home_team: TeamRow | null; away_team: TeamRow | null;
  home_player?: { id: string; name: string; avatar_url: string | null; team_id: string | null } | null;
  away_player?: { id: string; name: string; avatar_url: string | null; team_id: string | null } | null;
  markets: MarketRow[];
  category_id?: string | null;
  category?: { id: string; name: string; icon: string | null } | null;
}

const matchSelect = `
  id,name,status,start_time,location,is_featured,home_score,away_score,category_id,is_virtual,lock_time,match_kind,marketing_enabled,
  category:categories!category_id(id,name,icon),
  home_team:teams!home_team_id(id,name,logo_url,gang_type),
  away_team:teams!away_team_id(id,name,logo_url,gang_type),
  home_player:players!home_player_id(id,name,avatar_url,team_id),
  away_player:players!away_player_id(id,name,avatar_url,team_id),
  markets(id,name,is_open,odds(id,label,value,is_winner,market_id,future_candidate_type,future_emblem_url,future_status,future_next_title,future_next_at,future_progress))
`;

export async function fetchMatches(): Promise<MatchRow[]> {
  const { data, error } = await supabase.from("matches").select(matchSelect).eq("is_archived", false).eq("is_virtual", false).order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MatchRow[];
}

export async function fetchMatch(id: string): Promise<MatchRow | null> {
  const { data, error } = await supabase.from("matches").select(matchSelect).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as MatchRow | null;
}

export async function fetchTeams() {
  const { data } = await supabase.from("teams").select("*").order("name");
  return data ?? [];
}

export async function fetchAnnouncements() {
  const { data } = await supabase.from("announcements").select("*").eq("is_active", true).order("created_at", { ascending: false });
  return data ?? [];
}

export async function fetchSettings() {
  const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  return data;
}

export function teamColor(name: string | undefined | null): string {
  if (!name) return "oklch(0.5 0.05 270)";
  const palette = [
    "oklch(0.82 0.17 90)",
    "oklch(0.5 0.05 270)",
    "oklch(0.6 0.22 25)",
    "oklch(0.65 0.17 158)",
    "oklch(0.85 0 0)",
    "oklch(0.3 0.04 270)",
    "oklch(0.7 0.2 320)",
    "oklch(0.7 0.18 50)",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
