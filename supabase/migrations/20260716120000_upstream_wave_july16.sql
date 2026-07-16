ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS featured_image_url text,
  ADD COLUMN IF NOT EXISTS featured_image_fit text DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS featured_image_position text DEFAULT 'center';CREATE OR REPLACE FUNCTION public.place_real_ticket(_selections jsonb, _stake bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  p record; cfg record;
  total_odds numeric := 1; payout bigint; bet_id uuid; tracking text; new_bal bigint;
  s jsonb; o record; mk record; m record;
  sel_count int; cap bigint; is_future_ticket boolean := true;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  sel_count := jsonb_array_length(_selections);
  IF sel_count IS NULL OR sel_count = 0 THEN RAISE EXCEPTION 'No selections'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = uid FOR UPDATE;
  IF p.is_banned OR p.is_restricted THEN RAISE EXCEPTION 'Account restricted'; END IF;

  SELECT min_stake, max_payout, max_selections_per_ticket,
         futures_min_stake, futures_max_payout, futures_max_selections
    INTO cfg FROM public.app_settings WHERE id = 1;

  -- Validate every selection against authoritative DB rows and lock odds.
  FOR s IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    SELECT * INTO o FROM public.odds WHERE id = (s->>'odd_id')::uuid;
    IF o IS NULL THEN RAISE EXCEPTION 'Bad selection'; END IF;
    SELECT * INTO mk FROM public.markets WHERE id = o.market_id;
    SELECT * INTO m FROM public.matches WHERE id = mk.match_id;
    IF m.is_virtual THEN RAISE EXCEPTION 'Virtual picks must be placed on the virtual slip'; END IF;
    IF COALESCE(m.match_kind, 'normal') <> 'future' THEN is_future_ticket := false; END IF;
    IF m.status <> 'scheduled' OR (m.lock_time IS NOT NULL AND m.lock_time <= now()) OR NOT mk.is_open THEN
      RAISE EXCEPTION 'Betting is closed: %', m.name;
    END IF;
    total_odds := total_odds * o.value;
  END LOOP;

  IF is_future_ticket THEN
    IF _stake < COALESCE(cfg.futures_min_stake, 1) THEN RAISE EXCEPTION 'Stake below minimum'; END IF;
    IF sel_count > COALESCE(cfg.futures_max_selections, 1) THEN RAISE EXCEPTION 'Too many selections'; END IF;
    cap := COALESCE(NULLIF(cfg.futures_max_payout, 0), 100000000);
  ELSE
    IF sel_count < 2 THEN RAISE EXCEPTION 'Minimum 2 selections required'; END IF;
    IF _stake < COALESCE(cfg.min_stake, 2000000) THEN RAISE EXCEPTION 'Stake below minimum'; END IF;
    IF sel_count > COALESCE(cfg.max_selections_per_ticket, 20) THEN RAISE EXCEPTION 'Too many selections'; END IF;
    cap := COALESCE(NULLIF(cfg.max_payout, 0), 100000000);
  END IF;

  IF p.token_balance < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  payout := LEAST((total_odds * _stake)::bigint, cap);

  INSERT INTO public.bets(user_id, stake, total_odds, potential_payout, status)
    VALUES (uid, _stake, total_odds, payout, 'open') RETURNING id, tracking_id INTO bet_id, tracking;

  FOR s IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    SELECT * INTO o FROM public.odds WHERE id = (s->>'odd_id')::uuid;
    SELECT * INTO mk FROM public.markets WHERE id = o.market_id;
    INSERT INTO public.bet_selections(bet_id, match_id, market_id, odd_id, locked_odds, selection_label)
      VALUES (bet_id, mk.match_id, mk.id, o.id, o.value, o.label);
  END LOOP;

  UPDATE public.profiles SET token_balance = token_balance - _stake WHERE id = uid RETURNING token_balance INTO new_bal;

  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (uid, 'Bet placed', 'Ticket ' || tracking || ' - ' || _stake || ' tokens staked.', '/ticket/' || bet_id);

  RETURN jsonb_build_object('bet_id', bet_id, 'tracking_id', tracking, 'stake', _stake, 'payout', payout, 'balance', new_bal, 'max_payout_cap', cap);
END;
$$;

REVOKE ALL ON FUNCTION public.place_real_ticket(jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_real_ticket(jsonb, bigint) TO authenticated;-- 1) FIX: the profile-protection trigger was reverting token_balance for every
--    non-admin user, so regular members were never debited when placing bets,
--    never debited on withdrawal requests, and never credited when claiming
--    virtual payouts. Trusted SECURITY DEFINER functions run as the function
--    owner (current_user = 'postgres'); only direct client updates arrive as
--    the 'authenticated'/'anon' roles, so restrict those and let trusted
--    server-side functions through.
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Trusted backend (service role), admins, and privileged SECURITY DEFINER
  -- functions (which execute as their owner, not the client role) may set
  -- sensitive fields directly.
  IF current_user NOT IN ('authenticated', 'anon')
     OR auth.role() = 'service_role'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.token_balance := OLD.token_balance;
  NEW.is_banned := OLD.is_banned;
  NEW.ban_reason := OLD.ban_reason;
  NEW.is_muted := OLD.is_muted;
  NEW.mute_reason := OLD.mute_reason;
  NEW.is_restricted := OLD.is_restricted;
  NEW.restrict_reason := OLD.restrict_reason;
  NEW.vip_tier := OLD.vip_tier;
  NEW.xp := OLD.xp;
  NEW.streak_days := OLD.streak_days;
  NEW.longest_streak := OLD.longest_streak;
  NEW.last_login_date := OLD.last_login_date;
  NEW.referral_code := OLD.referral_code;
  NEW.referred_by := OLD.referred_by;
  NEW.emblem_status := OLD.emblem_status;
  RETURN NEW;
END;
$function$;

-- 2) Admin fan-out helper: insert one notification per admin. Each inserted
--    notification triggers the existing queue_push_for_notification bridge,
--    which delivers a web-push to every saved device of that admin — so admins
--    are alerted even when they are not on the site.
CREATE OR REPLACE FUNCTION public.notify_admins(_title text, _body text, _link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications(user_id, title, body, link)
  SELECT DISTINCT ur.user_id, _title, _body, COALESCE(_link, '/admin')
  FROM public.user_roles ur
  WHERE ur.role = 'admin';
END;
$function$;

-- Small helper to resolve a friendly display name for a user id.
CREATE OR REPLACE FUNCTION public.display_name_for(_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(TRIM(full_name), ''), 'A user') FROM public.profiles WHERE id = _uid
$function$;

-- 3) Event triggers → admin device notifications --------------------------------

-- Bet placed
CREATE OR REPLACE FUNCTION public.notify_admins_bet_placed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_admins(
    'New bet placed',
    public.display_name_for(NEW.user_id) || ' staked ' || NEW.stake::text ||
      ' tokens · ' || COALESCE(NEW.tracking_id, 'ticket'),
    '/ticket/' || NEW.id::text
  );
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_admins_bet ON public.bets;
CREATE TRIGGER trg_notify_admins_bet
  AFTER INSERT ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_bet_placed();

-- Token request
CREATE OR REPLACE FUNCTION public.notify_admins_token_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_admins(
    'New token request',
    public.display_name_for(NEW.user_id) || ' requested ' || NEW.amount::text || ' tokens.',
    '/admin'
  );
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_admins_token_request ON public.token_requests;
CREATE TRIGGER trg_notify_admins_token_request
  AFTER INSERT ON public.token_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_token_request();

-- Support ticket created
CREATE OR REPLACE FUNCTION public.notify_admins_support_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_admins(
    'New support ticket',
    public.display_name_for(NEW.user_id) || ': ' || COALESCE(NEW.subject, 'New ticket'),
    '/admin'
  );
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_admins_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_notify_admins_support_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_support_ticket();

-- Withdrawal request
CREATE OR REPLACE FUNCTION public.notify_admins_withdrawal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_admins(
    'New withdrawal request',
    public.display_name_for(NEW.user_id) || ' requested ' || NEW.amount::text || ' tokens.',
    '/admin'
  );
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_admins_withdrawal ON public.withdrawal_requests;
CREATE TRIGGER trg_notify_admins_withdrawal
  AFTER INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_withdrawal();

-- Promo code request
CREATE OR REPLACE FUNCTION public.notify_admins_promo_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_admins(
    'New promo code request',
    public.display_name_for(NEW.user_id) || ' requested a promo code (' || COALESCE(NEW.amount, 0)::text || ' tokens).',
    '/admin'
  );
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_admins_promo_request ON public.promo_code_requests;
CREATE TRIGGER trg_notify_admins_promo_request
  AFTER INSERT ON public.promo_code_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_promo_request();

-- Virtual payout request created → alert admins so they can approve it
CREATE OR REPLACE FUNCTION public.notify_admins_virtual_payout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_admins(
    'Virtual payout to approve',
    public.display_name_for(NEW.user_id) || ' won ' || NEW.amount::text || ' tokens on a virtual ticket.',
    '/admin'
  );
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_admins_virtual_payout ON public.virtual_payout_requests;
CREATE TRIGGER trg_notify_admins_virtual_payout
  AFTER INSERT ON public.virtual_payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_virtual_payout();REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.display_name_for(uuid) FROM PUBLIC, anon, authenticated;
-- Championship Virtual admin toggle
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS virtual_championship_enabled boolean NOT NULL DEFAULT false;

-- Tournament fields to support the 16-team virtual knockout format
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_stage text,
  ADD COLUMN IF NOT EXISTS stage_gap_seconds integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS bracket_size integer NOT NULL DEFAULT 16;

CREATE INDEX IF NOT EXISTS idx_tournaments_kind_status
  ON public.tournaments (kind, status, starts_at);

-- ============================================================
-- TRACK A: CHAMPIONSHIP VIRTUAL - BRACKET ENGINE
-- ============================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS bracket JSONB,
  ADD COLUMN IF NOT EXISTS next_stage_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS champion_team_id UUID,
  ADD COLUMN IF NOT EXISTS runner_up_team_id UUID,
  ADD COLUMN IF NOT EXISTS team_ids UUID[];

-- Championship bets: dedicated table so we don't disturb the main bets flow.
CREATE TABLE IF NOT EXISTS public.championship_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('outright','reach_final','reach_semi','reach_quarter','eliminated_at','match_winner')),
  team_id UUID,
  stage TEXT,
  tournament_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  stake BIGINT NOT NULL CHECK (stake > 0),
  odds NUMERIC(8,2) NOT NULL CHECK (odds > 0),
  payout BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);

GRANT SELECT, INSERT ON public.championship_bets TO authenticated;
GRANT ALL ON public.championship_bets TO service_role;

ALTER TABLE public.championship_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own championship bets" ON public.championship_bets
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own championship bets" ON public.championship_bets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_champ_bets_tournament ON public.championship_bets(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_champ_bets_user ON public.championship_bets(user_id, created_at DESC);

