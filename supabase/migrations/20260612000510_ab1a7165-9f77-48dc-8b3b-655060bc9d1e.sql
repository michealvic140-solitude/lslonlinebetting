ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS away_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL;

ALTER TABLE public.matches ALTER COLUMN home_team_id DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN away_team_id DROP NOT NULL;

ALTER TABLE public.players ALTER COLUMN team_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_home_player_id ON public.matches(home_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_player_id ON public.matches(away_player_id);