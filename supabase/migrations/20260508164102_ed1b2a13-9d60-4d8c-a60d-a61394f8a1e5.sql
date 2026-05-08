
-- Add sponsor role if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='sponsor' AND enumtypid='public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'sponsor';
  END IF;
END $$;

-- Profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ingame_name text,
  ADD COLUMN IF NOT EXISTS discord_full_name text;

-- user_tasks placeholder
CREATE TABLE IF NOT EXISTS public.user_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  reward_tokens bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users see own tasks" ON public.user_tasks;
CREATE POLICY "users see own tasks" ON public.user_tasks FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins manage tasks" ON public.user_tasks;
CREATE POLICY "admins manage tasks" ON public.user_tasks FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_achievements placeholder
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  icon text,
  awarded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users see own achievements" ON public.user_achievements;
CREATE POLICY "users see own achievements" ON public.user_achievements FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins manage achievements" ON public.user_achievements;
CREATE POLICY "admins manage achievements" ON public.user_achievements FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