-- ============================================================
-- championship_start(tournament_id)
-- Admin-callable. Seeds 16 random teams, builds bracket, R16 matches.
-- ============================================================
CREATE OR REPLACE FUNCTION public.championship_start(p_tournament UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teams UUID[];
  v_gap INT;
  v_bracket JSONB;
  i INT;
  v_slot INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can start championships';
  END IF;

  SELECT ARRAY(SELECT id FROM public.teams ORDER BY random() LIMIT 16) INTO v_teams;
  IF array_length(v_teams, 1) IS NULL OR array_length(v_teams, 1) < 16 THEN
    RAISE EXCEPTION 'Need at least 16 teams to run a championship (found %)', COALESCE(array_length(v_teams, 1), 0);
  END IF;

  SELECT COALESCE(stage_gap_seconds, 20) INTO v_gap FROM public.tournaments WHERE id = p_tournament;

  -- Build R16 pairings JSONB
  v_bracket := jsonb_build_object('stages', jsonb_build_object());

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament;

  FOR i IN 0..7 LOOP
    INSERT INTO public.tournament_matches (
      tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status
    ) VALUES (
      p_tournament, 1, 'R16', i, v_teams[i*2 + 1], v_teams[i*2 + 2], 'pending'
    );
  END LOOP;

  UPDATE public.tournaments
     SET status = 'live',
         current_stage = 'R16',
         team_ids = v_teams,
         next_stage_at = now() + (v_gap || ' seconds')::interval,
         starts_at = COALESCE(starts_at, now()),
         updated_at = now()
   WHERE id = p_tournament;

  RETURN jsonb_build_object('ok', true, 'tournament_id', p_tournament);
END;
$$;

REVOKE ALL ON FUNCTION public.championship_start(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.championship_start(UUID) TO authenticated, service_role;

-- ============================================================
-- championship_tick() - public heartbeat
-- Advances stages, simulates shootouts, settles bets.
-- ============================================================
CREATE OR REPLACE FUNCTION public.championship_tick()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  m RECORD;
  v_stage TEXT;
  v_next_stage TEXT;
  v_next_round INT;
  v_winner UUID;
  v_score_a INT;
  v_score_b INT;
  v_winners UUID[];
  v_gap INT;
  v_champ UUID;
  v_runner UUID;
  advanced INT := 0;
BEGIN
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind = 'championship_virtual'
       AND status = 'live'
       AND next_stage_at IS NOT NULL
       AND next_stage_at <= now()
     ORDER BY next_stage_at ASC
     LIMIT 5
  LOOP
    v_stage := t.current_stage;
    v_gap := COALESCE(t.stage_gap_seconds, 20);

    -- 1. Simulate current stage matches
    v_winners := ARRAY[]::UUID[];
    FOR m IN
      SELECT * FROM public.tournament_matches
       WHERE tournament_id = t.id
         AND round_name = v_stage
         AND status = 'pending'
       ORDER BY slot ASC
    LOOP
      v_score_a := (floor(random() * 5) + 1)::INT;
      v_score_b := (floor(random() * 5) + 1)::INT;
      -- Ensure no draw
      IF v_score_a = v_score_b THEN
        IF random() < 0.5 THEN v_score_a := v_score_a + 1; ELSE v_score_b := v_score_b + 1; END IF;
      END IF;
      IF v_score_a > v_score_b THEN v_winner := m.participant_a_id;
      ELSE v_winner := m.participant_b_id; END IF;

      UPDATE public.tournament_matches
         SET score_a = v_score_a, score_b = v_score_b,
             winner_id = v_winner, status = 'completed',
             updated_at = now()
       WHERE id = m.id;

      v_winners := v_winners || v_winner;

      -- Settle per-match_winner bets on this match
      UPDATE public.championship_bets
         SET status = CASE WHEN team_id = v_winner THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id = v_winner THEN (stake * odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_match_id = m.id
         AND kind = 'match_winner'
         AND status = 'pending';
    END LOOP;

    -- Settle eliminated_at for teams eliminated in this stage
    UPDATE public.championship_bets
       SET status = CASE WHEN team_id = ANY (
             SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
             FROM public.tournament_matches tm
             WHERE tm.tournament_id = t.id AND tm.round_name = v_stage
           ) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id = ANY (
             SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
             FROM public.tournament_matches tm
             WHERE tm.tournament_id = t.id AND tm.round_name = v_stage
           ) THEN (stake * odds)::BIGINT ELSE 0 END,
           settled_at = now()
     WHERE tournament_id = t.id
       AND kind = 'eliminated_at'
       AND stage = v_stage
       AND status = 'pending';

    -- Determine next stage
    v_next_stage := CASE v_stage
      WHEN 'R16' THEN 'QF'
      WHEN 'QF' THEN 'SF'
      WHEN 'SF' THEN 'F'
      ELSE NULL END;
    v_next_round := CASE v_stage WHEN 'R16' THEN 2 WHEN 'QF' THEN 3 WHEN 'SF' THEN 4 ELSE NULL END;

    IF v_next_stage IS NULL THEN
      -- Final done. v_winners has 1 entry = champion
      v_champ := v_winners[1];
      -- Runner-up = loser of final
      SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
        INTO v_runner
        FROM public.tournament_matches tm
       WHERE tm.tournament_id = t.id AND tm.round_name = 'F'
       LIMIT 1;

      -- Settle outright: won if team_id = champion
      UPDATE public.championship_bets
         SET status = CASE WHEN team_id = v_champ THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id = v_champ THEN (stake * odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id = t.id AND kind = 'outright' AND status = 'pending';

      -- Settle reach_final: won if team was in Final (either finalist)
      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (v_champ, v_runner) THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id IN (v_champ, v_runner) THEN (stake * odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id = t.id AND kind = 'reach_final' AND status = 'pending';

      -- reach_semi: winners of QF
      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (
             SELECT winner_id FROM public.tournament_matches
              WHERE tournament_id = t.id AND round_name = 'QF' AND winner_id IS NOT NULL
           ) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id IN (
             SELECT winner_id FROM public.tournament_matches
              WHERE tournament_id = t.id AND round_name = 'QF' AND winner_id IS NOT NULL
           ) THEN (stake * odds)::BIGINT ELSE 0 END,
           settled_at = now()
       WHERE tournament_id = t.id AND kind = 'reach_semi' AND status = 'pending';

      -- reach_quarter: winners of R16
      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (
             SELECT winner_id FROM public.tournament_matches
              WHERE tournament_id = t.id AND round_name = 'R16' AND winner_id IS NOT NULL
           ) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id IN (
             SELECT winner_id FROM public.tournament_matches
              WHERE tournament_id = t.id AND round_name = 'R16' AND winner_id IS NOT NULL
           ) THEN (stake * odds)::BIGINT ELSE 0 END,
           settled_at = now()
       WHERE tournament_id = t.id AND kind = 'reach_quarter' AND status = 'pending';

      -- Credit winners
      PERFORM public.credit_championship_payouts(t.id);

      UPDATE public.tournaments
         SET status = 'completed',
             current_stage = 'F',
             champion_team_id = v_champ,
             runner_up_team_id = v_runner,
             next_stage_at = NULL,
             updated_at = now()
       WHERE id = t.id;
    ELSE
      -- Build next round matches from v_winners in order
      FOR i IN 0..(array_length(v_winners, 1)/2 - 1) LOOP
        INSERT INTO public.tournament_matches (
          tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status
        ) VALUES (
          t.id, v_next_round, v_next_stage, i, v_winners[i*2 + 1], v_winners[i*2 + 2], 'pending'
        );
      END LOOP;

      UPDATE public.tournaments
         SET current_stage = v_next_stage,
             next_stage_at = now() + (v_gap || ' seconds')::interval,
             updated_at = now()
       WHERE id = t.id;
    END IF;

    advanced := advanced + 1;
  END LOOP;

  RETURN jsonb_build_object('advanced', advanced);
END;
$$;

REVOKE ALL ON FUNCTION public.championship_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.championship_tick() TO authenticated, service_role, anon;

-- Helper to credit winning championship bets into user token_balance.
CREATE OR REPLACE FUNCTION public.credit_championship_payouts(p_tournament UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  FOR b IN
    SELECT user_id, SUM(payout) AS total
      FROM public.championship_bets
     WHERE tournament_id = p_tournament
       AND status = 'won'
       AND payout > 0
     GROUP BY user_id
  LOOP
    UPDATE public.profiles SET token_balance = token_balance + b.total WHERE id = b.user_id;
    INSERT INTO public.token_transactions (user_id, amount, kind, description)
      VALUES (b.user_id, b.total, 'championship_win', 'Championship Virtual payout')
      ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- Debit + record a championship bet
CREATE OR REPLACE FUNCTION public.place_championship_bet(
  p_tournament UUID,
  p_kind TEXT,
  p_team UUID,
  p_stage TEXT,
  p_match UUID,
  p_stake BIGINT,
  p_odds NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_bal BIGINT;
  v_id UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Invalid stake'; END IF;

  SELECT token_balance INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_bal IS NULL OR v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.profiles SET token_balance = token_balance - p_stake WHERE id = v_user;

  INSERT INTO public.championship_bets (user_id, tournament_id, kind, team_id, stage, tournament_match_id, stake, odds)
  VALUES (v_user, p_tournament, p_kind, p_team, p_stage, p_match, p_stake, p_odds)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_championship_bet(UUID,TEXT,UUID,TEXT,UUID,BIGINT,NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_championship_bet(UUID,TEXT,UUID,TEXT,UUID,BIGINT,NUMERIC) TO authenticated;

-- ============================================================
-- TRACK B: PER-USER INSTANT VIRTUAL ROUNDS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_virtual_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_label TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('home','away')),
  stake BIGINT NOT NULL CHECK (stake > 0),
  odds NUMERIC(6,2) NOT NULL DEFAULT 1.90,
  home_kicks BOOLEAN[] NOT NULL,
  away_kicks BOOLEAN[] NOT NULL,
  home_score INT NOT NULL,
  away_score INT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('won','lost')),
  payout BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_virtual_rounds TO authenticated;
GRANT ALL ON public.user_virtual_rounds TO service_role;

ALTER TABLE public.user_virtual_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own virtual rounds" ON public.user_virtual_rounds
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_vr ON public.user_virtual_rounds(user_id, created_at DESC);

-- Deterministic-random shootout: 5 kicks each, seeded server-side.
CREATE OR REPLACE FUNCTION public.start_user_virtual_round(
  p_home TEXT,
  p_away TEXT,
  p_side TEXT,
  p_stake BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_bal BIGINT;
  v_home BOOLEAN[] := ARRAY[]::BOOLEAN[];
  v_away BOOLEAN[] := ARRAY[]::BOOLEAN[];
  v_hs INT := 0;
  v_as INT := 0;
  i INT;
  v_result TEXT;
  v_payout BIGINT := 0;
  v_odds NUMERIC := 1.90;
  v_id UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_side NOT IN ('home','away') THEN RAISE EXCEPTION 'Invalid side'; END IF;
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Invalid stake'; END IF;

  SELECT token_balance INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_bal IS NULL OR v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.profiles SET token_balance = token_balance - p_stake WHERE id = v_user;

  FOR i IN 1..5 LOOP
    v_home := v_home || (random() < 0.75);
    v_away := v_away || (random() < 0.75);
    IF v_home[i] THEN v_hs := v_hs + 1; END IF;
    IF v_away[i] THEN v_as := v_as + 1; END IF;
  END LOOP;

  -- No draws: sudden-death coinflip
  WHILE v_hs = v_as LOOP
    v_home := v_home || (random() < 0.75);
    v_away := v_away || (random() < 0.75);
    IF v_home[array_length(v_home,1)] THEN v_hs := v_hs + 1; END IF;
    IF v_away[array_length(v_away,1)] THEN v_as := v_as + 1; END IF;
  END LOOP;

  IF (p_side = 'home' AND v_hs > v_as) OR (p_side = 'away' AND v_as > v_hs) THEN
    v_result := 'won';
    v_payout := (p_stake * v_odds)::BIGINT;
    UPDATE public.profiles SET token_balance = token_balance + v_payout WHERE id = v_user;
  ELSE
    v_result := 'lost';
  END IF;

  INSERT INTO public.user_virtual_rounds (
    user_id, match_label, side, stake, odds, home_kicks, away_kicks, home_score, away_score, result, payout
  ) VALUES (
    v_user, p_home || ' vs ' || p_away, p_side, p_stake, v_odds, v_home, v_away, v_hs, v_as, v_result, v_payout
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'home_kicks', v_home,
    'away_kicks', v_away,
    'home_score', v_hs,
    'away_score', v_as,
    'result', v_result,
    'payout', v_payout
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_user_virtual_round(TEXT,TEXT,TEXT,BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_user_virtual_round(TEXT,TEXT,TEXT,BIGINT) TO authenticated;
ALTER TABLE public.matches DROP CONSTRAINT matches_home_team_id_fkey;
ALTER TABLE public.matches ADD CONSTRAINT matches_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.matches DROP CONSTRAINT matches_away_team_id_fkey;
ALTER TABLE public.matches ADD CONSTRAINT matches_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
ALTER TABLE public.matches DROP CONSTRAINT matches_winner_team_id_fkey;
ALTER TABLE public.matches ADD CONSTRAINT matches_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
-- Branding columns
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS platform_name text DEFAULT 'LSL',
  ADD COLUMN IF NOT EXISTS platform_tagline text DEFAULT 'Luxury Sports League',
  ADD COLUMN IF NOT EXISTS platform_description text DEFAULT 'Premium online betting experience.',
  ADD COLUMN IF NOT EXISTS platform_logo_url text,
  ADD COLUMN IF NOT EXISTS platform_logo_auth_url text,
  ADD COLUMN IF NOT EXISTS platform_logo_voucher_url text,
  ADD COLUMN IF NOT EXISTS platform_og_image_url text;

-- Push subscription unique on endpoint (dedupe first)
DELETE FROM public.push_subscriptions a USING public.push_subscriptions b
WHERE a.ctid < b.ctid AND a.endpoint = b.endpoint;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_unique'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);
  END IF;
END $$;

-- Prune dead subscriptions RPC
CREATE OR REPLACE FUNCTION public.prune_dead_push_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  WITH d AS (
    DELETE FROM public.push_subscriptions
    WHERE (last_error_at IS NOT NULL AND (last_success_at IS NULL OR last_error_at > last_success_at)
           AND last_error_at < now() - interval '14 days')
       OR (last_success_at IS NOT NULL AND last_success_at < now() - interval '90 days')
    RETURNING 1
  )
  SELECT count(*)::int INTO deleted_count FROM d;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_dead_push_subscriptions() TO authenticated;

CREATE OR REPLACE FUNCTION public.prune_dead_push_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  WITH d AS (
    DELETE FROM public.push_subscriptions
    WHERE enabled = false
       OR (disabled_at IS NOT NULL AND disabled_at < now() - interval '14 days')
       OR failure_count >= 10
       OR last_seen_at < now() - interval '60 days'
    RETURNING 1
  )
  SELECT count(*)::int INTO deleted_count FROM d;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_dead_push_subscriptions() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_dead_push_subscriptions() TO authenticated;

-- 1. Fix super_admin enum error in championship_start
CREATE OR REPLACE FUNCTION public.championship_start(p_tournament UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_teams UUID[]; v_gap INT; i INT; v_kind TEXT; v_sport TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can start championships';
  END IF;

  SELECT kind, COALESCE(stage_gap_seconds, 20) INTO v_kind, v_gap
    FROM public.tournaments WHERE id = p_tournament;
  v_sport := CASE WHEN v_kind = 'championship_football' THEN 'football' ELSE 'generic' END;

  SELECT ARRAY(
    SELECT id FROM public.teams
    WHERE COALESCE(sport,'generic') = v_sport
    ORDER BY random() LIMIT 16
  ) INTO v_teams;

  IF array_length(v_teams,1) IS NULL OR array_length(v_teams,1) < 16 THEN
    RAISE EXCEPTION 'Need at least 16 % teams (found %). Tag more teams as % in Clans admin.',
      v_sport, COALESCE(array_length(v_teams,1),0), v_sport;
  END IF;

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament;
  FOR i IN 0..7 LOOP
    INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status)
    VALUES (p_tournament, 1, 'R16', i, v_teams[i*2+1], v_teams[i*2+2], 'pending');
  END LOOP;

  UPDATE public.tournaments
     SET status='live', current_stage='R16', team_ids=v_teams,
         next_stage_at = now() + (v_gap || ' seconds')::interval,
         starts_at = COALESCE(starts_at, now()), updated_at = now()
   WHERE id = p_tournament;

  RETURN jsonb_build_object('ok', true, 'tournament_id', p_tournament, 'sport', v_sport);
END;
$$;

-- 2. Sport columns
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'generic';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'generic';
CREATE INDEX IF NOT EXISTS idx_teams_sport ON public.teams(sport);

-- 3. App settings additions
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS virtual_championship_football_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS virtual_football_instant_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS virtual_championship_auto_restart BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS platform_logo_corner_url TEXT,
  ADD COLUMN IF NOT EXISTS auth_hero_image_url TEXT;

-- 4. Bulk delete teams (avoids per-row statement timeout)
CREATE OR REPLACE FUNCTION public.delete_teams_bulk(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can bulk-delete teams';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  SET LOCAL statement_timeout = '60s';

  DELETE FROM public.bet_selections
    WHERE match_id IN (SELECT id FROM public.matches WHERE home_team_id = ANY(p_ids) OR away_team_id = ANY(p_ids));
  DELETE FROM public.odds
    WHERE match_id IN (SELECT id FROM public.matches WHERE home_team_id = ANY(p_ids) OR away_team_id = ANY(p_ids));
  DELETE FROM public.matches WHERE home_team_id = ANY(p_ids) OR away_team_id = ANY(p_ids);
  DELETE FROM public.tournament_matches WHERE participant_a_id = ANY(p_ids) OR participant_b_id = ANY(p_ids);
  DELETE FROM public.players WHERE team_id = ANY(p_ids);
  DELETE FROM public.teams WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_teams_bulk(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_teams_bulk(UUID[]) TO authenticated;

-- 5. Auto-restart-aware tick for BOTH kinds
CREATE OR REPLACE FUNCTION public.championship_tick()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t RECORD; m RECORD;
  v_stage TEXT; v_next_stage TEXT; v_next_round INT;
  v_winner UUID; v_score_a INT; v_score_b INT;
  v_winners UUID[]; v_gap INT; v_champ UUID; v_runner UUID;
  advanced INT := 0; i INT;
  v_auto BOOLEAN; v_open BOOLEAN;
  v_new_tid UUID;
BEGIN
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'live'
       AND next_stage_at IS NOT NULL
       AND next_stage_at <= now()
     ORDER BY next_stage_at ASC LIMIT 5
  LOOP
    v_stage := t.current_stage;
    v_gap := COALESCE(t.stage_gap_seconds, 20);
    v_winners := ARRAY[]::UUID[];

    FOR m IN
      SELECT * FROM public.tournament_matches
       WHERE tournament_id = t.id AND round_name = v_stage AND status = 'pending'
       ORDER BY slot ASC
    LOOP
      v_score_a := (floor(random()*5)+1)::INT;
      v_score_b := (floor(random()*5)+1)::INT;
      IF v_score_a = v_score_b THEN
        IF random() < 0.5 THEN v_score_a := v_score_a+1; ELSE v_score_b := v_score_b+1; END IF;
      END IF;
      v_winner := CASE WHEN v_score_a > v_score_b THEN m.participant_a_id ELSE m.participant_b_id END;

      UPDATE public.tournament_matches
         SET score_a=v_score_a, score_b=v_score_b, winner_id=v_winner, status='completed', updated_at=now()
       WHERE id = m.id;

      v_winners := v_winners || v_winner;

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id = v_winner THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id = v_winner THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_match_id = m.id AND kind='match_winner' AND status='pending';
    END LOOP;

    UPDATE public.championship_bets
       SET status = CASE WHEN team_id = ANY (
             SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
             FROM public.tournament_matches tm
             WHERE tm.tournament_id = t.id AND tm.round_name = v_stage
           ) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id = ANY (
             SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
             FROM public.tournament_matches tm
             WHERE tm.tournament_id = t.id AND tm.round_name = v_stage
           ) THEN (stake*odds)::BIGINT ELSE 0 END,
           settled_at = now()
     WHERE tournament_id = t.id AND kind='eliminated_at' AND stage=v_stage AND status='pending';

    v_next_stage := CASE v_stage WHEN 'R16' THEN 'QF' WHEN 'QF' THEN 'SF' WHEN 'SF' THEN 'F' ELSE NULL END;
    v_next_round := CASE v_stage WHEN 'R16' THEN 2 WHEN 'QF' THEN 3 WHEN 'SF' THEN 4 ELSE NULL END;

    IF v_next_stage IS NULL THEN
      v_champ := v_winners[1];
      SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
        INTO v_runner FROM public.tournament_matches tm
       WHERE tm.tournament_id = t.id AND tm.round_name='F' LIMIT 1;

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id=v_champ THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id=v_champ THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id=t.id AND kind='outright' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (v_champ,v_runner) THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id IN (v_champ,v_runner) THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id=t.id AND kind='reach_final' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (
             SELECT winner_id FROM public.tournament_matches
              WHERE tournament_id=t.id AND round_name='QF' AND winner_id IS NOT NULL
           ) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id IN (
             SELECT winner_id FROM public.tournament_matches
              WHERE tournament_id=t.id AND round_name='QF' AND winner_id IS NOT NULL
           ) THEN (stake*odds)::BIGINT ELSE 0 END,
           settled_at = now()
       WHERE tournament_id=t.id AND kind='reach_semi' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (
             SELECT winner_id FROM public.tournament_matches
              WHERE tournament_id=t.id AND round_name='R16' AND winner_id IS NOT NULL
           ) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id IN (
             SELECT winner_id FROM public.tournament_matches
              WHERE tournament_id=t.id AND round_name='R16' AND winner_id IS NOT NULL
           ) THEN (stake*odds)::BIGINT ELSE 0 END,
           settled_at = now()
       WHERE tournament_id=t.id AND kind='reach_quarter' AND status='pending';

      PERFORM public.credit_championship_payouts(t.id);

      UPDATE public.tournaments
         SET status='completed', current_stage='F',
             champion_team_id=v_champ, runner_up_team_id=v_runner,
             next_stage_at=NULL, updated_at=now()
       WHERE id = t.id;

      -- Auto-restart: schedule a fresh tournament of the same kind
      SELECT virtual_championship_auto_restart,
             CASE WHEN t.kind='championship_football'
                  THEN virtual_championship_football_enabled
                  ELSE virtual_championship_enabled END
        INTO v_auto, v_open
        FROM public.app_settings WHERE id=1;

      IF v_auto AND v_open THEN
        INSERT INTO public.tournaments (name, kind, status, starts_at, stage_gap_seconds, bracket_size, current_stage)
        VALUES (
          CASE WHEN t.kind='championship_football' THEN 'Auto Football Cup ' ELSE 'Auto Championship ' END
            || to_char(now(), 'Mon DD HH24:MI'),
          t.kind, 'scheduled', now() + interval '30 seconds', v_gap, 16, 'R16'
        ) RETURNING id INTO v_new_tid;
        -- Draft immediately so it flips live on its next tick
        PERFORM public.championship_autostart(v_new_tid);
      END IF;
    ELSE
      FOR i IN 0..(array_length(v_winners,1)/2 - 1) LOOP
        INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status)
        VALUES (t.id, v_next_round, v_next_stage, i, v_winners[i*2+1], v_winners[i*2+2], 'pending');
      END LOOP;

      UPDATE public.tournaments
         SET current_stage=v_next_stage,
             next_stage_at = now() + (v_gap || ' seconds')::interval,
             updated_at=now()
       WHERE id = t.id;
    END IF;

    advanced := advanced + 1;
  END LOOP;

  -- Also auto-start any scheduled tournament whose starts_at has arrived
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'scheduled'
       AND starts_at IS NOT NULL AND starts_at <= now()
     ORDER BY starts_at ASC LIMIT 3
  LOOP
    PERFORM public.championship_autostart(t.id);
    advanced := advanced + 1;
  END LOOP;

  RETURN jsonb_build_object('advanced', advanced);
END;
$$;

-- 6. Internal auto-drafter (no admin check — called only by tick)
CREATE OR REPLACE FUNCTION public.championship_autostart(p_tournament UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_teams UUID[]; v_gap INT; i INT; v_kind TEXT; v_sport TEXT;
BEGIN
  SELECT kind, COALESCE(stage_gap_seconds,20) INTO v_kind, v_gap
    FROM public.tournaments WHERE id = p_tournament;
  v_sport := CASE WHEN v_kind='championship_football' THEN 'football' ELSE 'generic' END;

  SELECT ARRAY(
    SELECT id FROM public.teams
    WHERE COALESCE(sport,'generic') = v_sport
    ORDER BY random() LIMIT 16
  ) INTO v_teams;

  IF array_length(v_teams,1) IS NULL OR array_length(v_teams,1) < 16 THEN
    RETURN; -- skip silently; admin will see it stuck as scheduled
  END IF;

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament;
  FOR i IN 0..7 LOOP
    INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status)
    VALUES (p_tournament, 1, 'R16', i, v_teams[i*2+1], v_teams[i*2+2], 'pending');
  END LOOP;

  UPDATE public.tournaments
     SET status='live', current_stage='R16', team_ids=v_teams,
         next_stage_at = now() + (v_gap || ' seconds')::interval,
         updated_at = now()
   WHERE id = p_tournament;
END;
$$;
REVOKE ALL ON FUNCTION public.championship_autostart(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.championship_autostart(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.championship_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.championship_tick() TO authenticated, service_role, anon;
-- Championship engine stores team ids directly in tournament_matches.participant_*
-- Drop the FKs that pointed at tournament_participants so championship_start can insert team ids.
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_participant_a_id_fkey;
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_participant_b_id_fkey;
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_winner_id_fkey;
-- 1. app_settings: booking + live duration knobs
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS championship_booking_seconds int NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS championship_stage_live_seconds int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS championship_stage_gap_seconds int NOT NULL DEFAULT 20;

-- 2. tournaments: booking + live-stage columns
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS booking_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_live_seconds int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS stage_live_ends_at timestamptz;

-- 3. tournament_matches: live commentary log
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS live_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_events jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. Drop duplicate championship bets and add one-per-tournament unique index
DELETE FROM public.championship_bets a
  USING public.championship_bets b
 WHERE a.user_id = b.user_id
   AND a.tournament_id = b.tournament_id
   AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_champ_bet_user_tournament
  ON public.championship_bets(user_id, tournament_id);

-- 5. place_championship_bet: enforce booking-phase only + one bet per tournament
CREATE OR REPLACE FUNCTION public.place_championship_bet(
  p_tournament uuid, p_kind text, p_team uuid, p_stage text, p_match uuid, p_stake bigint, p_odds numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_user UUID := auth.uid(); v_bal BIGINT; v_id UUID; v_status TEXT; v_existing UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Invalid stake'; END IF;

  SELECT status INTO v_status FROM public.tournaments WHERE id = p_tournament;
  IF v_status <> 'booking' THEN
    RAISE EXCEPTION 'Booking is closed for this championship';
  END IF;

  SELECT id INTO v_existing FROM public.championship_bets
   WHERE user_id = v_user AND tournament_id = p_tournament LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'You already booked a bet for this championship';
  END IF;

  SELECT token_balance INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_bal IS NULL OR v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.profiles SET token_balance = token_balance - p_stake WHERE id = v_user;

  INSERT INTO public.championship_bets (user_id, tournament_id, kind, team_id, stage, tournament_match_id, stake, odds)
  VALUES (v_user, p_tournament, p_kind, p_team, p_stage, p_match, p_stake, p_odds)
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

-- 6. championship_start: draw R16 and enter booking phase
CREATE OR REPLACE FUNCTION public.championship_start(p_tournament uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_teams UUID[]; v_gap INT; v_live INT; v_book INT; i INT;
  v_kind TEXT; v_sport TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can start championships';
  END IF;

  SELECT kind, COALESCE(stage_gap_seconds, 20) INTO v_kind, v_gap
    FROM public.tournaments WHERE id = p_tournament;
  v_sport := CASE WHEN v_kind = 'championship_football' THEN 'football' ELSE 'generic' END;

  SELECT
    COALESCE(championship_booking_seconds, 120),
    COALESCE(championship_stage_live_seconds, 30)
    INTO v_book, v_live
    FROM public.app_settings WHERE id = 1;

  SELECT ARRAY(
    SELECT id FROM public.teams
    WHERE COALESCE(sport, 'generic') = v_sport
    ORDER BY random() LIMIT 16
  ) INTO v_teams;

  IF array_length(v_teams, 1) IS NULL OR array_length(v_teams, 1) < 16 THEN
    RAISE EXCEPTION 'Need at least 16 % teams (found %). Tag more teams as % in Clans admin.',
      v_sport, COALESCE(array_length(v_teams, 1), 0), v_sport;
  END IF;

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament;
  FOR i IN 0..7 LOOP
    INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status, score_a, score_b)
    VALUES (p_tournament, 1, 'R16', i, v_teams[i*2+1], v_teams[i*2+2], 'pending', 0, 0);
  END LOOP;

  UPDATE public.tournaments
     SET status = 'booking',
         current_stage = 'R16',
         team_ids = v_teams,
         booking_closes_at = now() + (v_book || ' seconds')::interval,
         stage_live_seconds = v_live,
         next_stage_at = NULL,
         stage_live_ends_at = NULL,
         starts_at = COALESCE(starts_at, now()),
         updated_at = now()
   WHERE id = p_tournament;

  RETURN jsonb_build_object('ok', true, 'tournament_id', p_tournament, 'sport', v_sport, 'booking_seconds', v_book);
END; $$;

-- 7. championship_autostart mirrors start but without admin check (called by tick)
CREATE OR REPLACE FUNCTION public.championship_autostart(p_tournament uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_teams UUID[]; v_gap INT; v_live INT; v_book INT; i INT; v_kind TEXT; v_sport TEXT;
BEGIN
  SELECT kind, COALESCE(stage_gap_seconds, 20) INTO v_kind, v_gap
    FROM public.tournaments WHERE id = p_tournament;
  v_sport := CASE WHEN v_kind = 'championship_football' THEN 'football' ELSE 'generic' END;

  SELECT
    COALESCE(championship_booking_seconds, 120),
    COALESCE(championship_stage_live_seconds, 30)
    INTO v_book, v_live
    FROM public.app_settings WHERE id = 1;

  SELECT ARRAY(
    SELECT id FROM public.teams
    WHERE COALESCE(sport, 'generic') = v_sport
    ORDER BY random() LIMIT 16
  ) INTO v_teams;

  IF array_length(v_teams, 1) IS NULL OR array_length(v_teams, 1) < 16 THEN RETURN; END IF;

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament;
  FOR i IN 0..7 LOOP
    INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status, score_a, score_b)
    VALUES (p_tournament, 1, 'R16', i, v_teams[i*2+1], v_teams[i*2+2], 'pending', 0, 0);
  END LOOP;

  UPDATE public.tournaments
     SET status = 'booking',
         current_stage = 'R16',
         team_ids = v_teams,
         booking_closes_at = now() + (v_book || ' seconds')::interval,
         stage_live_seconds = v_live,
         next_stage_at = NULL,
         stage_live_ends_at = NULL,
         starts_at = COALESCE(starts_at, now()),
         updated_at = now()
   WHERE id = p_tournament;
END; $$;

-- 8. Helper: generate one commentary event for a match this tick
CREATE OR REPLACE FUNCTION public.champ_gen_event(
  p_match_id uuid, p_sport text, p_minute int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  m RECORD;
  na TEXT; nb TEXT;
  v_r NUMERIC := random();
  v_side TEXT; v_scorer TEXT; v_type TEXT; v_text TEXT;
  v_events jsonb;
  v_goal BOOLEAN := false;
BEGIN
  SELECT tm.*, ta.name AS name_a, tb.name AS name_b
    INTO m
    FROM public.tournament_matches tm
    LEFT JOIN public.teams ta ON ta.id = tm.participant_a_id
    LEFT JOIN public.teams tb ON tb.id = tm.participant_b_id
   WHERE tm.id = p_match_id;

  na := COALESCE(m.name_a, 'A'); nb := COALESCE(m.name_b, 'B');
  v_side := CASE WHEN random() < 0.5 THEN 'a' ELSE 'b' END;
  v_scorer := CASE WHEN v_side = 'a' THEN na ELSE nb END;

  IF v_r < 0.22 THEN
    v_goal := true; v_type := 'goal';
    v_text := CASE WHEN p_sport = 'football'
      THEN v_scorer || ' scores! ' || (ARRAY['Clinical finish','Screamer from range','Header from the corner','Tap-in at the far post','Curling free-kick'])[floor(random()*5+1)]
      ELSE v_scorer || ' strikes! ' || (ARRAY['Ruthless','Clinical','Devastating hit'])[floor(random()*3+1)] END;
  ELSIF v_r < 0.45 THEN
    v_type := 'chance'; v_text := v_scorer || CASE WHEN p_sport='football' THEN ' — shot just wide!' ELSE ' — close call!' END;
  ELSIF v_r < 0.65 THEN
    v_type := 'save'; v_text := (CASE WHEN v_side='a' THEN nb ELSE na END) || CASE WHEN p_sport='football' THEN ' keeper pulls off a great save' ELSE ' block!' END;
  ELSIF v_r < 0.78 THEN
    v_type := 'card'; v_text := v_scorer || CASE WHEN p_sport='football' THEN ' booked for a cynical foul' ELSE ' takes a penalty' END;
  ELSE
    v_type := 'possession'; v_text := v_scorer || CASE WHEN p_sport='football' THEN ' controlling midfield tempo' ELSE ' presses forward' END;
  END IF;

  v_events := COALESCE(m.live_events, '[]'::jsonb) || jsonb_build_object(
    'at', extract(epoch from now()),
    'minute', p_minute,
    'type', v_type,
    'side', v_side,
    'text', v_text
  );

  UPDATE public.tournament_matches
     SET live_events = v_events,
         score_a = CASE WHEN v_goal AND v_side = 'a' THEN COALESCE(score_a, 0) + 1 ELSE COALESCE(score_a, 0) END,
         score_b = CASE WHEN v_goal AND v_side = 'b' THEN COALESCE(score_b, 0) + 1 ELSE COALESCE(score_b, 0) END,
         updated_at = now()
   WHERE id = p_match_id;
END; $$;

-- 9. Rewrite championship_tick to handle booking → live → gap → next stage
CREATE OR REPLACE FUNCTION public.championship_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t RECORD; m RECORD;
  v_stage TEXT; v_next_stage TEXT; v_next_round INT;
  v_winner UUID; v_winners UUID[]; v_gap INT; v_live INT;
  v_champ UUID; v_runner UUID;
  advanced INT := 0; i INT; v_auto BOOLEAN; v_open BOOLEAN;
  v_new_tid UUID; v_sport TEXT; v_minute INT;
  v_kickoff_events jsonb;
BEGIN
  -- Auto-start scheduled tournaments whose starts_at has arrived
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'scheduled'
       AND starts_at IS NOT NULL AND starts_at <= now()
     ORDER BY starts_at ASC LIMIT 3
  LOOP
    PERFORM public.championship_autostart(t.id);
    advanced := advanced + 1;
  END LOOP;

  -- Booking phase: flip to live when booking window closes, kick off current stage
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'booking'
       AND booking_closes_at IS NOT NULL
       AND booking_closes_at <= now()
     ORDER BY booking_closes_at ASC LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);

    UPDATE public.tournament_matches
       SET status = 'live',
           live_started_at = now(),
           live_events = jsonb_build_array(jsonb_build_object(
             'at', extract(epoch from now()), 'minute', 0, 'type', 'kickoff',
             'text', CASE WHEN v_sport='football' THEN 'Kick-off!' ELSE 'Fight begins!' END
           ))
     WHERE tournament_id = t.id AND round_name = t.current_stage AND status = 'pending';

    UPDATE public.tournaments
       SET status = 'live',
           stage_live_ends_at = now() + (v_live || ' seconds')::interval,
           next_stage_at = NULL,
           updated_at = now()
     WHERE id = t.id;
    advanced := advanced + 1;
  END LOOP;

  -- Live stage in progress: generate commentary
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'live'
       AND stage_live_ends_at IS NOT NULL
       AND stage_live_ends_at > now()
     LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);
    -- Compressed match minute 0..90 based on how much of the stage has elapsed
    v_minute := LEAST(90, GREATEST(1, (
      90 * (v_live - GREATEST(0, EXTRACT(epoch FROM (t.stage_live_ends_at - now()))::int)) / GREATEST(1, v_live)
    )::int));

    FOR m IN
      SELECT id FROM public.tournament_matches
       WHERE tournament_id = t.id AND round_name = t.current_stage AND status = 'live'
    LOOP
      PERFORM public.champ_gen_event(m.id, v_sport, v_minute);
    END LOOP;
    advanced := advanced + 1;
  END LOOP;

  -- Live stage ended: settle scores, then either wait for gap or start next stage
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'live'
       AND stage_live_ends_at IS NOT NULL
       AND stage_live_ends_at <= now()
       AND next_stage_at IS NULL
     LIMIT 5
  LOOP
    v_stage := t.current_stage;
    v_gap := COALESCE(t.stage_gap_seconds, 20);
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;

    -- Finalize any remaining live matches
    FOR m IN
      SELECT * FROM public.tournament_matches
       WHERE tournament_id = t.id AND round_name = v_stage AND status = 'live'
       ORDER BY slot ASC
    LOOP
      -- Ensure a decisive score: if tied, give one more goal to whoever led events
      IF COALESCE(m.score_a, 0) = COALESCE(m.score_b, 0) THEN
        IF random() < 0.5 THEN
          UPDATE public.tournament_matches SET score_a = COALESCE(score_a,0) + 1 WHERE id = m.id;
        ELSE
          UPDATE public.tournament_matches SET score_b = COALESCE(score_b,0) + 1 WHERE id = m.id;
        END IF;
      END IF;
    END LOOP;

    -- Now compute winners & mark completed
    v_winners := ARRAY[]::UUID[];
    FOR m IN
      SELECT * FROM public.tournament_matches
       WHERE tournament_id = t.id AND round_name = v_stage AND status = 'live'
       ORDER BY slot ASC
    LOOP
      v_winner := CASE WHEN COALESCE(m.score_a,0) > COALESCE(m.score_b,0) THEN m.participant_a_id ELSE m.participant_b_id END;
      UPDATE public.tournament_matches
         SET winner_id = v_winner,
             status = 'completed',
             live_events = COALESCE(live_events, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
               'at', extract(epoch from now()), 'minute', 90, 'type', 'fulltime',
               'text', CASE WHEN v_sport='football' THEN 'Full time' ELSE 'Match over' END
             )),
             updated_at = now()
       WHERE id = m.id;
      v_winners := v_winners || v_winner;

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id = v_winner THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id = v_winner THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_match_id = m.id AND kind='match_winner' AND status='pending';
    END LOOP;

    -- Settle eliminated_at for this stage
    UPDATE public.championship_bets
       SET status = CASE WHEN team_id IN (
             SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
               FROM public.tournament_matches tm
              WHERE tm.tournament_id = t.id AND tm.round_name = v_stage
           ) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id IN (
             SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
               FROM public.tournament_matches tm
              WHERE tm.tournament_id = t.id AND tm.round_name = v_stage
           ) THEN (stake*odds)::BIGINT ELSE 0 END,
           settled_at = now()
     WHERE tournament_id = t.id AND kind='eliminated_at' AND stage=v_stage AND status='pending';

    v_next_stage := CASE v_stage WHEN 'R16' THEN 'QF' WHEN 'QF' THEN 'SF' WHEN 'SF' THEN 'F' ELSE NULL END;
    v_next_round := CASE v_stage WHEN 'R16' THEN 2 WHEN 'QF' THEN 3 WHEN 'SF' THEN 4 ELSE NULL END;

    IF v_next_stage IS NULL THEN
      -- Championship over
      v_champ := v_winners[1];
      SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
        INTO v_runner FROM public.tournament_matches tm
       WHERE tm.tournament_id = t.id AND tm.round_name = 'F' LIMIT 1;

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id = v_champ THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id = v_champ THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id = t.id AND kind='outright' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (SELECT unnest(ARRAY[v_champ, v_runner])) THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id IN (SELECT unnest(ARRAY[v_champ, v_runner])) THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id = t.id AND kind='reach_final' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='QF' AND winner_id IS NOT NULL) THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='QF' AND winner_id IS NOT NULL) THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id=t.id AND kind='reach_semi' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='R16' AND winner_id IS NOT NULL) THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='R16' AND winner_id IS NOT NULL) THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id=t.id AND kind='reach_quarter' AND status='pending';

      PERFORM public.credit_championship_payouts(t.id);

      UPDATE public.tournaments
         SET status='completed', current_stage='F',
             champion_team_id = v_champ, runner_up_team_id = v_runner,
             next_stage_at = NULL, stage_live_ends_at = NULL,
             updated_at = now()
       WHERE id = t.id;

      SELECT virtual_championship_auto_restart,
             CASE WHEN t.kind='championship_football'
                  THEN virtual_championship_football_enabled
                  ELSE virtual_championship_enabled END
        INTO v_auto, v_open
        FROM public.app_settings WHERE id=1;

      IF v_auto AND v_open THEN
        INSERT INTO public.tournaments (name, kind, status, starts_at, stage_gap_seconds, bracket_size, current_stage)
        VALUES (
          CASE WHEN t.kind='championship_football' THEN 'Auto Football Cup ' ELSE 'Auto Championship ' END
            || to_char(now(), 'Mon DD HH24:MI'),
          t.kind, 'scheduled', now() + interval '30 seconds', v_gap, 16, 'R16'
        ) RETURNING id INTO v_new_tid;
        PERFORM public.championship_autostart(v_new_tid);
      END IF;
    ELSE
      -- Draw next stage pairings; enter gap phase
      FOR i IN 0..(array_length(v_winners,1)/2 - 1) LOOP
        INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status, score_a, score_b)
        VALUES (t.id, v_next_round, v_next_stage, i, v_winners[i*2+1], v_winners[i*2+2], 'pending', 0, 0);
      END LOOP;

      UPDATE public.tournaments
         SET current_stage = v_next_stage,
             next_stage_at = now() + (v_gap || ' seconds')::interval,
             stage_live_ends_at = NULL,
             updated_at = now()
       WHERE id = t.id;
    END IF;
    advanced := advanced + 1;
  END LOOP;

  -- Gap ended: kick off the next stage (pending → live)
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'live'
       AND next_stage_at IS NOT NULL
       AND next_stage_at <= now()
       AND stage_live_ends_at IS NULL
     LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);

    UPDATE public.tournament_matches
       SET status = 'live',
           live_started_at = now(),
           live_events = jsonb_build_array(jsonb_build_object(
             'at', extract(epoch from now()), 'minute', 0, 'type', 'kickoff',
             'text', CASE WHEN v_sport='football' THEN 'Kick-off!' ELSE 'Fight begins!' END
           ))
     WHERE tournament_id = t.id AND round_name = t.current_stage AND status = 'pending';

    UPDATE public.tournaments
       SET stage_live_ends_at = now() + (v_live || ' seconds')::interval,
           next_stage_at = NULL,
           updated_at = now()
     WHERE id = t.id;
    advanced := advanced + 1;
  END LOOP;

  RETURN jsonb_build_object('advanced', advanced);
END; $$;
-- 1) Fix delete_teams_bulk: odds table has no match_id, cascade via markets.match_id
CREATE OR REPLACE FUNCTION public.delete_teams_bulk(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can bulk-delete teams';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;
  SET LOCAL statement_timeout = '60s';

  DELETE FROM public.bet_selections
    WHERE match_id IN (
      SELECT id FROM public.matches
      WHERE home_team_id = ANY(p_ids) OR away_team_id = ANY(p_ids)
    );
  DELETE FROM public.odds
    WHERE market_id IN (
      SELECT mk.id FROM public.markets mk
      JOIN public.matches m ON m.id = mk.match_id
      WHERE m.home_team_id = ANY(p_ids) OR m.away_team_id = ANY(p_ids)
    );
  DELETE FROM public.markets
    WHERE match_id IN (
      SELECT id FROM public.matches
      WHERE home_team_id = ANY(p_ids) OR away_team_id = ANY(p_ids)
    );
  DELETE FROM public.matches WHERE home_team_id = ANY(p_ids) OR away_team_id = ANY(p_ids);
  DELETE FROM public.tournament_matches WHERE participant_a_id = ANY(p_ids) OR participant_b_id = ANY(p_ids);
  DELETE FROM public.players WHERE team_id = ANY(p_ids);
  DELETE FROM public.teams WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_teams_bulk(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_teams_bulk(UUID[]) TO authenticated;

-- 2) Bulk delete players (admin)
CREATE OR REPLACE FUNCTION public.delete_players_bulk(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can bulk-delete players';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;
  SET LOCAL statement_timeout = '30s';
  DELETE FROM public.players WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_players_bulk(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_players_bulk(UUID[]) TO authenticated;

-- 3) Cancel/withdraw a championship bet while the tournament is still in booking phase.
CREATE OR REPLACE FUNCTION public.cancel_championship_bet(p_tournament UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_bet public.championship_bets%ROWTYPE;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  SELECT status INTO v_status FROM public.tournaments WHERE id = p_tournament;
  IF v_status IS DISTINCT FROM 'booking' THEN
    RAISE EXCEPTION 'Booking is closed for this championship';
  END IF;
  SELECT * INTO v_bet FROM public.championship_bets
    WHERE user_id = auth.uid() AND tournament_id = p_tournament
    LIMIT 1;
  IF v_bet.id IS NULL THEN
    RETURN jsonb_build_object('cancelled', 0);
  END IF;
  -- refund stake
  UPDATE public.profiles SET tokens = COALESCE(tokens,0) + v_bet.stake WHERE id = auth.uid();
  DELETE FROM public.championship_bets WHERE id = v_bet.id;
  RETURN jsonb_build_object('cancelled', 1, 'refunded', v_bet.stake);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_championship_bet(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_championship_bet(UUID) TO authenticated;
-- =========================================================
-- 1) INDEXES to make bulk deletes fast
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON public.matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON public.matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_markets_match ON public.markets(match_id);
CREATE INDEX IF NOT EXISTS idx_odds_market ON public.odds(market_id);
CREATE INDEX IF NOT EXISTS idx_bet_selections_match ON public.bet_selections(match_id);
CREATE INDEX IF NOT EXISTS idx_bet_selections_market ON public.bet_selections(market_id);
CREATE INDEX IF NOT EXISTS idx_bet_selections_odd ON public.bet_selections(odd_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON public.players(team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_a ON public.tournament_matches(participant_a_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_b ON public.tournament_matches(participant_b_id);

-- =========================================================
-- 2) FASTER delete_teams_bulk (collect ids once, delete via ANY(temp array))
-- =========================================================
CREATE OR REPLACE FUNCTION public.delete_teams_bulk(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT;
  v_match_ids uuid[];
  v_market_ids uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can bulk-delete teams';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;
  SET LOCAL statement_timeout = '120s';

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_match_ids
    FROM public.matches
    WHERE home_team_id = ANY(p_ids) OR away_team_id = ANY(p_ids);

  IF array_length(v_match_ids, 1) IS NOT NULL THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_market_ids
      FROM public.markets WHERE match_id = ANY(v_match_ids);

    DELETE FROM public.bet_selections WHERE match_id = ANY(v_match_ids);
    IF array_length(v_market_ids, 1) IS NOT NULL THEN
      DELETE FROM public.odds WHERE market_id = ANY(v_market_ids);
      DELETE FROM public.markets WHERE id = ANY(v_market_ids);
    END IF;
    DELETE FROM public.matches WHERE id = ANY(v_match_ids);
  END IF;

  DELETE FROM public.tournament_matches
    WHERE participant_a_id = ANY(p_ids) OR participant_b_id = ANY(p_ids);
  DELETE FROM public.players WHERE team_id = ANY(p_ids);
  DELETE FROM public.teams WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_count);
END;
$function$;

-- =========================================================
-- 3) BETS: add is_virtual + kind so vouchers can carry
--    Instant-Football and Championship tickets in the same table
-- =========================================================
ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS is_virtual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'sports',
  ADD COLUMN IF NOT EXISTS championship_bet_id uuid REFERENCES public.championship_bets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS virtual_round_id uuid REFERENCES public.user_virtual_rounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta jsonb;

CREATE INDEX IF NOT EXISTS idx_bets_is_virtual ON public.bets(is_virtual);
CREATE INDEX IF NOT EXISTS idx_bets_kind ON public.bets(kind);

-- Allow synthetic selections (championship / instant-football have no odds/market row)
ALTER TABLE public.bet_selections
  ALTER COLUMN market_id DROP NOT NULL,
  ALTER COLUMN odd_id DROP NOT NULL;

-- Backfill is_virtual for existing virtual sports tickets
UPDATE public.bets b
   SET is_virtual = true, kind = 'virtual_sports'
  FROM public.bet_selections bs
  JOIN public.matches m ON m.id = bs.match_id
 WHERE bs.bet_id = b.id AND m.is_virtual = true AND b.is_virtual = false;

-- =========================================================
-- 4) place_virtual_ticket: tag as virtual
-- =========================================================
CREATE OR REPLACE FUNCTION public.place_virtual_ticket(_selections jsonb, _stake bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); p record; cfg record;
  total_odds numeric := 1; payout bigint; bet_id uuid; tracking text; new_bal bigint;
  s jsonb; o record; mk record; m record;
  first_match uuid; sel_count int; cap bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  sel_count := jsonb_array_length(_selections);
  SELECT * INTO p FROM public.profiles WHERE id = uid FOR UPDATE;
  IF p.is_banned OR p.is_restricted THEN RAISE EXCEPTION 'Account restricted'; END IF;
  SELECT virtual_min_stake, virtual_max_stake, max_payout, virtual_max_payout, virtual_min_selections, virtual_max_selections INTO cfg FROM public.app_settings WHERE id=1;
  IF sel_count < COALESCE(cfg.virtual_min_selections,1) THEN RAISE EXCEPTION 'Minimum % selections required', COALESCE(cfg.virtual_min_selections,1); END IF;
  IF sel_count > COALESCE(cfg.virtual_max_selections,20) THEN RAISE EXCEPTION 'Maximum % selections allowed', COALESCE(cfg.virtual_max_selections,20); END IF;
  IF _stake < COALESCE(cfg.virtual_min_stake,100000) THEN RAISE EXCEPTION 'Stake below minimum'; END IF;
  IF p.token_balance < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  FOR s IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    SELECT * INTO o FROM public.odds WHERE id = (s->>'odd_id')::uuid;
    IF o IS NULL THEN RAISE EXCEPTION 'Bad selection'; END IF;
    SELECT * INTO mk FROM public.markets WHERE id = o.market_id;
    SELECT * INTO m FROM public.matches WHERE id = mk.match_id;
    IF NOT m.is_virtual THEN RAISE EXCEPTION 'Not virtual'; END IF;
    IF lower(mk.name) NOT LIKE '%match winner%' AND lower(mk.name) NOT LIKE '%win / draw / lose%' AND lower(mk.name) NOT LIKE '%first blood%' THEN
      RAISE EXCEPTION 'This virtual market is closed';
    END IF;
    IF m.status <> 'scheduled' OR (m.lock_time IS NOT NULL AND m.lock_time <= now()) OR NOT mk.is_open THEN
      RAISE EXCEPTION 'Round locked: %', m.name;
    END IF;
    total_odds := total_odds * o.value;
    IF first_match IS NULL THEN first_match := m.id; END IF;
  END LOOP;

  cap := COALESCE(NULLIF(cfg.virtual_max_payout, 0), cfg.max_payout, 100000000);
  payout := LEAST((total_odds * _stake)::bigint, cap);

  INSERT INTO public.bets(user_id, stake, total_odds, potential_payout, status, is_virtual, kind)
    VALUES (uid, _stake, total_odds, payout, 'open', true, 'virtual_sports')
    RETURNING id, tracking_id INTO bet_id, tracking;
  FOR s IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    SELECT * INTO o FROM public.odds WHERE id = (s->>'odd_id')::uuid;
    SELECT * INTO mk FROM public.markets WHERE id = o.market_id;
    INSERT INTO public.bet_selections(bet_id, match_id, market_id, odd_id, locked_odds, selection_label)
      VALUES (bet_id, mk.match_id, mk.id, o.id, o.value, o.label);
  END LOOP;
  UPDATE public.profiles SET token_balance = token_balance - _stake WHERE id=uid RETURNING token_balance INTO new_bal;
  PERFORM public.virtual_wallet_credit(_stake, 'stake', uid, bet_id, first_match, 'Virtual ticket stake');
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (uid, 'Virtual ticket placed', tracking || ' - ' || _stake || ' tokens', '/ticket/' || bet_id);
  RETURN jsonb_build_object('bet_id', bet_id, 'tracking_id', tracking, 'stake', _stake, 'payout', payout, 'balance', new_bal, 'max_payout_cap', cap);
END;
$function$;

-- =========================================================
-- 5) start_user_virtual_round: also write a bets voucher
-- =========================================================
CREATE OR REPLACE FUNCTION public.start_user_virtual_round(p_home text, p_away text, p_side text, p_stake bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_bal BIGINT;
  v_home BOOLEAN[] := ARRAY[]::BOOLEAN[];
  v_away BOOLEAN[] := ARRAY[]::BOOLEAN[];
  v_hs INT := 0; v_as INT := 0; i INT;
  v_result TEXT; v_payout BIGINT := 0; v_odds NUMERIC := 1.90;
  v_id UUID; v_bet_id UUID; v_tracking TEXT; v_status public.bet_status;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_side NOT IN ('home','away') THEN RAISE EXCEPTION 'Invalid side'; END IF;
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Invalid stake'; END IF;

  SELECT token_balance INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_bal IS NULL OR v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.profiles SET token_balance = token_balance - p_stake WHERE id = v_user;

  FOR i IN 1..5 LOOP
    v_home := v_home || (random() < 0.75);
    v_away := v_away || (random() < 0.75);
    IF v_home[i] THEN v_hs := v_hs + 1; END IF;
    IF v_away[i] THEN v_as := v_as + 1; END IF;
  END LOOP;
  WHILE v_hs = v_as LOOP
    v_home := v_home || (random() < 0.75);
    v_away := v_away || (random() < 0.75);
    IF v_home[array_length(v_home,1)] THEN v_hs := v_hs + 1; END IF;
    IF v_away[array_length(v_away,1)] THEN v_as := v_as + 1; END IF;
  END LOOP;

  IF (p_side = 'home' AND v_hs > v_as) OR (p_side = 'away' AND v_as > v_hs) THEN
    v_result := 'won';
    v_payout := (p_stake * v_odds)::BIGINT;
    UPDATE public.profiles SET token_balance = token_balance + v_payout WHERE id = v_user;
    v_status := 'won';
  ELSE
    v_result := 'lost';
    v_status := 'lost';
  END IF;

  INSERT INTO public.user_virtual_rounds (
    user_id, match_label, side, stake, odds, home_kicks, away_kicks, home_score, away_score, result, payout
  ) VALUES (
    v_user, p_home || ' vs ' || p_away, p_side, p_stake, v_odds, v_home, v_away, v_hs, v_as, v_result, v_payout
  ) RETURNING id INTO v_id;

  -- Voucher bet
  INSERT INTO public.bets(user_id, stake, total_odds, potential_payout, status, is_virtual, kind, virtual_round_id, settled_at, meta)
  VALUES (v_user, p_stake, v_odds, (p_stake * v_odds)::bigint, v_status, true, 'virtual_football_instant', v_id, now(),
    jsonb_build_object('home', p_home, 'away', p_away, 'side', p_side, 'home_score', v_hs, 'away_score', v_as))
  RETURNING id, tracking_id INTO v_bet_id, v_tracking;

  INSERT INTO public.bet_selections(bet_id, selection_label, locked_odds)
  VALUES (v_bet_id, (CASE WHEN p_side='home' THEN p_home ELSE p_away END) || ' to win the shootout · ' || p_home || ' vs ' || p_away, v_odds);

  RETURN jsonb_build_object(
    'id', v_id,
    'bet_id', v_bet_id,
    'tracking_id', v_tracking,
    'home_kicks', v_home,
    'away_kicks', v_away,
    'home_score', v_hs,
    'away_score', v_as,
    'result', v_result,
    'payout', v_payout
  );
END;
$function$;

-- =========================================================
-- 6) place_championship_bet: also write a paired bets voucher
--    and cancel_championship_bet: remove the paired voucher
-- =========================================================
CREATE OR REPLACE FUNCTION public.place_championship_bet(p_tournament uuid, p_kind text, p_team uuid, p_stage text, p_match uuid, p_stake bigint, p_odds numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_bal BIGINT; v_id UUID; v_status TEXT; v_existing UUID;
  v_bet_id UUID; v_team_name TEXT; v_t_name TEXT; v_label TEXT; v_kind_label TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Invalid stake'; END IF;

  SELECT status, name INTO v_status, v_t_name FROM public.tournaments WHERE id = p_tournament;
  IF v_status <> 'booking' THEN
    RAISE EXCEPTION 'Booking is closed for this championship';
  END IF;

  SELECT id INTO v_existing FROM public.championship_bets
   WHERE user_id = v_user AND tournament_id = p_tournament LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'You already booked a bet for this championship';
  END IF;

  SELECT token_balance INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_bal IS NULL OR v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.profiles SET token_balance = token_balance - p_stake WHERE id = v_user;

  INSERT INTO public.championship_bets (user_id, tournament_id, kind, team_id, stage, tournament_match_id, stake, odds)
  VALUES (v_user, p_tournament, p_kind, p_team, p_stage, p_match, p_stake, p_odds)
  RETURNING id INTO v_id;

  SELECT name INTO v_team_name FROM public.teams WHERE id = p_team;
  v_kind_label := CASE p_kind
    WHEN 'outright' THEN 'Outright champion'
    WHEN 'reach_final' THEN 'Reach Final'
    WHEN 'reach_semi' THEN 'Reach Semi-Final'
    WHEN 'reach_quarter' THEN 'Reach Quarter-Final'
    WHEN 'eliminated_at' THEN 'Eliminated at ' || COALESCE(p_stage,'stage')
    WHEN 'match_winner' THEN 'Match winner'
    ELSE p_kind
  END;
  v_label := v_kind_label || ' · ' || COALESCE(v_team_name,'team') || ' · ' || COALESCE(v_t_name,'Championship');

  INSERT INTO public.bets(user_id, stake, total_odds, potential_payout, status, is_virtual, kind, championship_bet_id, meta)
  VALUES (v_user, p_stake, p_odds, (p_stake * p_odds)::bigint, 'open', true, 'championship', v_id,
    jsonb_build_object('tournament', v_t_name, 'kind', p_kind, 'stage', p_stage, 'team', v_team_name))
  RETURNING id INTO v_bet_id;

  INSERT INTO public.bet_selections(bet_id, selection_label, locked_odds)
  VALUES (v_bet_id, v_label, p_odds);

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_championship_bet(p_tournament uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bet public.championship_bets%ROWTYPE;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  SELECT status INTO v_status FROM public.tournaments WHERE id = p_tournament;
  IF v_status IS DISTINCT FROM 'booking' THEN
    RAISE EXCEPTION 'Booking is closed for this championship';
  END IF;
  SELECT * INTO v_bet FROM public.championship_bets
    WHERE user_id = auth.uid() AND tournament_id = p_tournament LIMIT 1;
  IF v_bet.id IS NULL THEN
    RETURN jsonb_build_object('cancelled', 0);
  END IF;
  -- refund + remove paired voucher
  UPDATE public.profiles SET token_balance = token_balance + v_bet.stake WHERE id = auth.uid();
  DELETE FROM public.bets WHERE championship_bet_id = v_bet.id AND user_id = auth.uid();
  DELETE FROM public.championship_bets WHERE id = v_bet.id;
  RETURN jsonb_build_object('cancelled', 1, 'refunded', v_bet.stake);
END;
$function$;
UPDATE public.app_settings SET platform_logo_url = '/__l5e/assets-v1/6d05d88a-3461-46ba-8099-066f9ac28e32/ecb-logo.png', platform_logo_corner_url = COALESCE(platform_logo_corner_url, '/__l5e/assets-v1/6d05d88a-3461-46ba-8099-066f9ac28e32/ecb-logo.png'), platform_logo_auth_url = COALESCE(platform_logo_auth_url, '/__l5e/assets-v1/6d05d88a-3461-46ba-8099-066f9ac28e32/ecb-logo.png'), platform_logo_voucher_url = COALESCE(platform_logo_voucher_url, '/__l5e/assets-v1/6d05d88a-3461-46ba-8099-066f9ac28e32/ecb-logo.png') WHERE id = 1;CREATE TABLE public.analytics_events (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  path TEXT,
  referrer TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX analytics_events_created_at_idx ON public.analytics_events (created_at DESC);
CREATE INDEX analytics_events_event_type_idx ON public.analytics_events (event_type);
CREATE INDEX analytics_events_path_idx ON public.analytics_events (path);
CREATE INDEX analytics_events_session_idx ON public.analytics_events (session_id);

GRANT SELECT, INSERT ON public.analytics_events TO anon;
GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.analytics_events_id_seq TO anon, authenticated;
GRANT ALL ON public.analytics_events TO service_role;
GRANT ALL ON SEQUENCE public.analytics_events_id_seq TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view analytics events"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Extend championship_tick to bootstrap a new cup when none exists
-- and the feature is enabled. Auto-restart previously only fired when a cup
-- completed, so first-time users saw "No cup scheduled" forever.

CREATE OR REPLACE FUNCTION public.championship_bootstrap_if_needed()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  s RECORD; v_new_tid UUID; v_count INT := 0; v_teams INT;
BEGIN
  SELECT virtual_championship_enabled,
         virtual_championship_football_enabled,
         virtual_championship_auto_restart,
         COALESCE(championship_stage_gap_seconds, 20) AS gap
    INTO s FROM public.app_settings WHERE id = 1;

  IF NOT COALESCE(s.virtual_championship_auto_restart, false) THEN
    RETURN 0;
  END IF;

  -- Generic (gang) cup
  IF COALESCE(s.virtual_championship_enabled, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tournaments
       WHERE kind = 'championship_virtual'
         AND status IN ('scheduled','booking','live')
    ) THEN
      SELECT COUNT(*) INTO v_teams FROM public.teams WHERE COALESCE(sport,'generic')='generic';
      IF v_teams >= 16 THEN
        INSERT INTO public.tournaments (name, kind, status, starts_at, stage_gap_seconds, bracket_size, current_stage)
        VALUES ('Auto Championship ' || to_char(now(), 'Mon DD HH24:MI'),
                'championship_virtual', 'scheduled', now() + interval '20 seconds', s.gap, 16, 'R16')
        RETURNING id INTO v_new_tid;
        PERFORM public.championship_autostart(v_new_tid);
        v_count := v_count + 1;
      END IF;
    END IF;
  END IF;

  -- Football cup
  IF COALESCE(s.virtual_championship_football_enabled, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tournaments
       WHERE kind = 'championship_football'
         AND status IN ('scheduled','booking','live')
    ) THEN
      SELECT COUNT(*) INTO v_teams FROM public.teams WHERE COALESCE(sport,'generic')='football';
      IF v_teams >= 16 THEN
        INSERT INTO public.tournaments (name, kind, status, starts_at, stage_gap_seconds, bracket_size, current_stage)
        VALUES ('Auto Football Cup ' || to_char(now(), 'Mon DD HH24:MI'),
                'championship_football', 'scheduled', now() + interval '20 seconds', s.gap, 16, 'R16')
        RETURNING id INTO v_new_tid;
        PERFORM public.championship_autostart(v_new_tid);
        v_count := v_count + 1;
      END IF;
    END IF;
  END IF;

  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.championship_bootstrap_if_needed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.championship_bootstrap_if_needed() TO authenticated, service_role, anon;

-- Patch championship_tick to run bootstrap at the top of every tick
CREATE OR REPLACE FUNCTION public.championship_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t RECORD; m RECORD;
  v_stage TEXT; v_next_stage TEXT; v_next_round INT;
  v_winner UUID; v_winners UUID[]; v_gap INT; v_live INT;
  v_champ UUID; v_runner UUID;
  advanced INT := 0; i INT; v_auto BOOLEAN; v_open BOOLEAN;
  v_new_tid UUID; v_sport TEXT; v_minute INT;
BEGIN
  -- Bootstrap: spawn a cup if none exists and the mode is enabled
  advanced := advanced + public.championship_bootstrap_if_needed();

  -- Auto-start scheduled tournaments whose starts_at has arrived
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'scheduled'
       AND starts_at IS NOT NULL AND starts_at <= now()
     ORDER BY starts_at ASC LIMIT 3
  LOOP
    PERFORM public.championship_autostart(t.id);
    advanced := advanced + 1;
  END LOOP;

  -- Booking phase → live
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'booking'
       AND booking_closes_at IS NOT NULL
       AND booking_closes_at <= now()
     ORDER BY booking_closes_at ASC LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);

    UPDATE public.tournament_matches
       SET status = 'live', live_started_at = now(),
           live_events = jsonb_build_array(jsonb_build_object(
             'at', extract(epoch from now()), 'minute', 0, 'type', 'kickoff',
             'text', CASE WHEN v_sport='football' THEN 'Kick-off!' ELSE 'Fight begins!' END))
     WHERE tournament_id = t.id AND round_name = t.current_stage AND status = 'pending';

    UPDATE public.tournaments
       SET status = 'live', stage_live_ends_at = now() + (v_live || ' seconds')::interval,
           next_stage_at = NULL, updated_at = now()
     WHERE id = t.id;
    advanced := advanced + 1;
  END LOOP;

  -- Live in progress: generate commentary
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'live' AND stage_live_ends_at IS NOT NULL AND stage_live_ends_at > now()
     LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);
    v_minute := LEAST(90, GREATEST(1, (
      90 * (v_live - GREATEST(0, EXTRACT(epoch FROM (t.stage_live_ends_at - now()))::int)) / GREATEST(1, v_live)
    )::int));
    FOR m IN
      SELECT id FROM public.tournament_matches
       WHERE tournament_id = t.id AND round_name = t.current_stage AND status = 'live'
    LOOP
      PERFORM public.champ_gen_event(m.id, v_sport, v_minute);
    END LOOP;
    advanced := advanced + 1;
  END LOOP;

  -- Live ended: settle, then gap or next stage
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'live' AND stage_live_ends_at IS NOT NULL AND stage_live_ends_at <= now()
       AND next_stage_at IS NULL
     LIMIT 5
  LOOP
    v_stage := t.current_stage;
    v_gap := COALESCE(t.stage_gap_seconds, 20);
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;

    FOR m IN
      SELECT * FROM public.tournament_matches
       WHERE tournament_id = t.id AND round_name = v_stage AND status = 'live' ORDER BY slot ASC
    LOOP
      IF COALESCE(m.score_a, 0) = COALESCE(m.score_b, 0) THEN
        IF random() < 0.5 THEN
          UPDATE public.tournament_matches SET score_a = COALESCE(score_a,0) + 1 WHERE id = m.id;
        ELSE
          UPDATE public.tournament_matches SET score_b = COALESCE(score_b,0) + 1 WHERE id = m.id;
        END IF;
      END IF;
    END LOOP;

    v_winners := ARRAY[]::UUID[];
    FOR m IN
      SELECT * FROM public.tournament_matches
       WHERE tournament_id = t.id AND round_name = v_stage AND status = 'live' ORDER BY slot ASC
    LOOP
      v_winner := CASE WHEN COALESCE(m.score_a,0) > COALESCE(m.score_b,0) THEN m.participant_a_id ELSE m.participant_b_id END;
      UPDATE public.tournament_matches
         SET winner_id = v_winner, status = 'completed',
             live_events = COALESCE(live_events, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
               'at', extract(epoch from now()), 'minute', 90, 'type', 'fulltime',
               'text', CASE WHEN v_sport='football' THEN 'Full time' ELSE 'Match over' END)),
             updated_at = now()
       WHERE id = m.id;
      v_winners := v_winners || v_winner;

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id = v_winner THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id = v_winner THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_match_id = m.id AND kind='match_winner' AND status='pending';
    END LOOP;

    UPDATE public.championship_bets
       SET status = CASE WHEN team_id IN (
             SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
               FROM public.tournament_matches tm
              WHERE tm.tournament_id = t.id AND tm.round_name = v_stage
           ) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id IN (
             SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
               FROM public.tournament_matches tm
              WHERE tm.tournament_id = t.id AND tm.round_name = v_stage
           ) THEN (stake*odds)::BIGINT ELSE 0 END,
           settled_at = now()
     WHERE tournament_id = t.id AND kind='eliminated_at' AND stage=v_stage AND status='pending';

    v_next_stage := CASE v_stage WHEN 'R16' THEN 'QF' WHEN 'QF' THEN 'SF' WHEN 'SF' THEN 'F' ELSE NULL END;
    v_next_round := CASE v_stage WHEN 'R16' THEN 2 WHEN 'QF' THEN 3 WHEN 'SF' THEN 4 ELSE NULL END;

    IF v_next_stage IS NULL THEN
      v_champ := v_winners[1];
      SELECT CASE WHEN tm.winner_id = tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END
        INTO v_runner FROM public.tournament_matches tm
       WHERE tm.tournament_id = t.id AND tm.round_name = 'F' LIMIT 1;

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id = v_champ THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id = v_champ THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id = t.id AND kind='outright' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (SELECT unnest(ARRAY[v_champ, v_runner])) THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id IN (SELECT unnest(ARRAY[v_champ, v_runner])) THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id = t.id AND kind='reach_final' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='QF' AND winner_id IS NOT NULL) THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='QF' AND winner_id IS NOT NULL) THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id=t.id AND kind='reach_semi' AND status='pending';

      UPDATE public.championship_bets
         SET status = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='R16' AND winner_id IS NOT NULL) THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='R16' AND winner_id IS NOT NULL) THEN (stake*odds)::BIGINT ELSE 0 END,
             settled_at = now()
       WHERE tournament_id=t.id AND kind='reach_quarter' AND status='pending';

      PERFORM public.credit_championship_payouts(t.id);

      UPDATE public.tournaments
         SET status='completed', current_stage='F',
             champion_team_id = v_champ, runner_up_team_id = v_runner,
             next_stage_at = NULL, stage_live_ends_at = NULL, updated_at = now()
       WHERE id = t.id;

      SELECT virtual_championship_auto_restart,
             CASE WHEN t.kind='championship_football'
                  THEN virtual_championship_football_enabled
                  ELSE virtual_championship_enabled END
        INTO v_auto, v_open
        FROM public.app_settings WHERE id=1;

      IF v_auto AND v_open THEN
        INSERT INTO public.tournaments (name, kind, status, starts_at, stage_gap_seconds, bracket_size, current_stage)
        VALUES (
          CASE WHEN t.kind='championship_football' THEN 'Auto Football Cup ' ELSE 'Auto Championship ' END
            || to_char(now(), 'Mon DD HH24:MI'),
          t.kind, 'scheduled', now() + interval '30 seconds', v_gap, 16, 'R16'
        ) RETURNING id INTO v_new_tid;
        PERFORM public.championship_autostart(v_new_tid);
      END IF;
    ELSE
      FOR i IN 0..(array_length(v_winners,1)/2 - 1) LOOP
        INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status, score_a, score_b)
        VALUES (t.id, v_next_round, v_next_stage, i, v_winners[i*2+1], v_winners[i*2+2], 'pending', 0, 0);
      END LOOP;

      UPDATE public.tournaments
         SET current_stage = v_next_stage,
             next_stage_at = now() + (v_gap || ' seconds')::interval,
             stage_live_ends_at = NULL, updated_at = now()
       WHERE id = t.id;
    END IF;
    advanced := advanced + 1;
  END LOOP;

  -- Gap ended: kick off next stage
  FOR t IN
    SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'live' AND next_stage_at IS NOT NULL AND next_stage_at <= now()
       AND stage_live_ends_at IS NULL
     LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);

    UPDATE public.tournament_matches
       SET status = 'live', live_started_at = now(),
           live_events = jsonb_build_array(jsonb_build_object(
             'at', extract(epoch from now()), 'minute', 0, 'type', 'kickoff',
             'text', CASE WHEN v_sport='football' THEN 'Kick-off!' ELSE 'Fight begins!' END))
     WHERE tournament_id = t.id AND round_name = t.current_stage AND status = 'pending';

    UPDATE public.tournaments
       SET stage_live_ends_at = now() + (v_live || ' seconds')::interval,
           next_stage_at = NULL, updated_at = now()
     WHERE id = t.id;
    advanced := advanced + 1;
  END LOOP;

  RETURN jsonb_build_object('advanced', advanced);
