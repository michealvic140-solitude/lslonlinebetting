-- Push delivery log
CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  notification_id uuid PRIMARY KEY REFERENCES public.notifications(id) ON DELETE CASCADE,
  sent_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.push_delivery_log TO authenticated;
GRANT ALL ON public.push_delivery_log TO service_role;
ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push delivery admins read" ON public.push_delivery_log;
CREATE POLICY "push delivery admins read" ON public.push_delivery_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS push_delivery_log_updated_at ON public.push_delivery_log;
CREATE TRIGGER push_delivery_log_updated_at BEFORE UPDATE ON public.push_delivery_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;

-- Scheduled pushes
CREATE TABLE IF NOT EXISTS public.scheduled_pushes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '/',
  role text NOT NULL DEFAULT 'any',
  locale text NOT NULL DEFAULT '',
  last_active_days integer,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_pushes TO authenticated;
GRANT ALL ON public.scheduled_pushes TO service_role;
ALTER TABLE public.scheduled_pushes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage scheduled pushes" ON public.scheduled_pushes;
CREATE POLICY "Admins manage scheduled pushes" ON public.scheduled_pushes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_due ON public.scheduled_pushes (status, scheduled_for);
DROP TRIGGER IF EXISTS scheduled_pushes_updated_at ON public.scheduled_pushes;
CREATE TRIGGER scheduled_pushes_updated_at BEFORE UPDATE ON public.scheduled_pushes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Home banners
CREATE TABLE IF NOT EXISTS public.home_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  link_url text NOT NULL DEFAULT '/',
  cta_label text NOT NULL DEFAULT 'Click here',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.home_banners TO authenticated;
GRANT ALL ON public.home_banners TO service_role;
ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active banners" ON public.home_banners;
CREATE POLICY "Anyone can view active banners" ON public.home_banners FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage banners" ON public.home_banners;
CREATE POLICY "Admins manage banners" ON public.home_banners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS home_banners_updated_at ON public.home_banners;
CREATE TRIGGER home_banners_updated_at BEFORE UPDATE ON public.home_banners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();