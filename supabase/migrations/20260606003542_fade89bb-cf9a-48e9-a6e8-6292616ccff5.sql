
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS leaderboard_gangs_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS leaderboard_shooters_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS hall_of_fame_reset_at timestamptz;