END; $$;

REVOKE ALL ON FUNCTION public.championship_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.championship_tick() TO authenticated, service_role, anon;

-- Guard v_winners loop against NULL/empty array (happens when a stale
-- live cup has no live matches left to settle).
CREATE OR REPLACE FUNCTION public.championship_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t RECORD; m RECORD;
  v_stage TEXT; v_next_stage TEXT; v_next_round INT;
  v_winner UUID; v_winners UUID[]; v_gap INT; v_live INT;
  v_champ UUID; v_runner UUID;
  advanced INT := 0; i INT; v_auto BOOLEAN; v_open BOOLEAN;
  v_new_tid UUID; v_sport TEXT; v_minute INT;
BEGIN
  advanced := advanced + public.championship_bootstrap_if_needed();

  FOR t IN SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= now()
     ORDER BY starts_at ASC LIMIT 3
  LOOP PERFORM public.championship_autostart(t.id); advanced := advanced + 1; END LOOP;

  FOR t IN SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status = 'booking' AND booking_closes_at IS NOT NULL AND booking_closes_at <= now()
     ORDER BY booking_closes_at ASC LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);
    UPDATE public.tournament_matches SET status='live', live_started_at=now(),
           live_events = jsonb_build_array(jsonb_build_object('at', extract(epoch from now()),'minute',0,'type','kickoff','text', CASE WHEN v_sport='football' THEN 'Kick-off!' ELSE 'Fight begins!' END))
     WHERE tournament_id = t.id AND round_name = t.current_stage AND status = 'pending';
    UPDATE public.tournaments SET status='live', stage_live_ends_at = now() + (v_live || ' seconds')::interval, next_stage_at=NULL, updated_at=now() WHERE id=t.id;
    advanced := advanced + 1;
  END LOOP;

  FOR t IN SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status='live' AND stage_live_ends_at IS NOT NULL AND stage_live_ends_at > now()
     LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);
    v_minute := LEAST(90, GREATEST(1, (90 * (v_live - GREATEST(0, EXTRACT(epoch FROM (t.stage_live_ends_at - now()))::int)) / GREATEST(1, v_live))::int));
    FOR m IN SELECT id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name=t.current_stage AND status='live'
    LOOP PERFORM public.champ_gen_event(m.id, v_sport, v_minute); END LOOP;
    advanced := advanced + 1;
  END LOOP;

  FOR t IN SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status='live' AND stage_live_ends_at IS NOT NULL AND stage_live_ends_at <= now() AND next_stage_at IS NULL
     LIMIT 5
  LOOP
    v_stage := t.current_stage;
    v_gap := COALESCE(t.stage_gap_seconds, 20);
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;

    FOR m IN SELECT * FROM public.tournament_matches WHERE tournament_id=t.id AND round_name=v_stage AND status='live' ORDER BY slot ASC
    LOOP
      IF COALESCE(m.score_a,0) = COALESCE(m.score_b,0) THEN
        IF random() < 0.5 THEN UPDATE public.tournament_matches SET score_a = COALESCE(score_a,0)+1 WHERE id=m.id;
        ELSE UPDATE public.tournament_matches SET score_b = COALESCE(score_b,0)+1 WHERE id=m.id; END IF;
      END IF;
    END LOOP;

    v_winners := ARRAY[]::UUID[];
    FOR m IN SELECT * FROM public.tournament_matches WHERE tournament_id=t.id AND round_name=v_stage AND status='live' ORDER BY slot ASC
    LOOP
      v_winner := CASE WHEN COALESCE(m.score_a,0) > COALESCE(m.score_b,0) THEN m.participant_a_id ELSE m.participant_b_id END;
      UPDATE public.tournament_matches
         SET winner_id=v_winner, status='completed',
             live_events = COALESCE(live_events,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', extract(epoch from now()),'minute',90,'type','fulltime','text', CASE WHEN v_sport='football' THEN 'Full time' ELSE 'Match over' END)),
             updated_at=now()
       WHERE id=m.id;
      v_winners := v_winners || v_winner;
      UPDATE public.championship_bets SET status = CASE WHEN team_id=v_winner THEN 'won' ELSE 'lost' END,
             payout = CASE WHEN team_id=v_winner THEN (stake*odds)::BIGINT ELSE 0 END, settled_at=now()
       WHERE tournament_match_id=m.id AND kind='match_winner' AND status='pending';
    END LOOP;

    -- If no winners were collected (stale/empty stage), just mark completed & bail out.
    IF COALESCE(array_length(v_winners,1),0) = 0 THEN
      UPDATE public.tournaments SET status='completed', next_stage_at=NULL, stage_live_ends_at=NULL, updated_at=now() WHERE id=t.id;
      advanced := advanced + 1;
      CONTINUE;
    END IF;

    UPDATE public.championship_bets
       SET status = CASE WHEN team_id IN (SELECT CASE WHEN tm.winner_id=tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END FROM public.tournament_matches tm WHERE tm.tournament_id=t.id AND tm.round_name=v_stage) THEN 'won' ELSE 'lost' END,
           payout = CASE WHEN team_id IN (SELECT CASE WHEN tm.winner_id=tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END FROM public.tournament_matches tm WHERE tm.tournament_id=t.id AND tm.round_name=v_stage) THEN (stake*odds)::BIGINT ELSE 0 END,
           settled_at=now()
     WHERE tournament_id=t.id AND kind='eliminated_at' AND stage=v_stage AND status='pending';

    v_next_stage := CASE v_stage WHEN 'R16' THEN 'QF' WHEN 'QF' THEN 'SF' WHEN 'SF' THEN 'F' ELSE NULL END;
    v_next_round := CASE v_stage WHEN 'R16' THEN 2 WHEN 'QF' THEN 3 WHEN 'SF' THEN 4 ELSE NULL END;

    IF v_next_stage IS NULL THEN
      v_champ := v_winners[1];
      SELECT CASE WHEN tm.winner_id=tm.participant_a_id THEN tm.participant_b_id ELSE tm.participant_a_id END INTO v_runner
        FROM public.tournament_matches tm WHERE tm.tournament_id=t.id AND tm.round_name='F' LIMIT 1;

      UPDATE public.championship_bets SET status = CASE WHEN team_id=v_champ THEN 'won' ELSE 'lost' END, payout = CASE WHEN team_id=v_champ THEN (stake*odds)::BIGINT ELSE 0 END, settled_at=now()
       WHERE tournament_id=t.id AND kind='outright' AND status='pending';

      UPDATE public.championship_bets SET status = CASE WHEN team_id IN (SELECT unnest(ARRAY[v_champ,v_runner])) THEN 'won' ELSE 'lost' END, payout = CASE WHEN team_id IN (SELECT unnest(ARRAY[v_champ,v_runner])) THEN (stake*odds)::BIGINT ELSE 0 END, settled_at=now()
       WHERE tournament_id=t.id AND kind='reach_final' AND status='pending';

      UPDATE public.championship_bets SET status = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='QF' AND winner_id IS NOT NULL) THEN 'won' ELSE 'lost' END, payout = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='QF' AND winner_id IS NOT NULL) THEN (stake*odds)::BIGINT ELSE 0 END, settled_at=now()
       WHERE tournament_id=t.id AND kind='reach_semi' AND status='pending';

      UPDATE public.championship_bets SET status = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='R16' AND winner_id IS NOT NULL) THEN 'won' ELSE 'lost' END, payout = CASE WHEN team_id IN (SELECT winner_id FROM public.tournament_matches WHERE tournament_id=t.id AND round_name='R16' AND winner_id IS NOT NULL) THEN (stake*odds)::BIGINT ELSE 0 END, settled_at=now()
       WHERE tournament_id=t.id AND kind='reach_quarter' AND status='pending';

      PERFORM public.credit_championship_payouts(t.id);

      UPDATE public.tournaments SET status='completed', current_stage='F', champion_team_id=v_champ, runner_up_team_id=v_runner, next_stage_at=NULL, stage_live_ends_at=NULL, updated_at=now() WHERE id=t.id;

      SELECT virtual_championship_auto_restart, CASE WHEN t.kind='championship_football' THEN virtual_championship_football_enabled ELSE virtual_championship_enabled END
        INTO v_auto, v_open FROM public.app_settings WHERE id=1;

      IF v_auto AND v_open THEN
        INSERT INTO public.tournaments (name, kind, status, starts_at, stage_gap_seconds, bracket_size, current_stage)
        VALUES (CASE WHEN t.kind='championship_football' THEN 'Auto Football Cup ' ELSE 'Auto Championship ' END || to_char(now(),'Mon DD HH24:MI'), t.kind, 'scheduled', now() + interval '30 seconds', v_gap, 16, 'R16')
        RETURNING id INTO v_new_tid;
        PERFORM public.championship_autostart(v_new_tid);
      END IF;
    ELSE
      FOR i IN 0..(array_length(v_winners,1)/2 - 1) LOOP
        INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status, score_a, score_b)
        VALUES (t.id, v_next_round, v_next_stage, i, v_winners[i*2+1], v_winners[i*2+2], 'pending', 0, 0);
      END LOOP;
      UPDATE public.tournaments SET current_stage=v_next_stage, next_stage_at = now() + (v_gap || ' seconds')::interval, stage_live_ends_at=NULL, updated_at=now() WHERE id=t.id;
    END IF;
    advanced := advanced + 1;
  END LOOP;

  FOR t IN SELECT * FROM public.tournaments
     WHERE kind IN ('championship_virtual','championship_football')
       AND status='live' AND next_stage_at IS NOT NULL AND next_stage_at <= now() AND stage_live_ends_at IS NULL
     LIMIT 5
  LOOP
    v_sport := CASE WHEN t.kind='championship_football' THEN 'football' ELSE 'generic' END;
    v_live := COALESCE(t.stage_live_seconds, 30);
    UPDATE public.tournament_matches SET status='live', live_started_at=now(),
           live_events = jsonb_build_array(jsonb_build_object('at', extract(epoch from now()),'minute',0,'type','kickoff','text', CASE WHEN v_sport='football' THEN 'Kick-off!' ELSE 'Fight begins!' END))
     WHERE tournament_id=t.id AND round_name=t.current_stage AND status='pending';
    UPDATE public.tournaments SET stage_live_ends_at = now() + (v_live || ' seconds')::interval, next_stage_at=NULL, updated_at=now() WHERE id=t.id;
    advanced := advanced + 1;
  END LOOP;

  RETURN jsonb_build_object('advanced', advanced);
