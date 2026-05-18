ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_matches_is_archived ON public.matches(is_archived);