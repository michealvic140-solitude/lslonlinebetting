ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS featured_bg_url text,
  ADD COLUMN IF NOT EXISTS featured_bg_fit text DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS featured_bg_position text DEFAULT 'center';