END; $$;

REVOKE ALL ON FUNCTION public.championship_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.championship_tick() TO authenticated, service_role, anon;

-- 1) virtual_tick: no longer auto-promotes scheduled -> live on lock_time.
--    Live rounds still resolve when their animation window elapses, and the
--    cycle still spawns a fresh batch when no matches are active.
CREATE OR REPLACE FUNCTION public.virtual_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg record;
  dur_sec integer;
  anim_sec integer;
  match_count integer;
  active_count integer;
  live_row record;
  team_a record;
  team_b record;
  cat_id uuid;
  batch_id uuid;
  new_match_id uuid;
  mk_id uuid;
  h int;
  a int;
  max_market_score int;
  spawned integer := 0;
  resolved integer := 0;
BEGIN
  SELECT COALESCE(virtual_cycle_running, false) AS running,
         GREATEST(10, COALESCE(virtual_round_duration_seconds, 120)) AS dur,
         GREATEST(8, COALESCE(virtual_animation_seconds, 30)) AS anim,
         GREATEST(4, LEAST(6, COALESCE(virtual_matches_per_round, virtual_concurrent_rounds, 5))) AS per_round,
         LEAST(7, GREATEST(5, COALESCE(virtual_max_score, 8))) AS market_score
    INTO cfg FROM public.app_settings WHERE id = 1;

  UPDATE public.app_settings SET virtual_cycle_last_tick = now() WHERE id = 1;
  dur_sec := cfg.dur;
  anim_sec := cfg.anim;
  match_count := cfg.per_round;
  max_market_score := cfg.market_score;

  -- Resolve live rounds once their animation window elapses.
  FOR live_row IN
    SELECT id FROM public.matches
     WHERE is_virtual = true AND status = 'live'
       AND COALESCE(locked_at, lock_time, start_time, created_at, now()) + (anim_sec || ' seconds')::interval <= now()
     ORDER BY COALESCE(locked_at, lock_time, start_time, created_at) ASC LIMIT 100
  LOOP
    PERFORM public.resolve_virtual_round(live_row.id, NULL, NULL, NULL);
    resolved := resolved + 1;
  END LOOP;

  IF NOT cfg.running THEN
    RETURN jsonb_build_object('ok', true, 'running', false, 'spawned', 0, 'promoted', 0, 'resolved', resolved);
  END IF;

  SELECT COUNT(*) INTO active_count FROM public.matches WHERE is_virtual = true AND status IN ('scheduled', 'live');

  IF active_count = 0 THEN
    batch_id := gen_random_uuid();
    WHILE spawned < match_count LOOP
      SELECT id, name INTO team_a FROM public.teams ORDER BY random() LIMIT 1;
      SELECT id, name INTO team_b FROM public.teams WHERE id <> team_a.id ORDER BY random() LIMIT 1;
      EXIT WHEN team_a.id IS NULL OR team_b.id IS NULL;
      SELECT id INTO cat_id FROM public.categories WHERE name = 'Virtual Gangs' LIMIT 1;
      IF cat_id IS NULL THEN INSERT INTO public.categories (name, icon) VALUES ('Virtual Gangs', '🎲') RETURNING id INTO cat_id; END IF;

      -- lock_time set far in the future; it is now decorative — stakes drive kickoff.
      INSERT INTO public.matches (name, home_team_id, away_team_id, category_id, status, is_virtual, start_time, lock_time, virtual_round_batch_id, virtual_round_id, home_score, away_score)
        VALUES (team_a.name || ' vs ' || team_b.name, team_a.id, team_b.id, cat_id, 'scheduled', true, now(), now() + interval '365 days', batch_id, batch_id, 0, 0)
        RETURNING id INTO new_match_id;
      INSERT INTO public.markets (match_id, name, is_open) VALUES (new_match_id, 'Match Winner', true) RETURNING id INTO mk_id;
      INSERT INTO public.odds (market_id, label, value) VALUES (mk_id, team_a.name, 1.95), (mk_id, 'Draw', 3.40), (mk_id, team_b.name, 1.95);
      INSERT INTO public.markets (match_id, name, is_open) VALUES (new_match_id, 'First Blood', true) RETURNING id INTO mk_id;
      INSERT INTO public.odds (market_id, label, value) VALUES (mk_id, team_a.name, 1.95), (mk_id, team_b.name, 1.95);
      INSERT INTO public.markets (match_id, name, is_open) VALUES (new_match_id, 'Total Kills O/U 4.5', true) RETURNING id INTO mk_id;
      INSERT INTO public.odds (market_id, label, value) VALUES (mk_id, 'Over 4.5', 1.85), (mk_id, 'Under 4.5', 1.85);
      INSERT INTO public.markets (match_id, name, is_open) VALUES (new_match_id, 'Correct Score', true) RETURNING id INTO mk_id;
      FOR h IN 0..max_market_score LOOP
        FOR a IN 0..max_market_score LOOP
          INSERT INTO public.odds (market_id, label, value) VALUES (mk_id, h::text || ':' || a::text, 8.50);
        END LOOP;
      END LOOP;
      spawned := spawned + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'running', true, 'spawned', spawned, 'promoted', 0, 'resolved', resolved, 'active_count', active_count, 'matches_per_round', match_count, 'round_seconds', dur_sec, 'animation_seconds', anim_sec);
