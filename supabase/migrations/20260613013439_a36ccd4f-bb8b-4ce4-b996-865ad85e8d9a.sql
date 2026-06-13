ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS futures_section_title text DEFAULT 'TOURNAMENT FUTURES',
  ADD COLUMN IF NOT EXISTS futures_min_stake numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS futures_max_payout numeric DEFAULT 100000000,
  ADD COLUMN IF NOT EXISTS futures_max_selections integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS futures_repeat_tickets_enabled boolean NOT NULL DEFAULT true;