CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

ALTER TABLE public.odds
  ADD COLUMN IF NOT EXISTS future_candidate_type text,
  ADD COLUMN IF NOT EXISTS future_emblem_url text,
  ADD COLUMN IF NOT EXISTS future_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS future_next_title text,
  ADD COLUMN IF NOT EXISTS future_next_at timestamptz,
  ADD COLUMN IF NOT EXISTS future_progress jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS odds_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_repeat_future_bets boolean NOT NULL DEFAULT false;

ALTER TABLE public.leaderboard_overrides
  ADD COLUMN IF NOT EXISTS total_score numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.match_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT true,
  score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id),
  UNIQUE (match_id, team_id)
);
GRANT SELECT ON public.match_attendance TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_attendance TO authenticated;
GRANT ALL ON public.match_attendance TO service_role;
ALTER TABLE public.match_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view attendance" ON public.match_attendance FOR SELECT USING (true);
CREATE POLICY "Admins manage attendance" ON public.match_attendance FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_match_attendance_updated_at BEFORE UPDATE ON public.match_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.match_attendance;