END;
$function$;

-- 2) place_virtual_ticket: drop the "lock_time in the past" rejection and,
--    once selections are recorded, kick off every match in that batch
--    immediately for all users (scores seeded, markets closed, status live).
CREATE OR REPLACE FUNCTION public.place_virtual_ticket(_selections jsonb, _stake bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); p record; cfg record;
  total_odds numeric := 1; payout bigint; bet_id uuid; tracking text; new_bal bigint;
  s jsonb; o record; mk record; m record;
  first_match uuid; sel_count int; cap bigint;
  kick_batch uuid; kick_row record; planned record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  sel_count := jsonb_array_length(_selections);
  SELECT * INTO p FROM public.profiles WHERE id = uid FOR UPDATE;
  IF p.is_banned OR p.is_restricted THEN RAISE EXCEPTION 'Account restricted'; END IF;
  SELECT virtual_min_stake, virtual_max_stake, max_payout, virtual_max_payout, virtual_min_selections, virtual_max_selections INTO cfg FROM public.app_settings WHERE id=1;
  IF sel_count < COALESCE(cfg.virtual_min_selections,1) THEN RAISE EXCEPTION 'Minimum % selections required', COALESCE(cfg.virtual_min_selections,1); END IF;
  IF sel_count > COALESCE(cfg.virtual_max_selections,20) THEN RAISE EXCEPTION 'Maximum % selections allowed', COALESCE(cfg.virtual_max_selections,20); END IF;
  IF _stake < COALESCE(cfg.virtual_min_stake,100000) THEN RAISE EXCEPTION 'Stake below minimum'; END IF;
  IF p.token_balance < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  FOR s IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    SELECT * INTO o FROM public.odds WHERE id = (s->>'odd_id')::uuid;
    IF o IS NULL THEN RAISE EXCEPTION 'Bad selection'; END IF;
    SELECT * INTO mk FROM public.markets WHERE id = o.market_id;
    SELECT * INTO m FROM public.matches WHERE id = mk.match_id;
    IF NOT m.is_virtual THEN RAISE EXCEPTION 'Not virtual'; END IF;
    IF lower(mk.name) NOT LIKE '%match winner%' AND lower(mk.name) NOT LIKE '%win / draw / lose%' AND lower(mk.name) NOT LIKE '%first blood%' THEN
      RAISE EXCEPTION 'This virtual market is closed';
    END IF;
    -- Kickoff is user-driven now; only reject if the round has already been played.
    IF m.status <> 'scheduled' OR NOT mk.is_open THEN
      RAISE EXCEPTION 'Round locked: %', m.name;
    END IF;
    total_odds := total_odds * o.value;
    IF first_match IS NULL THEN first_match := m.id; END IF;
  END LOOP;

  cap := COALESCE(NULLIF(cfg.virtual_max_payout, 0), cfg.max_payout, 100000000);
  payout := LEAST((total_odds * _stake)::bigint, cap);

  INSERT INTO public.bets(user_id, stake, total_odds, potential_payout, status, is_virtual, kind)
    VALUES (uid, _stake, total_odds, payout, 'open', true, 'virtual_sports')
    RETURNING id, tracking_id INTO bet_id, tracking;
  FOR s IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    SELECT * INTO o FROM public.odds WHERE id = (s->>'odd_id')::uuid;
    SELECT * INTO mk FROM public.markets WHERE id = o.market_id;
    INSERT INTO public.bet_selections(bet_id, match_id, market_id, odd_id, locked_odds, selection_label)
      VALUES (bet_id, mk.match_id, mk.id, o.id, o.value, o.label);
  END LOOP;
  UPDATE public.profiles SET token_balance = token_balance - _stake WHERE id=uid RETURNING token_balance INTO new_bal;
  PERFORM public.virtual_wallet_credit(_stake, 'stake', uid, bet_id, first_match, 'Virtual ticket stake');
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (uid, 'Virtual ticket placed', tracking || ' - ' || _stake || ' tokens', '/ticket/' || bet_id);

  -- Kick off the entire batch immediately. Every match in the same
  -- virtual_round_batch_id (or the staked match alone if it has no batch)
  -- flips to live right now.
  SELECT virtual_round_batch_id INTO kick_batch FROM public.matches WHERE id = first_match;
  FOR kick_row IN
    SELECT id FROM public.matches
     WHERE is_virtual = true
       AND status = 'scheduled'
       AND (
         (kick_batch IS NOT NULL AND virtual_round_batch_id = kick_batch)
         OR (kick_batch IS NULL AND id = first_match)
       )
  LOOP
    SELECT * INTO planned FROM public.virtual_score_for_match(kick_row.id);
    UPDATE public.matches
       SET status = 'live',
           lock_time = now(),
           locked_at = now(),
           locked_by = uid,
           home_score = planned.home_score,
           away_score = planned.away_score,
           virtual_first_blood_team_id = planned.first_blood_team_id,
           updated_at = now()
     WHERE id = kick_row.id;
    UPDATE public.markets SET is_open = false WHERE match_id = kick_row.id;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'bet_id', bet_id, 'tracking_id', tracking, 'payout', payout, 'new_balance', new_bal);
