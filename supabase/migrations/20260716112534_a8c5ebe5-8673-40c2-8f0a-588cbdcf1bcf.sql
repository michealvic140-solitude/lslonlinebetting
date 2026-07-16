
-- recurring_push_settings
CREATE TABLE IF NOT EXISTS public.recurring_push_settings (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  title TEXT NOT NULL DEFAULT '',
  body  TEXT NOT NULL DEFAULT '',
  link  TEXT,
  hour_utc INT,
  start_hour_utc INT NOT NULL DEFAULT 0,
  end_hour_utc INT NOT NULL DEFAULT 23,
  cycles_content TEXT,
  next_index INT NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  last_sent_slot TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_push_settings TO authenticated;
GRANT ALL ON public.recurring_push_settings TO service_role;
ALTER TABLE public.recurring_push_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage recurring push" ON public.recurring_push_settings;
CREATE POLICY "Admins manage recurring push"
  ON public.recurring_push_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- motivational_content: add text + idx used by the picker
ALTER TABLE public.motivational_content
  ADD COLUMN IF NOT EXISTS text TEXT,
  ADD COLUMN IF NOT EXISTS idx  INT NOT NULL DEFAULT 0;
UPDATE public.motivational_content SET text = body WHERE text IS NULL;
CREATE INDEX IF NOT EXISTS idx_motivational_kind_idx ON public.motivational_content(kind, idx);

-- matches: extra featured/attendance/repeat-restrict fields
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS featured_image_fit TEXT DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS featured_image_position TEXT DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS home_present BOOLEAN,
  ADD COLUMN IF NOT EXISTS away_present BOOLEAN,
  ADD COLUMN IF NOT EXISTS restrict_repeat_contender BOOLEAN NOT NULL DEFAULT false;

-- bets: is_virtual + kind for admin filters
ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kind TEXT;
CREATE INDEX IF NOT EXISTS idx_bets_kind ON public.bets(kind);
CREATE INDEX IF NOT EXISTS idx_bets_is_virtual ON public.bets(is_virtual);
