
-- TOURNAMENTS
CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subtitle text DEFAULT 'ONE LEAGUE. NO MERCY. RESPECT THE GAME.',
  status text NOT NULL DEFAULT 'active',
  opening_round_size int NOT NULL DEFAULT 26,
  total_rounds int NOT NULL DEFAULT 1,
  background_image_url text,
  champion_participant_id uuid,
  tournament_date date DEFAULT CURRENT_DATE,
  is_featured boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournaments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tournaments" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "Admins manage tournaments" ON public.tournaments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PARTICIPANTS
CREATE TABLE public.tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  avatar_url text,
  kind text NOT NULL DEFAULT 'shooter',
  source_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  source_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  seed int NOT NULL DEFAULT 0,
  eliminated_round int,
  is_champion boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tournament_participants_tid_idx ON public.tournament_participants(tournament_id);
GRANT SELECT ON public.tournament_participants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_participants TO authenticated;
GRANT ALL ON public.tournament_participants TO service_role;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read participants" ON public.tournament_participants FOR SELECT USING (true);
CREATE POLICY "Admins manage participants" ON public.tournament_participants FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- MATCHES (bracket nodes)
CREATE TABLE public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round int NOT NULL,                       -- 1 = opening round
  slot int NOT NULL,                        -- 0..n-1 within the round
  match_code text,                          -- e.g. M1, R16-1, QF1, SF1, FINAL
  participant1_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  participant2_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  score1 int,
  score2 int,
  winner_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  loser_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',   -- pending | live | done
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, round, slot)
);
CREATE INDEX tournament_matches_tid_idx ON public.tournament_matches(tournament_id, round, slot);
GRANT SELECT ON public.tournament_matches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_matches TO authenticated;
GRANT ALL ON public.tournament_matches TO service_role;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read matches" ON public.tournament_matches FOR SELECT USING (true);
CREATE POLICY "Admins manage matches" ON public.tournament_matches FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_matches;

-- updated_at trigger
CREATE TRIGGER trg_tournaments_updated BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bracket builder: generates empty match nodes for a tournament given opening_round_size
CREATE OR REPLACE FUNCTION public.bracket_generate(_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t record;
  cur_size int;
  r int := 1;
  slot int;
  code text;
  rounds int := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = _tournament_id FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  DELETE FROM public.tournament_matches WHERE tournament_id = _tournament_id;
  cur_size := GREATEST(2, t.opening_round_size);
  WHILE cur_size >= 1 LOOP
    rounds := rounds + 1;
    IF cur_size = 1 THEN EXIT; END IF;
    FOR slot IN 0..(ceil(cur_size::numeric/2)::int - 1) LOOP
      code := CASE
        WHEN r = 1 THEN 'M' || (slot+1)
        WHEN cur_size = 16 OR (r = 2 AND t.opening_round_size > 16) THEN 'R16-' || (slot+1)
        WHEN cur_size = 8 THEN 'QF' || (slot+1)
        WHEN cur_size = 4 THEN 'SF' || (slot+1)
        WHEN cur_size = 2 THEN 'FINAL'
        ELSE 'R' || cur_size || '-' || (slot+1)
      END;
      INSERT INTO public.tournament_matches (tournament_id, round, slot, match_code)
        VALUES (_tournament_id, r, slot, code);
    END LOOP;
    cur_size := ceil(cur_size::numeric / 2)::int;
    r := r + 1;
  END LOOP;
  UPDATE public.tournaments SET total_rounds = rounds WHERE id = _tournament_id;
  -- Auto-seat participants into round 1 by seed order
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY seed, created_at) - 1 AS rn
    FROM public.tournament_participants WHERE tournament_id = _tournament_id
  )
  UPDATE public.tournament_matches tm SET
    participant1_id = (SELECT id FROM ranked WHERE rn = tm.slot * 2),
    participant2_id = (SELECT id FROM ranked WHERE rn = tm.slot * 2 + 1)
  WHERE tm.tournament_id = _tournament_id AND tm.round = 1;
  RETURN jsonb_build_object('ok', true, 'rounds', rounds);
END $$;

-- Record a match result and auto-advance winner to next round
CREATE OR REPLACE FUNCTION public.bracket_set_winner(_match_id uuid, _winner_id uuid, _score1 int DEFAULT NULL, _score2 int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  m record;
  t record;
  loser uuid;
  next_round int;
  next_slot int;
  next_field text;
  next_match_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO m FROM public.tournament_matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _winner_id IS NOT NULL AND _winner_id NOT IN (COALESCE(m.participant1_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(m.participant2_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'Winner must be one of the two participants';
  END IF;
  loser := CASE WHEN _winner_id = m.participant1_id THEN m.participant2_id WHEN _winner_id = m.participant2_id THEN m.participant1_id ELSE NULL END;
  UPDATE public.tournament_matches SET
    winner_participant_id = _winner_id,
    loser_participant_id = loser,
    score1 = COALESCE(_score1, score1),
    score2 = COALESCE(_score2, score2),
    status = CASE WHEN _winner_id IS NULL THEN 'pending' ELSE 'done' END,
    completed_at = CASE WHEN _winner_id IS NULL THEN NULL ELSE now() END
  WHERE id = _match_id;
  IF loser IS NOT NULL THEN
    UPDATE public.tournament_participants SET eliminated_round = m.round WHERE id = loser AND (eliminated_round IS NULL OR eliminated_round > m.round);
  END IF;
  -- Clear champion if this match was the final
  SELECT * INTO t FROM public.tournaments WHERE id = m.tournament_id;
  IF m.round = t.total_rounds THEN
    UPDATE public.tournament_participants SET is_champion = false WHERE tournament_id = m.tournament_id;
    UPDATE public.tournaments SET champion_participant_id = _winner_id, status = CASE WHEN _winner_id IS NULL THEN 'active' ELSE 'completed' END WHERE id = m.tournament_id;
    IF _winner_id IS NOT NULL THEN UPDATE public.tournament_participants SET is_champion = true WHERE id = _winner_id; END IF;
  END IF;
  -- Advance to next round
  next_round := m.round + 1;
  next_slot := m.slot / 2;
  next_field := CASE WHEN m.slot % 2 = 0 THEN 'participant1_id' ELSE 'participant2_id' END;
  SELECT id INTO next_match_id FROM public.tournament_matches
    WHERE tournament_id = m.tournament_id AND round = next_round AND slot = next_slot;
  IF next_match_id IS NOT NULL THEN
    IF next_field = 'participant1_id' THEN
      UPDATE public.tournament_matches SET participant1_id = _winner_id WHERE id = next_match_id;
    ELSE
      UPDATE public.tournament_matches SET participant2_id = _winner_id WHERE id = next_match_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'advanced_to', next_match_id);
END $$;