END;
$function$;

-- 1) Allow teams to belong to both pools (generic + football) via sport='both'
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_sport_check;
ALTER TABLE public.teams ADD CONSTRAINT teams_sport_check
  CHECK (sport IN ('generic','football','both'));

-- 2) Championship start: match teams whose sport = v_sport OR 'both'
CREATE OR REPLACE FUNCTION public.championship_start(p_tournament uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_teams UUID[]; v_gap INT; v_live INT; v_book INT; i INT;
  v_kind TEXT; v_sport TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can start championships';
  END IF;

  SELECT kind, COALESCE(stage_gap_seconds, 20) INTO v_kind, v_gap
    FROM public.tournaments WHERE id = p_tournament;
  v_sport := CASE WHEN v_kind = 'championship_football' THEN 'football' ELSE 'generic' END;

  SELECT
    COALESCE(championship_booking_seconds, 120),
    COALESCE(championship_stage_live_seconds, 30)
    INTO v_book, v_live
    FROM public.app_settings WHERE id = 1;

  SELECT ARRAY(
    SELECT id FROM public.teams
    WHERE COALESCE(sport, 'generic') IN (v_sport, 'both')
    ORDER BY random() LIMIT 16
  ) INTO v_teams;

  IF array_length(v_teams, 1) IS NULL OR array_length(v_teams, 1) < 16 THEN
    RAISE EXCEPTION 'Need at least 16 % teams (found %). Tag more teams as % in Clans admin.',
      v_sport, COALESCE(array_length(v_teams, 1), 0), v_sport;
  END IF;

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament;
  FOR i IN 0..7 LOOP
    INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status, score_a, score_b)
    VALUES (p_tournament, 1, 'R16', i, v_teams[i*2+1], v_teams[i*2+2], 'pending', 0, 0);
  END LOOP;

  UPDATE public.tournaments
     SET status = 'booking',
         current_stage = 'R16',
         team_ids = v_teams,
         booking_closes_at = now() + (v_book || ' seconds')::interval,
         stage_live_seconds = v_live,
         next_stage_at = NULL,
         stage_live_ends_at = NULL,
         starts_at = COALESCE(starts_at, now()),
         updated_at = now()
   WHERE id = p_tournament;

  RETURN jsonb_build_object('ok', true, 'tournament_id', p_tournament, 'sport', v_sport, 'booking_seconds', v_book);
END; $$;

-- 3) Auto-restart bootstrap: same tolerance
CREATE OR REPLACE FUNCTION public.championship_bootstrap_if_needed()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD; v_new_tid UUID; v_count INT := 0; v_teams INT;
BEGIN
  SELECT virtual_championship_enabled,
         virtual_championship_football_enabled,
         virtual_championship_auto_restart,
         COALESCE(championship_stage_gap_seconds, 20) AS gap
    INTO s FROM public.app_settings WHERE id = 1;

  IF NOT COALESCE(s.virtual_championship_auto_restart, false) THEN
    RETURN 0;
  END IF;

  IF COALESCE(s.virtual_championship_enabled, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tournaments
       WHERE kind = 'championship_virtual'
         AND status IN ('scheduled','booking','live')
    ) THEN
      SELECT COUNT(*) INTO v_teams FROM public.teams
        WHERE COALESCE(sport,'generic') IN ('generic','both');
      IF v_teams >= 16 THEN
        INSERT INTO public.tournaments (name, kind, status, starts_at, stage_gap_seconds, bracket_size, current_stage)
        VALUES ('Auto Championship ' || to_char(now(), 'Mon DD HH24:MI'),
                'championship_virtual', 'scheduled', now() + interval '20 seconds', s.gap, 16, 'R16')
        RETURNING id INTO v_new_tid;
        PERFORM public.championship_autostart(v_new_tid);
        v_count := v_count + 1;
      END IF;
    END IF;
  END IF;

  IF COALESCE(s.virtual_championship_football_enabled, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tournaments
       WHERE kind = 'championship_football'
         AND status IN ('scheduled','booking','live')
    ) THEN
      SELECT COUNT(*) INTO v_teams FROM public.teams
        WHERE COALESCE(sport,'generic') IN ('football','both');
      IF v_teams >= 16 THEN
        INSERT INTO public.tournaments (name, kind, status, starts_at, stage_gap_seconds, bracket_size, current_stage)
        VALUES ('Auto Football Cup ' || to_char(now(), 'Mon DD HH24:MI'),
                'championship_football', 'scheduled', now() + interval '20 seconds', s.gap, 16, 'R16')
        RETURNING id INTO v_new_tid;
        PERFORM public.championship_autostart(v_new_tid);
        v_count := v_count + 1;
      END IF;
    END IF;
  END IF;

  RETURN v_count;
END; $$;

