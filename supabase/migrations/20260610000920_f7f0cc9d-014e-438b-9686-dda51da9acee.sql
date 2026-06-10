ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS futures_max_selections integer NOT NULL DEFAULT 1;

ALTER TABLE public.odds
  ADD COLUMN IF NOT EXISTS future_candidate_type text,
  ADD COLUMN IF NOT EXISTS future_emblem_url text,
  ADD COLUMN IF NOT EXISTS future_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS future_next_title text,
  ADD COLUMN IF NOT EXISTS future_next_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS future_progress jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_futures_max_selections_check'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_futures_max_selections_check CHECK (futures_max_selections BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'odds_future_status_check'
  ) THEN
    ALTER TABLE public.odds
      ADD CONSTRAINT odds_future_status_check CHECK (future_status IN ('active','qualified','disqualified','lost','winner','settled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_odds_future_status ON public.odds(future_status);