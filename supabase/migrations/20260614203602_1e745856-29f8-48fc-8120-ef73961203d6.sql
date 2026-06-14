-- gang_directory (safe public read of gang stats)
CREATE OR REPLACE FUNCTION public.gang_directory()
RETURNS TABLE(name text, type text, members bigint, tokens bigint, sample text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gang_name, max(gang_type::text), count(*),
         coalesce(sum(token_balance), 0)::bigint,
         (array_agg(full_name ORDER BY token_balance DESC NULLS LAST))[1:4]
  FROM public.profiles
  WHERE gang_name IS NOT NULL
  GROUP BY gang_name
$$;
GRANT EXECUTE ON FUNCTION public.gang_directory() TO anon, authenticated;

-- user_roles read scoping + display badge helper
DROP POLICY IF EXISTS "roles readable by all authed" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles own or admin read" ON public.user_roles;
CREATE POLICY "user_roles own or admin read" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_display_roles(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(role::text), '{}'::text[])
  FROM public.user_roles
  WHERE user_id = _user_id AND role::text IN ('admin', 'moderator');
$$;
GRANT EXECUTE ON FUNCTION public.get_display_roles(uuid) TO anon, authenticated;

-- Private settings table
CREATE TABLE IF NOT EXISTS public.app_settings_private (
  id integer PRIMARY KEY DEFAULT 1,
  admin_ai_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  admin_ai_enabled boolean NOT NULL DEFAULT true,
  exposure_warn_pct integer NOT NULL DEFAULT 70,
  house_low_balance bigint NOT NULL DEFAULT 1000000,
  push_endpoint_url text,
  vapid_subject text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_private_singleton CHECK (id = 1)
);

-- Seed from existing app_settings if columns exist
DO $$
DECLARE has_ai_model boolean; has_ai_en boolean; has_warn boolean; has_low boolean; has_push boolean; has_vapid boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='admin_ai_model') INTO has_ai_model;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='admin_ai_enabled') INTO has_ai_en;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='exposure_warn_pct') INTO has_warn;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='house_low_balance') INTO has_low;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='push_endpoint_url') INTO has_push;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='vapid_subject') INTO has_vapid;

  EXECUTE format(
    'INSERT INTO public.app_settings_private (id, admin_ai_model, admin_ai_enabled, exposure_warn_pct, house_low_balance, push_endpoint_url, vapid_subject)
     SELECT 1, %s, %s, %s, %s, %s, %s FROM public.app_settings WHERE id=1 ON CONFLICT (id) DO NOTHING',
    CASE WHEN has_ai_model THEN 'COALESCE(admin_ai_model, ''google/gemini-2.5-flash'')' ELSE '''google/gemini-2.5-flash''' END,
    CASE WHEN has_ai_en THEN 'COALESCE(admin_ai_enabled, true)' ELSE 'true' END,
    CASE WHEN has_warn THEN 'COALESCE(exposure_warn_pct, 70)' ELSE '70' END,
    CASE WHEN has_low THEN 'COALESCE(house_low_balance, 1000000)' ELSE '1000000' END,
    CASE WHEN has_push THEN 'push_endpoint_url' ELSE 'NULL::text' END,
    CASE WHEN has_vapid THEN 'vapid_subject' ELSE 'NULL::text' END
  );
END $$;

INSERT INTO public.app_settings_private (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.app_settings_private TO authenticated;
GRANT ALL ON public.app_settings_private TO service_role;
ALTER TABLE public.app_settings_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "private settings admin" ON public.app_settings_private;
CREATE POLICY "private settings admin" ON public.app_settings_private
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));