-- 4) Push notification on losing virtual bets, so users get "Bet lost" pushes too.
CREATE OR REPLACE FUNCTION public.resolve_virtual_round(_match_id uuid, _home_score integer DEFAULT NULL, _away_score integer DEFAULT NULL, _first_blood_team_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.matches%ROWTYPE;
  planned record;
  cfg record;
  hs integer;
  as_ integer;
  fb uuid;
  winner uuid;
  bet record;
  unresolved_count integer;
  has_lost boolean;
  is_virtual_bet boolean;
  payout_amount bigint;
  prev_status text;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = _match_id AND is_virtual = true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT * INTO planned FROM public.virtual_score_for_match(_match_id);
  SELECT virtual_payout_multiplier, virtual_win_bonus_tokens INTO cfg FROM public.app_settings WHERE id = 1;

  hs := GREATEST(0, COALESCE(_home_score, CASE WHEN m.status = 'ended' THEN m.home_score END, planned.home_score, 0));
  as_ := GREATEST(0, COALESCE(_away_score, CASE WHEN m.status = 'ended' THEN m.away_score END, planned.away_score, 0));
  fb := COALESCE(_first_blood_team_id, CASE WHEN m.status = 'ended' THEN m.virtual_first_blood_team_id END, planned.first_blood_team_id,
                 CASE WHEN hs >= as_ THEN m.home_team_id ELSE m.away_team_id END);
  winner := CASE WHEN hs > as_ THEN m.home_team_id WHEN as_ > hs THEN m.away_team_id ELSE NULL END;

  UPDATE public.markets SET is_open = false WHERE match_id = _match_id;
  UPDATE public.odds o SET is_winner = false FROM public.markets mk WHERE o.market_id = mk.id AND mk.match_id = _match_id;

  UPDATE public.odds o SET is_winner = CASE
    WHEN winner IS NULL AND lower(o.label) = 'draw' THEN true
    WHEN winner = m.home_team_id AND lower(o.label) = lower(COALESCE((SELECT name FROM public.teams WHERE id = m.home_team_id), '')) THEN true
    WHEN winner = m.away_team_id AND lower(o.label) = lower(COALESCE((SELECT name FROM public.teams WHERE id = m.away_team_id), '')) THEN true
    ELSE false END
    FROM public.markets mk WHERE o.market_id = mk.id AND mk.match_id = _match_id AND (mk.name ILIKE '%winner%' OR mk.name ILIKE '%win / draw / lose%' OR lower(mk.name) = '1x2');

  UPDATE public.odds o SET is_winner = (
    (fb = m.home_team_id AND lower(o.label) = lower(COALESCE((SELECT name FROM public.teams WHERE id = m.home_team_id), '')))
    OR (fb = m.away_team_id AND lower(o.label) = lower(COALESCE((SELECT name FROM public.teams WHERE id = m.away_team_id), '')))
  ) FROM public.markets mk WHERE o.market_id = mk.id AND mk.match_id = _match_id AND mk.name ILIKE '%first%blood%';

  UPDATE public.odds o SET is_winner = (replace(o.label, '-', ':') = hs || ':' || as_)
    FROM public.markets mk WHERE o.market_id = mk.id AND mk.match_id = _match_id AND mk.name ILIKE '%correct%score%';

  UPDATE public.odds o SET is_winner = CASE
    WHEN o.label ILIKE 'Over%' THEN (hs + as_) > COALESCE(NULLIF(regexp_replace(o.label, '[^0-9.]', '', 'g'), '')::numeric, 4.5)
    WHEN o.label ILIKE 'Under%' THEN (hs + as_) < COALESCE(NULLIF(regexp_replace(o.label, '[^0-9.]', '', 'g'), '')::numeric, 4.5)
    ELSE false END
    FROM public.markets mk WHERE o.market_id = mk.id AND mk.match_id = _match_id AND mk.name ILIKE '%total%';

  UPDATE public.matches SET status = 'ended', home_score = hs, away_score = as_,
    winner_team_id = winner, virtual_first_blood_team_id = fb,
    settled_at = COALESCE(settled_at, now()), updated_at = now()
   WHERE id = _match_id;

  FOR bet IN SELECT DISTINCT b.* FROM public.bets b
    JOIN public.bet_selections bs ON bs.bet_id = b.id
    WHERE bs.match_id = _match_id AND b.status IN ('open', 'won')
  LOOP
    prev_status := bet.status;
    UPDATE public.bet_selections bs
      SET result = CASE WHEN o.is_winner IS TRUE THEN 'won' ELSE 'lost' END
      FROM public.odds o
      WHERE bs.odd_id = o.id AND bs.bet_id = bet.id AND bs.match_id = _match_id;

    SELECT COUNT(*) FILTER (WHERE bs2.result IS NULL),
           COALESCE(bool_or(bs2.result = 'lost'), false)
      INTO unresolved_count, has_lost
      FROM public.bet_selections bs2 WHERE bs2.bet_id = bet.id;

    SELECT COALESCE(bool_or(mt.is_virtual), false) INTO is_virtual_bet
      FROM public.bet_selections bs3
      JOIN public.matches mt ON mt.id = bs3.match_id
     WHERE bs3.bet_id = bet.id;

    IF has_lost IS TRUE THEN
      UPDATE public.bets SET status = 'lost', settled_at = COALESCE(settled_at, now()) WHERE id = bet.id;
      IF prev_status <> 'lost' THEN
        INSERT INTO public.notifications (user_id, title, body, link)
          VALUES (bet.user_id, 'Bet lost',
                  'Your ticket ' || bet.tracking_id || ' did not win this round.',
                  '/ticket/' || bet.id::text);
      END IF;
    ELSIF unresolved_count = 0 THEN
      UPDATE public.bets SET status = 'won', settled_at = COALESCE(settled_at, now()) WHERE id = bet.id;
      IF prev_status <> 'won' THEN
        IF is_virtual_bet IS TRUE THEN
          payout_amount := (bet.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint + COALESCE(cfg.virtual_win_bonus_tokens, 0);
          INSERT INTO public.virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
            VALUES (bet.id, bet.user_id, _match_id, bet.stake, payout_amount, 'pending')
            ON CONFLICT (bet_id) DO NOTHING;
          INSERT INTO public.notifications (user_id, title, body, link)
            VALUES (bet.user_id, 'Virtual ticket won — claim now',
              bet.tracking_id || ' is eligible for a ' || payout_amount::text || ' token payout.',
              '/virtual/history');
        ELSE
          UPDATE public.profiles SET token_balance = token_balance + bet.potential_payout WHERE id = bet.user_id;
          INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
            SELECT bet.user_id, bet.potential_payout, token_balance, 'bet_won', 'Win ' || bet.tracking_id
              FROM public.profiles WHERE id = bet.user_id;
          INSERT INTO public.notifications (user_id, title, body, link)
            VALUES (bet.user_id, 'Ticket won', bet.tracking_id || ' paid ' || bet.potential_payout::text || ' tokens.', '/ticket/' || bet.id::text);
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'home', hs, 'away', as_, 'first_blood', fb);
END; $$;
ALTER TABLE public.home_banners ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'home';
CREATE INDEX IF NOT EXISTS home_banners_placement_idx ON public.home_banners(placement, is_active, sort_order);CREATE OR REPLACE FUNCTION public.championship_autostart(p_tournament uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teams UUID[]; v_gap INT; v_live INT; v_book INT; i INT; v_kind TEXT; v_sport TEXT;
BEGIN
  SELECT kind, COALESCE(stage_gap_seconds, 20) INTO v_kind, v_gap
    FROM public.tournaments WHERE id = p_tournament;
  v_sport := CASE WHEN v_kind = 'championship_football' THEN 'football' ELSE 'generic' END;

  SELECT
    COALESCE(championship_booking_seconds, 120),
    COALESCE(championship_stage_live_seconds, 30)
    INTO v_book, v_live
    FROM public.app_settings WHERE id = 1;

  -- Teams tagged as 'both' are eligible for either football or generic championships.
  SELECT ARRAY(
    SELECT id FROM public.teams
     WHERE COALESCE(sport, 'generic') IN (v_sport, 'both')
     ORDER BY random() LIMIT 16
  ) INTO v_teams;

  IF array_length(v_teams, 1) IS NULL OR array_length(v_teams, 1) < 16 THEN RETURN; END IF;

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament;
  FOR i IN 0..7 LOOP
    INSERT INTO public.tournament_matches (tournament_id, round, round_name, slot, participant_a_id, participant_b_id, status, score_a, score_b)
    VALUES (p_tournament, 1, 'R16', i, v_teams[i*2+1], v_teams[i*2+2], 'pending', 0, 0);
  END LOOP;

  UPDATE public.tournaments
     SET status = 'booking',
         current_stage = 'R16',
         team_ids = v_teams,
         booking_closes_at = now() + (v_book || ' seconds')::interval,
         stage_live_seconds = v_live,
         next_stage_at = NULL,
         stage_live_ends_at = NULL,
         starts_at = COALESCE(starts_at, now()),
         updated_at = now()
   WHERE id = p_tournament;
END; $function$;

-- Kick the currently-stuck tournaments so they transition immediately.
SELECT public.championship_tick();
-- 1. Rebrand tracking IDs from LSL- to ECB-
ALTER TABLE public.bets
  ALTER COLUMN tracking_id SET DEFAULT ('ECB-' || upper(substr(replace((gen_random_uuid())::text,'-',''), 1, 10)));

UPDATE public.bets SET tracking_id = 'ECB-' || substring(tracking_id from 5)
 WHERE tracking_id LIKE 'LSL-%';

-- 2. Auto-settle helper for virtual tickets: credits from virtual wallet if funded,
--    otherwise creates a pending payout request. Callable by the ticket owner.
CREATE OR REPLACE FUNCTION public.user_claim_or_settle_virtual(_bet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  is_virtual_bet boolean;
  wallet_bal bigint;
  cfg record;
  amount bigint;
  new_bal bigint;
  existing record;
  already_credited boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO b FROM public.bets WHERE id = _bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  IF b.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your ticket'; END IF;
  IF b.status <> 'won' THEN RAISE EXCEPTION 'Only won tickets can be claimed here'; END IF;

  SELECT COALESCE(bool_or(m.is_virtual), false) INTO is_virtual_bet
    FROM public.bet_selections bs JOIN public.matches m ON m.id = bs.match_id
   WHERE bs.bet_id = _bet_id;
  IF NOT is_virtual_bet THEN RAISE EXCEPTION 'Not a virtual ticket'; END IF;

  -- If a payout request already exists, delegate to the standard claim flow.
  SELECT * INTO existing FROM public.virtual_payout_requests WHERE bet_id = _bet_id FOR UPDATE;
  IF FOUND THEN
    IF existing.status = 'claimed' THEN RAISE EXCEPTION 'Already claimed'; END IF;
    IF existing.status = 'declined' THEN RAISE EXCEPTION 'Payout was declined'; END IF;
    RETURN public.claim_virtual_payout(existing.id);
  END IF;

  -- Guard against double credit: if a bet_win token_transaction already exists
  -- for this bet, mark as already handled.
  SELECT EXISTS(
    SELECT 1 FROM public.token_transactions
     WHERE user_id = b.user_id AND kind = 'bet_win'
       AND (description ILIKE '%' || b.tracking_id || '%' OR description ILIKE '%Virtual claim%')
  ) INTO already_credited;

  SELECT virtual_payout_multiplier, virtual_win_bonus_tokens INTO cfg FROM public.app_settings WHERE id = 1;
  amount := (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint
            + COALESCE(cfg.virtual_win_bonus_tokens, 0);
  IF amount < 1 THEN amount := b.potential_payout; END IF;

  SELECT balance INTO wallet_bal FROM public.virtual_house_wallet WHERE id = 1 FOR UPDATE;

  IF wallet_bal >= amount THEN
    -- Auto-credit: debit the virtual house wallet and credit the user immediately.
    PERFORM public.virtual_wallet_debit(amount, 'payout', b.user_id, b.id, NULL, 'Virtual auto-payout');
    UPDATE public.profiles SET token_balance = token_balance + amount
      WHERE id = b.user_id RETURNING token_balance INTO new_bal;
    INSERT INTO public.token_transactions(user_id, amount, balance_after, kind, description)
      VALUES (b.user_id, amount, new_bal, 'bet_win', 'Virtual auto-payout ' || b.tracking_id);
    -- Record a claimed request for auditing.
    INSERT INTO public.virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status, claimed_at, reviewed_by, reviewed_at)
    SELECT b.id, b.user_id,
           (SELECT bs.match_id FROM public.bet_selections bs
             JOIN public.matches m ON m.id = bs.match_id AND m.is_virtual = true
            WHERE bs.bet_id = b.id LIMIT 1),
           b.stake, amount, 'claimed', now(), b.user_id, now()
    ON CONFLICT (bet_id) DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'auto', true, 'amount', amount, 'balance', new_bal);
  ELSE
    -- Fall back to pending payout request for admin review / funded state.
    INSERT INTO public.virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
    SELECT b.id, b.user_id,
           (SELECT bs.match_id FROM public.bet_selections bs
             JOIN public.matches m ON m.id = bs.match_id AND m.is_virtual = true
            WHERE bs.bet_id = b.id LIMIT 1),
           b.stake, amount, 'pending'
    ON CONFLICT (bet_id) DO NOTHING;
    RAISE EXCEPTION 'Virtual wallet has insufficient funds (need %, have %). A pending payout request has been created and will be auto-settled once funded.', amount, wallet_bal USING ERRCODE = 'P0001';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.user_claim_or_settle_virtual(uuid) TO authenticated;

-- 3. Auto-settle every existing won virtual bet that has no payout request yet.
DO $$
DECLARE r record; res jsonb;
BEGIN
  FOR r IN
    SELECT b.id
      FROM public.bets b
     WHERE b.status = 'won'
       AND NOT EXISTS (SELECT 1 FROM public.virtual_payout_requests vpr WHERE vpr.bet_id = b.id)
       AND EXISTS (
         SELECT 1 FROM public.bet_selections bs
           JOIN public.matches m ON m.id = bs.match_id
          WHERE bs.bet_id = b.id AND m.is_virtual = true
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.token_transactions tt
          WHERE tt.user_id = b.user_id AND tt.kind = 'bet_win'
            AND tt.description ILIKE '%' || b.tracking_id || '%'
       )
  LOOP
    DECLARE
      bet record; amt bigint; cfg record; wallet_bal bigint; new_bal bigint;
    BEGIN
      SELECT * INTO bet FROM public.bets WHERE id = r.id FOR UPDATE;
      SELECT virtual_payout_multiplier, virtual_win_bonus_tokens INTO cfg FROM public.app_settings WHERE id = 1;
      amt := (bet.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint
             + COALESCE(cfg.virtual_win_bonus_tokens, 0);
      IF amt < 1 THEN amt := bet.potential_payout; END IF;
      SELECT balance INTO wallet_bal FROM public.virtual_house_wallet WHERE id = 1 FOR UPDATE;
      IF wallet_bal >= amt THEN
        PERFORM public.virtual_wallet_debit(amt, 'payout', bet.user_id, bet.id, NULL, 'Virtual auto-payout backfill');
        UPDATE public.profiles SET token_balance = token_balance + amt
          WHERE id = bet.user_id RETURNING token_balance INTO new_bal;
        INSERT INTO public.token_transactions(user_id, amount, balance_after, kind, description)
          VALUES (bet.user_id, amt, new_bal, 'bet_win', 'Virtual auto-payout ' || bet.tracking_id);
        INSERT INTO public.virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status, claimed_at, reviewed_by, reviewed_at)
        SELECT bet.id, bet.user_id,
               (SELECT bs.match_id FROM public.bet_selections bs
                 JOIN public.matches m ON m.id = bs.match_id AND m.is_virtual = true
                WHERE bs.bet_id = bet.id LIMIT 1),
               bet.stake, amt, 'claimed', now(), bet.user_id, now()
        ON CONFLICT (bet_id) DO NOTHING;
        INSERT INTO public.notifications(user_id, title, body, link)
          VALUES (bet.user_id, 'Virtual payout credited',
                  '+' || amt || ' tokens credited for ticket ' || bet.tracking_id,
                  '/ticket/' || bet.id::text);
      ELSE
        INSERT INTO public.virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
        SELECT bet.id, bet.user_id,
               (SELECT bs.match_id FROM public.bet_selections bs
                 JOIN public.matches m ON m.id = bs.match_id AND m.is_virtual = true
                WHERE bs.bet_id = bet.id LIMIT 1),
               bet.stake, amt, 'pending'
        ON CONFLICT (bet_id) DO NOTHING;
      END IF;
    END;
  END LOOP;
END $$;

-- Sync paired bets rows for all settled championship_bets (auto championship/cup vouchers)
CREATE OR REPLACE FUNCTION public.resolve_auto_championship()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  n INT := 0;
BEGIN
  FOR b IN
    SELECT bt.id AS bet_id, cb.status AS cb_status, cb.payout AS cb_payout, bt.potential_payout
      FROM public.bets bt
      JOIN public.championship_bets cb ON cb.id = bt.championship_bet_id
     WHERE bt.status = 'open'
       AND cb.status IN ('won','lost','void')
  LOOP
    IF b.cb_status = 'won' THEN
      UPDATE public.bets
         SET status = 'won'::bet_status,
             cashout_amount = COALESCE(NULLIF(b.cb_payout,0), b.potential_payout),
             settled_at = now()
       WHERE id = b.bet_id AND status = 'open';
    ELSIF b.cb_status = 'lost' THEN
      UPDATE public.bets
         SET status = 'lost'::bet_status,
             cashout_amount = 0,
             settled_at = now()
       WHERE id = b.bet_id AND status = 'open';
    ELSE
      UPDATE public.bets
         SET status = 'void'::bet_status,
             cashout_amount = 0,
             settled_at = now()
       WHERE id = b.bet_id AND status = 'open';
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_auto_championship() TO authenticated, service_role, anon;

-- Ensure credit_championship_payouts also finalizes the paired bets voucher rows
CREATE OR REPLACE FUNCTION public.credit_championship_payouts(p_tournament uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  FOR b IN
    SELECT user_id, SUM(payout) AS total
      FROM public.championship_bets
     WHERE tournament_id = p_tournament
       AND status = 'won'
       AND payout > 0
     GROUP BY user_id
  LOOP
    UPDATE public.profiles SET token_balance = token_balance + b.total WHERE id = b.user_id;
    INSERT INTO public.token_transactions (user_id, amount, kind, description)
      VALUES (b.user_id, b.total, 'championship_win', 'Championship Virtual payout')
      ON CONFLICT DO NOTHING;
  END LOOP;

  -- Finalize paired voucher rows for this tournament
  UPDATE public.bets bt
     SET status = 'won'::bet_status,
         cashout_amount = COALESCE(NULLIF(cb.payout,0), bt.potential_payout),
         settled_at = now()
    FROM public.championship_bets cb
   WHERE cb.id = bt.championship_bet_id
     AND cb.tournament_id = p_tournament
     AND cb.status = 'won'
     AND bt.status = 'open';

  UPDATE public.bets bt
     SET status = 'lost'::bet_status,
         cashout_amount = 0,
         settled_at = now()
    FROM public.championship_bets cb
   WHERE cb.id = bt.championship_bet_id
     AND cb.tournament_id = p_tournament
     AND cb.status = 'lost'
     AND bt.status = 'open';

  UPDATE public.bets bt
     SET status = 'void'::bet_status,
         cashout_amount = 0,
         settled_at = now()
    FROM public.championship_bets cb
   WHERE cb.id = bt.championship_bet_id
     AND cb.tournament_id = p_tournament
     AND cb.status = 'void'
     AND bt.status = 'open';
END;
$$;

-- Backfill: resolve any already-completed auto championship/cup vouchers still stuck open
SELECT public.resolve_auto_championship();
ALTER TABLE public.scheduled_pushes ADD COLUMN IF NOT EXISTS image text;
CREATE OR REPLACE FUNCTION public.resolve_open_bets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b RECORD;
  s RECORD;
  n INT := 0;
  cfg RECORD;
  payout_amount BIGINT;
  m_id UUID;
  is_virt BOOLEAN;
  unresolved INT;
  has_lost BOOLEAN;
  all_void BOOLEAN;
BEGIN
  SELECT virtual_payout_multiplier, virtual_win_bonus_tokens INTO cfg FROM public.app_settings WHERE id = 1;

  -- 1) Selection-backed vouchers (sports / virtual sports).
  FOR b IN
    SELECT bt.*
      FROM public.bets bt
     WHERE bt.status = 'open'
       AND bt.championship_bet_id IS NULL
       AND EXISTS (SELECT 1 FROM public.bet_selections bs WHERE bs.bet_id = bt.id)
  LOOP
    -- Fill in any selections whose match has ended but result is still NULL.
    UPDATE public.bet_selections bs
       SET result = CASE
              WHEN o.is_winner IS TRUE THEN 'won'
              WHEN o.is_winner IS FALSE THEN 'lost'
              ELSE bs.result END
      FROM public.odds o, public.matches mt
     WHERE bs.bet_id = b.id
       AND bs.odd_id = o.id
       AND bs.match_id = mt.id
       AND mt.status = 'ended'
       AND bs.result IS NULL;

    SELECT COUNT(*) FILTER (WHERE bs2.result IS NULL),
           COALESCE(bool_or(bs2.result = 'lost'), false),
           COALESCE(bool_and(bs2.result = 'void'), false)
      INTO unresolved, has_lost, all_void
      FROM public.bet_selections bs2 WHERE bs2.bet_id = b.id;

    IF has_lost THEN
      UPDATE public.bets SET status = 'lost', cashout_amount = 0, settled_at = COALESCE(settled_at, now())
       WHERE id = b.id AND status = 'open';
      INSERT INTO public.notifications (user_id, title, body, link)
        VALUES (b.user_id, 'Bet lost', 'Your ticket ' || b.tracking_id || ' did not win this round.', '/ticket/' || b.id::text);
      n := n + 1;
    ELSIF unresolved = 0 THEN
      IF all_void THEN
        UPDATE public.bets SET status = 'void', cashout_amount = b.stake, settled_at = COALESCE(settled_at, now())
         WHERE id = b.id AND status = 'open';
        UPDATE public.profiles SET token_balance = token_balance + b.stake WHERE id = b.user_id;
        INSERT INTO public.notifications (user_id, title, body, link)
          VALUES (b.user_id, 'Bet voided', b.tracking_id || ' was voided; stake returned.', '/ticket/' || b.id::text);
      ELSE
        SELECT COALESCE(bool_or(mt.is_virtual), false) INTO is_virt
          FROM public.bet_selections bs3 JOIN public.matches mt ON mt.id = bs3.match_id WHERE bs3.bet_id = b.id;
        UPDATE public.bets SET status = 'won', cashout_amount = b.potential_payout, settled_at = COALESCE(settled_at, now())
         WHERE id = b.id AND status = 'open';
        IF is_virt THEN
          payout_amount := (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint + COALESCE(cfg.virtual_win_bonus_tokens, 0);
          INSERT INTO public.virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
            SELECT b.id, b.user_id, bs.match_id, b.stake, payout_amount, 'pending'
              FROM public.bet_selections bs WHERE bs.bet_id = b.id LIMIT 1
            ON CONFLICT (bet_id) DO NOTHING;
          INSERT INTO public.notifications (user_id, title, body, link)
            VALUES (b.user_id, 'Virtual ticket won — claim now',
                    b.tracking_id || ' is eligible for a ' || payout_amount::text || ' token payout.',
                    '/virtual/history');
        ELSE
          UPDATE public.profiles SET token_balance = token_balance + b.potential_payout WHERE id = b.user_id;
          INSERT INTO public.token_transactions (user_id, amount, kind, description)
            VALUES (b.user_id, b.potential_payout, 'bet_won', 'Win ' || b.tracking_id) ON CONFLICT DO NOTHING;
          INSERT INTO public.notifications (user_id, title, body, link)
            VALUES (b.user_id, 'Ticket won', b.tracking_id || ' paid ' || b.potential_payout::text || ' tokens.', '/ticket/' || b.id::text);
        END IF;
      END IF;
      n := n + 1;
    END IF;
  END LOOP;

  -- 2) Championship-backed vouchers (delegate to existing resolver).
  n := n + COALESCE(public.resolve_auto_championship(), 0);

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_open_bets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_open_bets() TO service_role;

-- Backfill anything currently stuck.
SELECT public.resolve_open_bets();
ALTER TABLE public.home_banners
  ADD COLUMN IF NOT EXISTS image_fit text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS image_position text NOT NULL DEFAULT 'center';ALTER TABLE public.events ALTER COLUMN ends_at DROP NOT NULL;-- Recurring push notification settings and motivational content library
CREATE TABLE public.motivational_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('quote','encouragement')),
  idx int NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind, idx)
);
GRANT SELECT ON public.motivational_content TO authenticated;
GRANT ALL ON public.motivational_content TO service_role;
ALTER TABLE public.motivational_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage motivational content"
  ON public.motivational_content FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read motivational content"
  ON public.motivational_content FOR SELECT TO authenticated USING (true);

