ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_present boolean NOT NULL DEFAULT true;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_present boolean NOT NULL DEFAULT true;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS restrict_repeat_contender boolean NOT NULL DEFAULT false;