ALTER TABLE public.players ALTER COLUMN team_id DROP NOT NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_kind text NOT NULL DEFAULT 'gang',
  ADD COLUMN IF NOT EXISTS home_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS away_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketing_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_match_kind_check'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_match_kind_check CHECK (match_kind IN ('gang', 'shooter', 'future'));
  END IF;
END $$;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS futures_section_title text NOT NULL DEFAULT 'SEASONAL TOURNAMENT',
  ADD COLUMN IF NOT EXISTS futures_min_stake bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS futures_max_payout bigint NOT NULL DEFAULT 100000000;

CREATE INDEX IF NOT EXISTS idx_matches_match_kind ON public.matches(match_kind);
CREATE INDEX IF NOT EXISTS idx_matches_home_player_id ON public.matches(home_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_player_id ON public.matches(away_player_id);