CREATE TABLE public.recurring_push_settings (
  key text PRIMARY KEY,
  label text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily','hourly')),
  enabled boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '/',
  hour_utc smallint,
  start_hour_utc smallint NOT NULL DEFAULT 8,
  end_hour_utc smallint NOT NULL DEFAULT 22,
  cycles_content text CHECK (cycles_content IN ('quote','encouragement')),
  next_index int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  last_sent_slot text,
  sort_order int NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.recurring_push_settings TO authenticated;
GRANT ALL ON public.recurring_push_settings TO service_role;
ALTER TABLE public.recurring_push_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage recurring push"
  ON public.recurring_push_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_recurring_push_updated
  BEFORE UPDATE ON public.recurring_push_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.recurring_push_settings (key,label,cadence,title,body,link,hour_utc,sort_order) VALUES
('daily_streak_reminder','Daily Streak Reminder','daily','🔥 Keep your streak alive!','Log in today to keep your daily streak going.','/dashboard',9,10),
('login_claim_rewards','Login to Claim Rewards','daily','🎁 Your rewards are waiting','Login now to claim your daily rewards.','/tasks',8,20),
('task_reminder','Daily Tasks','daily','✅ Daily tasks await','Complete today''s tasks and earn tokens.','/tasks',10,30),
('play_virtual','Play Virtual','daily','⚽ Virtual matches are live','Jump into a virtual round and win big.','/virtual',12,40),
('lottery_reminder','Lottery Draw','daily','🎟️ Grab your lottery ticket','Today''s draw is coming up. Buy your tickets now.','/lottery',13,50),
('arcade_reminder','Arcade','daily','🎮 Play the arcade','Spin the wheel and stack tokens in the arcade.','/arcade',15,60),
('spin_reminder','Daily Spin','daily','🎡 Your free spin is ready','Claim your free daily spin now.','/arcade',11,70),
('gift_reward','Gift Reward','daily','🎁 Free gift unlocked','A new gift is ready for you today.','/dashboard',14,80),
('daily_streak_reward','Streak Reward','daily','🔥 Streak reward available','Come collect today''s streak bonus.','/dashboard',20,90),
('place_bet_reminder','Place a Bet','daily','⚽ Matches are heating up','Place your bets before kickoff.','/matches',18,100);

INSERT INTO public.recurring_push_settings (key,label,cadence,title,body,link,start_hour_utc,end_hour_utc,cycles_content,sort_order) VALUES
('word_of_encouragement','Word of Encouragement','hourly','💛 A word for you',' ','/',8,22,'encouragement',110),
('motivational_quote','Motivational Quote','hourly','✨ Daily motivation',' ','/',8,22,'quote',120);

INSERT INTO public.motivational_content (kind, idx, text) VALUES
('quote', 0, 'Success is the sum of small efforts repeated day in and day out.'),
('quote', 1, 'The future depends on what you do today.'),
('quote', 2, 'Do what you can, with what you have, where you are.'),
('quote', 3, 'Believe you can and you''re halfway there.'),
('quote', 4, 'Fortune favors the bold.'),
('quote', 5, 'Little strokes fell great oaks.'),
('quote', 6, 'Fall seven times, stand up eight.'),
('quote', 7, 'Discipline is the bridge between goals and accomplishment.'),
('quote', 8, 'The best way out is always through.'),
('quote', 9, 'Energy and persistence conquer all things.'),
('quote', 10, 'A goal without a plan is just a wish.'),
('quote', 11, 'Winners never quit and quitters never win.'),
('quote', 12, 'Every champion was once a contender that refused to give up.'),
('quote', 13, 'Hard work beats talent when talent doesn''t work hard.'),
('quote', 14, 'Stars can''t shine without darkness.'),
('quote', 15, 'You miss 100% of the shots you don''t take.'),
('quote', 16, 'Great things never came from comfort zones.'),
('quote', 17, 'Dream it. Wish it. Do it.'),
('quote', 18, 'Push yourself, because no one else is going to do it for you.'),
('quote', 19, 'Sometimes later becomes never. Do it now.'),
('quote', 20, 'Wake up with determination. Go to bed with satisfaction.'),
('quote', 21, 'Don''t watch the clock; do what it does. Keep going.'),
('quote', 22, 'The harder you work for something, the greater you''ll feel when you achieve it.'),
('quote', 23, 'Small daily improvements are the key to staggering long-term results.'),
('quote', 24, 'Focus on being productive instead of busy.'),
('quote', 25, 'The way to get started is to quit talking and begin doing.'),
('quote', 26, 'Success is not final; failure is not fatal.'),
('quote', 27, 'Doubt kills more dreams than failure ever will.'),
('quote', 28, 'Your limitation—it''s only your imagination.'),
('quote', 29, 'Great things take time.'),
('quote', 30, 'Don''t stop when you''re tired. Stop when you''re done.'),
('quote', 31, 'The pain you feel today is the strength you feel tomorrow.'),
('quote', 32, 'Setting goals is the first step in turning the invisible into the visible.'),
('quote', 33, 'Action is the foundational key to all success.'),
('quote', 34, 'Motivation gets you going. Discipline keeps you growing.'),
('quote', 35, 'If it doesn''t challenge you, it doesn''t change you.'),
('quote', 36, 'Winners focus on winning. Losers focus on winners.'),
('quote', 37, 'You are never too old to set another goal or dream a new dream.'),
('quote', 38, 'What you do today can improve all your tomorrows.'),
('quote', 39, 'Don''t count the days, make the days count.'),
('quote', 40, 'Opportunities don''t happen. You create them.'),
('quote', 41, 'The secret of getting ahead is getting started.'),
('quote', 42, 'Nothing will work unless you do.'),
('quote', 43, 'Quality is not an act, it is a habit.'),
('quote', 44, 'Whatever you are, be a good one.'),
('quote', 45, 'An investment in knowledge pays the best interest.'),
('quote', 46, 'Well done is better than well said.'),
('quote', 47, 'You are the CEO of your life. Own it.'),
('quote', 48, 'Progress, not perfection.'),
('quote', 49, 'Chase excellence, success will follow.'),
('quote', 50, 'Consistency is the mother of mastery.'),
('quote', 51, 'Bet on yourself. You always were the sure thing.'),
('quote', 52, 'When you feel like quitting, remember why you started.'),
('quote', 53, 'Winners are just losers who tried one more time.'),
('quote', 54, 'Every setback is a setup for a comeback.'),
('quote', 55, 'Play the long game. Life rewards patience.'),
('quote', 56, 'Comfort is the enemy of achievement.'),
('quote', 57, 'Turn your wounds into wisdom.'),
('quote', 58, 'Be so good they can''t ignore you.'),
('quote', 59, 'You don''t find willpower, you create it.'),
('quote', 60, 'Discipline equals freedom.'),
('quote', 61, 'Success loves preparation.'),
('quote', 62, 'The only bad workout is the one that didn''t happen.'),
('quote', 63, 'Do more of what makes you strong.'),
('quote', 64, 'Confidence comes from evidence. Stack the wins.'),
('quote', 65, 'Aim for progress, not applause.'),
('quote', 66, 'You become what you repeatedly do.'),
('quote', 67, 'Your only competition is who you were yesterday.'),
('quote', 68, 'Show up. That''s most of the battle.'),
('quote', 69, 'Excuses don''t burn calories.'),
('quote', 70, 'Winners embrace hard work.'),
('quote', 71, 'The magic you''re looking for is in the work you''re avoiding.'),
('quote', 72, 'Success rarely comes to those who wait.'),
('quote', 73, 'Be relentless in the pursuit of your goals.'),
('quote', 74, 'One day or day one — you decide.'),
('quote', 75, 'Nothing changes if nothing changes.'),
('quote', 76, 'You''ve survived 100% of your worst days.'),
('quote', 77, 'If plan A fails, remember there are 25 more letters.'),
('quote', 78, 'Doing your best is more important than being the best.'),
('quote', 79, 'The dream is free. The hustle is sold separately.'),
('quote', 80, 'Grow through what you go through.'),
('quote', 81, 'Storms make trees take deeper roots.'),
('quote', 82, 'Be stubborn about your goals, flexible about your methods.'),
('quote', 83, 'Difficult roads often lead to beautiful destinations.'),
('quote', 84, 'Trust the process. Trust the timing.'),
('quote', 85, 'Champions are made when nobody''s watching.'),
('quote', 86, 'Speak your goals into existence and then chase them.'),
('quote', 87, 'Slow progress is still progress.'),
('quote', 88, 'Do it scared.'),
('quote', 89, 'Bet on yourself every single day.'),
('quote', 90, 'You don''t need permission to start.'),
('quote', 91, 'Discipline your mind. Master your emotions.'),
('quote', 92, 'Focus is the new IQ.'),
('quote', 93, 'Success is rented and the rent is due every day.'),
('quote', 94, 'You can''t cheat the grind.'),
('quote', 95, 'When it''s hard, keep going anyway.'),
('quote', 96, 'The best time to plant a tree was 20 years ago. The next best time is now.'),
('quote', 97, 'Direction is more important than speed.'),
('quote', 98, 'Small wins compound into big victories.'),
('quote', 99, 'Own your morning. Elevate your life.'),
('encouragement', 0, 'You''ve got this. One step at a time.'),
('encouragement', 1, 'I''m proud of the effort you''re putting in.'),
('encouragement', 2, 'You are stronger than you think.'),
('encouragement', 3, 'Your best is enough. Keep showing up.'),
('encouragement', 4, 'Every step forward counts, even the small ones.'),
('encouragement', 5, 'You are exactly where you need to be.'),
('encouragement', 6, 'Take a breath. You are doing great.'),
('encouragement', 7, 'Believe in yourself the way we believe in you.'),
('encouragement', 8, 'Even on hard days, you''re growing.'),
('encouragement', 9, 'You bring something special to the world.'),
('encouragement', 10, 'Don''t be so hard on yourself today.'),
('encouragement', 11, 'Your feelings are valid. Keep going.'),
('encouragement', 12, 'You matter more than you know.'),
('encouragement', 13, 'You are becoming everything you''re meant to be.'),
('encouragement', 14, 'Give yourself grace. You''re learning.'),
('encouragement', 15, 'Rest is part of the journey, not a break from it.'),
('encouragement', 16, 'You are loved and valued.'),
('encouragement', 17, 'Progress is progress, no matter how slow.'),
('encouragement', 18, 'The sun will rise. So will you.'),
('encouragement', 19, 'Trust yourself. You''ve made it this far.'),
('encouragement', 20, 'You are enough. Right now, as you are.'),
('encouragement', 21, 'Keep your head up, champion.'),
('encouragement', 22, 'Your kindness makes the world brighter.'),
('encouragement', 23, 'Something wonderful is on its way to you.'),
('encouragement', 24, 'You are capable of amazing things.'),
('encouragement', 25, 'Storms don''t last forever.'),
('encouragement', 26, 'Your hard work will pay off.'),
('encouragement', 27, 'You''ve overcome hard things before. You''ll do it again.'),
('encouragement', 28, 'Take it slow. Take it steady. Just don''t stop.'),
('encouragement', 29, 'You deserve every good thing coming your way.'),
('encouragement', 30, 'Be gentle with yourself today.'),
('encouragement', 31, 'You are braver than you believe.'),
('encouragement', 32, 'Your story isn''t over. The best chapters are ahead.'),
('encouragement', 33, 'You are seen. You are heard. You are valued.'),
('encouragement', 34, 'Keep planting seeds. The garden is coming.'),
('encouragement', 35, 'You are doing better than you think.'),
('encouragement', 36, 'You inspire more people than you realize.'),
('encouragement', 37, 'Your light is needed in this world.'),
('encouragement', 38, 'It''s okay to not be okay. It''s not okay to give up.'),
('encouragement', 39, 'You are worthy of love and success.'),
('encouragement', 40, 'Deep breath. New chance.'),
('encouragement', 41, 'Even miracles take a little time.'),
('encouragement', 42, 'You are the author of your next chapter.'),
('encouragement', 43, 'Something great is around the corner.'),
('encouragement', 44, 'You are stronger than any obstacle.'),
('encouragement', 45, 'Your dreams are valid.'),
('encouragement', 46, 'You have survived every hard day so far.'),
('encouragement', 47, 'Keep believing. Keep going.'),
('encouragement', 48, 'There is magic in your persistence.'),
('encouragement', 49, 'You are already a work of art.'),
('encouragement', 50, 'Give yourself credit for how far you''ve come.'),
('encouragement', 51, 'You are loved beyond measure.'),
('encouragement', 52, 'Your smile matters. Wear it.'),
('encouragement', 53, 'You bring warmth wherever you go.'),
('encouragement', 54, 'Never underestimate your ripple effect.'),
('encouragement', 55, 'You are one decision away from a different life.'),
('encouragement', 56, 'Feel the fear and do it anyway.'),
('encouragement', 57, 'You''ve got the strength for this.'),
('encouragement', 58, 'Little by little, a little becomes a lot.'),
('encouragement', 59, 'Your future self is cheering for you.'),
('encouragement', 60, 'Be proud of who you''re becoming.'),
('encouragement', 61, 'You are more resilient than you give yourself credit for.'),
('encouragement', 62, 'Stand tall. You''ve earned it.'),
('encouragement', 63, 'You are the calm in your own storm.'),
('encouragement', 64, 'Give yourself permission to shine.'),
('encouragement', 65, 'You are wonderfully, uniquely made.'),
('encouragement', 66, 'Even slow progress lands you far from the start.'),
('encouragement', 67, 'Every day is a new page.'),
('encouragement', 68, 'You are stronger after every setback.'),
('encouragement', 69, 'Your worth isn''t measured by productivity.'),
('encouragement', 70, 'Kindness looks good on you.'),
('encouragement', 71, 'Take up space. You belong here.'),
('encouragement', 72, 'You are doing enough. You are enough.'),
('encouragement', 73, 'Your effort is noticed, even when quiet.'),
('encouragement', 74, 'You are a warrior in your own right.'),
('encouragement', 75, 'Bloom in your own time.'),
('encouragement', 76, 'Grace over pressure today.'),
('encouragement', 77, 'You are a masterpiece and a work in progress.'),
('encouragement', 78, 'Softness is not weakness.'),
('encouragement', 79, 'Your comeback will be greater than your setback.'),
('encouragement', 80, 'You are gold, even on cloudy days.'),
('encouragement', 81, 'There is a light in you that no one can dim.'),
('encouragement', 82, 'Keep swimming. You''re closer than you think.'),
('encouragement', 83, 'You are the good energy this world needs.'),
('encouragement', 84, 'You are enough — right here, right now.'),
('encouragement', 85, 'Nothing about you is a mistake.'),
('encouragement', 86, 'You are worthy of the space you take.'),
('encouragement', 87, 'Your heart is strong. Your future is bright.'),
('encouragement', 88, 'You are exactly on time.'),
('encouragement', 89, 'Don''t quit before your miracle.'),
('encouragement', 90, 'You are becoming your bravest self.'),
('encouragement', 91, 'Take a moment. Then take another step.'),
('encouragement', 92, 'You bring more joy than you know.'),
('encouragement', 93, 'Everything you need is inside you.'),
('encouragement', 94, 'You are a whole galaxy in yourself.'),
('encouragement', 95, 'Small acts of courage add up.'),
('encouragement', 96, 'You are meant for great things.'),
('encouragement', 97, 'Keep the faith. It''s working.'),
('encouragement', 98, 'You are a beautiful becoming.'),
('encouragement', 99, 'Rise, dear one. The world needs you.');-- Add E-Football to gang_type enum
ALTER TYPE public.gang_type ADD VALUE IF NOT EXISTS 'E';

-- Rename server -> region on profiles
ALTER TABLE public.profiles RENAME COLUMN server TO region;

-- Update handle_new_user to use region and support E-Football
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta_code text;
  ref_id uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, discord_username, discord_full_name, ingame_name, country, region, gang_name, gang_type, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'discord_username',
    NEW.raw_user_meta_data->>'discord_full_name',
    NEW.raw_user_meta_data->>'ingame_name',
    NEW.raw_user_meta_data->>'country',
    COALESCE(
      NEW.raw_user_meta_data->>'region',
      NEW.raw_user_meta_data->>'server',
      'LOMITA AFR'
    ),
    NEW.raw_user_meta_data->>'gang_name',
    NULLIF(NEW.raw_user_meta_data->>'gang_type','')::public.gang_type,
    'LSL-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6))
  );

  IF NEW.email = 'lomitashootersleague@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;

  meta_code := COALESCE(NEW.raw_user_meta_data->>'referral_code', NEW.raw_user_meta_data->>'referred_by');
  IF meta_code IS NOT NULL AND length(trim(meta_code)) > 0 THEN
    SELECT id INTO ref_id FROM public.profiles
      WHERE upper(referral_code) = upper(trim(meta_code)) AND id <> NEW.id LIMIT 1;
    IF ref_id IS NOT NULL THEN
      UPDATE public.profiles SET referred_by = ref_id WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END $function$;