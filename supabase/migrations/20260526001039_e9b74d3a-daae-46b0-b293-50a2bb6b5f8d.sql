ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_logout_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_once_key
ON public.audit_logs ((metadata->>'dedupe_key'))
WHERE metadata ? 'dedupe_key';

CREATE OR REPLACE FUNCTION public.admin_log_action(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_profile record;
  target_profile record;
  target_match record;
  target_label text;
  actor_roles text[];
  actor_role text;
  enriched jsonb;
  dedupe text;
  inserted_id uuid;
  is_virtual_target boolean := false;
  manual_virtual boolean := false;
BEGIN
  IF actor IS NULL OR NOT public.is_mod_or_admin(actor) THEN
    RAISE EXCEPTION 'Admin or moderator only';
  END IF;

  SELECT full_name, email INTO actor_profile FROM public.profiles WHERE id = actor;
  SELECT array_agg(role::text ORDER BY role::text) INTO actor_roles FROM public.user_roles WHERE user_id = actor;
  actor_role := CASE
    WHEN actor_roles @> ARRAY['admin'] THEN 'admin'
    WHEN actor_roles @> ARRAY['moderator'] THEN 'moderator'
    ELSE COALESCE(actor_roles[1], 'staff')
  END;

  IF _target_type = 'user' AND _target_id IS NOT NULL THEN
    SELECT full_name, email INTO target_profile FROM public.profiles WHERE id = _target_id::uuid;
    target_label := COALESCE(target_profile.full_name, target_profile.email, _target_id);
  ELSIF _target_type = 'match' AND _target_id IS NOT NULL THEN
    SELECT name, is_virtual INTO target_match FROM public.matches WHERE id = _target_id::uuid;
    target_label := COALESCE(target_match.name, _target_id);
    is_virtual_target := COALESCE(target_match.is_virtual, false);
  ELSE
    target_label := COALESCE(_metadata->>'target_name', _metadata->>'name', _target_id, _target_type, 'system');
  END IF;

  manual_virtual := COALESCE((_metadata->>'manual')::boolean, false);
  IF (is_virtual_target OR COALESCE((_metadata->>'is_virtual')::boolean, false)) AND NOT manual_virtual THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'automatic virtual event excluded');
  END IF;

  dedupe := COALESCE(
    NULLIF(_metadata->>'dedupe_key', ''),
    md5(actor::text || ':' || COALESCE(_action,'') || ':' || COALESCE(_target_type,'') || ':' || COALESCE(_target_id,'') || ':' || date_trunc('second', now())::text)
  );

  enriched := COALESCE(_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'dedupe_key', dedupe,
      'actor_id', actor,
      'actor_name', COALESCE(actor_profile.full_name, actor_profile.email, actor::text),
      'actor_email', actor_profile.email,
      'actor_role', actor_role,
      'actor_roles', COALESCE(to_jsonb(actor_roles), '[]'::jsonb),
      'target_type', _target_type,
      'target_id', _target_id,
      'target_name', target_label,
      'target_user_id', CASE WHEN _target_type = 'user' THEN _target_id ELSE COALESCE(_metadata->>'target_user_id', NULL) END,
      'reason', COALESCE(_metadata->>'reason', _metadata->>'purpose', NULL),
      'timestamp_iso', now(),
      'manual', manual_virtual,
      'source', COALESCE(_metadata->>'source', 'admin_panel')
    );

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (actor, _action, _target_type, _target_id, enriched)
  ON CONFLICT ((metadata->>'dedupe_key')) WHERE metadata ? 'dedupe_key' DO NOTHING
  RETURNING id INTO inserted_id;

  RETURN jsonb_build_object('ok', true, 'id', inserted_id, 'dedupe_key', dedupe, 'inserted', inserted_id IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_kick_user(_user_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT public.is_admin(actor) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = actor THEN
    RAISE EXCEPTION 'You cannot kick your own active session';
  END IF;

  UPDATE public.profiles
  SET force_logout_at = now(), updated_at = now()
  WHERE id = _user_id;

  PERFORM public.admin_log_action(
    'user_kicked', 'user', _user_id::text,
    jsonb_build_object('reason', _reason, 'manual', true, 'purpose', 'Force user logout from admin panel')
  );

  INSERT INTO public.notifications(user_id, title, body, link)
  VALUES (_user_id, 'Session ended by admin', COALESCE(_reason, 'Please sign in again to continue.'), '/login');

  RETURN jsonb_build_object('ok', true, 'kicked_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_lock_virtual_round(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE m record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL OR NOT m.is_virtual THEN RAISE EXCEPTION 'Not a virtual round'; END IF;
  IF m.status = 'ended' THEN RAISE EXCEPTION 'Already settled'; END IF;

  UPDATE public.matches
  SET lock_time = LEAST(COALESCE(lock_time, now()), now()), status = 'live', locked_by = auth.uid(), locked_at = now(), updated_at = now()
  WHERE id = _match_id;
  UPDATE public.markets SET is_open = false WHERE match_id = _match_id;

  PERFORM public.admin_log_action('virtual_round_locked', 'match', _match_id::text,
    jsonb_build_object('name', m.name, 'manual', true, 'reason', 'Manual virtual round lock', 'is_virtual', true));
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_virtual_cycle(_running boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.app_settings SET virtual_cycle_running = _running, updated_at = now() WHERE id = 1;
  PERFORM public.admin_log_action(
    CASE WHEN _running THEN 'virtual_cycle_started' ELSE 'virtual_cycle_paused' END,
    'cycle', '1', jsonb_build_object('manual', true, 'reason', 'Manual virtual cycle control')
  );
  PERFORM public.virtual_tick();
  RETURN jsonb_build_object('ok', true, 'running', _running);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_resolve_virtual_round(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record; mk record; score record;
  hs int; as_ int; max_s int;
  v_winner_team_id uuid; v_winner_label text; first_team uuid; first_label text;
  cfg record; bonus bigint;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL OR NOT m.is_virtual THEN RAISE EXCEPTION 'Not a virtual round'; END IF;
  IF m.status = 'ended' THEN RETURN jsonb_build_object('ok', false, 'msg', 'already settled'); END IF;

  SELECT virtual_max_score, virtual_win_bonus_tokens, virtual_xp_per_win, virtual_payout_multiplier
    INTO cfg FROM public.app_settings WHERE id = 1;
  max_s := COALESCE(cfg.virtual_max_score, 8);
  bonus := COALESCE(cfg.virtual_win_bonus_tokens, 0);

  SELECT * INTO score FROM public.virtual_score_for_match(_match_id, max_s);
  hs := score.home_score; as_ := score.away_score;

  IF hs > as_ THEN v_winner_team_id := m.home_team_id;
  ELSIF as_ > hs THEN v_winner_team_id := m.away_team_id;
  ELSE v_winner_team_id := NULL; END IF;

  IF hs + as_ = 0 THEN first_team := NULL;
  ELSIF (('x'||substr(md5(_match_id::text || ':first'),1,8))::bit(32)::bigint % 2) = 0 THEN first_team := m.home_team_id;
  ELSE first_team := m.away_team_id; END IF;

  UPDATE public.odds o SET is_winner = false FROM public.markets mm WHERE o.market_id = mm.id AND mm.match_id = _match_id;

  FOR mk IN SELECT * FROM public.markets WHERE match_id = _match_id LOOP
    IF lower(mk.name) LIKE '%match winner%' OR lower(mk.name) LIKE '%win / draw / lose%' OR lower(mk.name) = '1x2' THEN
      IF v_winner_team_id IS NULL THEN v_winner_label := 'Draw';
      ELSIF v_winner_team_id = m.home_team_id THEN SELECT name INTO v_winner_label FROM public.teams WHERE id = m.home_team_id;
      ELSE SELECT name INTO v_winner_label FROM public.teams WHERE id = m.away_team_id; END IF;
      UPDATE public.odds SET is_winner = (label = v_winner_label) WHERE market_id = mk.id;
    ELSIF lower(mk.name) LIKE '%first blood%' THEN
      IF first_team IS NOT NULL THEN
        SELECT name INTO first_label FROM public.teams WHERE id = first_team;
        UPDATE public.odds SET is_winner = (label = first_label) WHERE market_id = mk.id;
      ELSE
        UPDATE public.odds SET is_winner = false WHERE market_id = mk.id;
      END IF;
    ELSE
      UPDATE public.markets SET is_open = false WHERE id = mk.id;
    END IF;
  END LOOP;

  UPDATE public.matches SET status='ended', home_score=hs, away_score=as_,
    winner_team_id=v_winner_team_id, virtual_first_blood_team_id=first_team,
    settled_by=NULL, settled_at=now(), updated_at=now() WHERE id=_match_id;

  UPDATE public.bet_selections bs SET result = CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END
  FROM public.odds o, public.markets mk
  WHERE bs.odd_id = o.id AND o.market_id = mk.id AND bs.match_id = _match_id AND o.is_winner IS NOT NULL;

  WITH bet_ids AS (SELECT DISTINCT bs.bet_id FROM public.bet_selections bs WHERE bs.match_id = _match_id),
  bet_status AS (
    SELECT b.id AS bet_id,
      bool_or(o.is_winner IS FALSE AND o.is_winner IS NOT NULL AND m2.status='ended') AS has_loser,
      bool_and(o.is_winner IS TRUE) AS all_winners,
      count(*) FILTER (WHERE m2.status <> 'ended') AS unsettled
    FROM public.bets b
    JOIN public.bet_selections bs ON bs.bet_id = b.id
    JOIN public.odds o ON o.id = bs.odd_id
    JOIN public.matches m2 ON m2.id = bs.match_id
    WHERE b.id IN (SELECT bet_id FROM bet_ids) AND b.status='open'
    GROUP BY b.id
  )
  UPDATE public.bets b SET
    status = CASE WHEN bs.has_loser THEN 'lost'::bet_status
                  WHEN bs.all_winners AND bs.unsettled=0 THEN 'won'::bet_status
                  ELSE b.status END,
    settled_at = CASE WHEN bs.has_loser OR (bs.all_winners AND bs.unsettled=0) THEN now() ELSE b.settled_at END
  FROM bet_status bs WHERE b.id = bs.bet_id;

  INSERT INTO public.virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
  SELECT DISTINCT b.id, b.user_id, _match_id, b.stake,
    (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint + bonus, 'pending'
  FROM public.bets b JOIN public.bet_selections bs ON bs.bet_id = b.id
  WHERE bs.match_id = _match_id AND b.status='won' AND b.settled_at IS NOT NULL
  ON CONFLICT (bet_id) DO NOTHING;

  INSERT INTO public.notifications(user_id, title, body, link)
  SELECT DISTINCT b.user_id, 'Virtual ticket won', 'Ticket '||b.tracking_id||' won. Open rounds & claims to continue.', '/virtual/history'
  FROM public.bets b JOIN public.bet_selections bs ON bs.bet_id=b.id
  WHERE bs.match_id=_match_id AND b.status='won';

  RETURN jsonb_build_object('ok', true, 'home', hs, 'away', as_, 'first_blood', first_team);
END;
$$;

CREATE OR REPLACE FUNCTION public.place_virtual_ticket(_selections jsonb, _stake bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.bets(user_id, stake, total_odds, potential_payout, status)
    VALUES (uid, _stake, total_odds, payout, 'open') RETURNING id, tracking_id INTO bet_id, tracking;
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
$$;

CREATE OR REPLACE FUNCTION public.virtual_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg record; m record; score record; anim_sec int; dur_sec int;
  active_count int; target_n int;
  t1 uuid; t2 uuid; new_match_id uuid; market_id uuid; fb_market_id uuid;
  team_a_name text; team_b_name text;
  locked_n int := 0; resolved_n int := 0; spawned int := 0; swept int := 0;
  elapsed numeric; tgt_h int; tgt_a int; max_s int;
  i int;
BEGIN
  SELECT virtual_cycle_running, virtual_round_duration_seconds, virtual_animation_seconds, virtual_max_score, virtual_concurrent_rounds, virtual_payout_multiplier, virtual_win_bonus_tokens
    INTO cfg FROM public.app_settings WHERE id=1;
  dur_sec := COALESCE(cfg.virtual_round_duration_seconds, 120);
  anim_sec := COALESCE(cfg.virtual_animation_seconds, 15);
  max_s := COALESCE(cfg.virtual_max_score, 8);
  target_n := GREATEST(COALESCE(cfg.virtual_concurrent_rounds, 4), 1);

  FOR m IN SELECT id FROM public.matches
    WHERE is_virtual=true AND status='scheduled' AND lock_time IS NOT NULL AND lock_time <= now()
  LOOP
    UPDATE public.matches SET status='live', locked_at=COALESCE(locked_at,now()), home_score=0, away_score=0, updated_at=now() WHERE id=m.id;
    UPDATE public.markets SET is_open=false WHERE match_id=m.id;
    locked_n := locked_n + 1;
  END LOOP;

  FOR m IN SELECT id, lock_time, home_score, away_score FROM public.matches
    WHERE is_virtual=true AND status='live' AND lock_time IS NOT NULL
      AND lock_time + (anim_sec || ' seconds')::interval > now()
  LOOP
    elapsed := EXTRACT(EPOCH FROM (now() - m.lock_time)) / GREATEST(anim_sec, 1);
    elapsed := LEAST(GREATEST(elapsed, 0), 0.98);
    SELECT * INTO score FROM public.virtual_score_for_match(m.id, max_s);
    tgt_h := score.home_score;
    tgt_a := score.away_score;
    UPDATE public.matches SET
      home_score = GREATEST(home_score, floor(tgt_h * elapsed)::int),
      away_score = GREATEST(away_score, floor(tgt_a * elapsed)::int),
      updated_at = now() WHERE id = m.id;
  END LOOP;

  FOR m IN SELECT id FROM public.matches
    WHERE is_virtual=true AND status='live' AND lock_time IS NOT NULL AND lock_time + (anim_sec || ' seconds')::interval <= now()
  LOOP
    PERFORM public.auto_resolve_virtual_round(m.id);
    resolved_n := resolved_n + 1;
  END LOOP;

  UPDATE public.bet_selections bs SET result = CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END
  FROM public.odds o, public.matches m2
  WHERE bs.odd_id = o.id AND bs.match_id = m2.id AND m2.is_virtual=true AND m2.status='ended' AND o.is_winner IS NOT NULL AND bs.result IS DISTINCT FROM CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END;

  WITH affected AS (
    SELECT DISTINCT b.id AS bet_id
    FROM public.bets b
    JOIN public.bet_selections bs ON bs.bet_id = b.id
    JOIN public.matches m2 ON m2.id = bs.match_id
    WHERE b.status='open' AND m2.is_virtual=true
  ),
  bet_status AS (
    SELECT b.id AS bet_id,
      bool_or(o.is_winner IS FALSE AND o.is_winner IS NOT NULL AND m2.status='ended') AS has_loser,
      bool_and(o.is_winner IS TRUE) AS all_winners,
      count(*) FILTER (WHERE m2.status <> 'ended') AS unsettled
    FROM public.bets b
    JOIN public.bet_selections bs ON bs.bet_id = b.id
    JOIN public.odds o ON o.id = bs.odd_id
    JOIN public.matches m2 ON m2.id = bs.match_id
    WHERE b.id IN (SELECT bet_id FROM affected) AND b.status='open'
    GROUP BY b.id
  ),
  upd AS (
    UPDATE public.bets b SET
      status = CASE WHEN bs.has_loser THEN 'lost'::bet_status
                    WHEN bs.all_winners AND bs.unsettled=0 THEN 'won'::bet_status
                    ELSE b.status END,
      settled_at = CASE WHEN bs.has_loser OR (bs.all_winners AND bs.unsettled=0) THEN now() ELSE b.settled_at END
    FROM bet_status bs WHERE b.id = bs.bet_id
      AND (bs.has_loser OR (bs.all_winners AND bs.unsettled=0))
    RETURNING b.id
  )
  SELECT count(*) INTO swept FROM upd;

  INSERT INTO public.virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
  SELECT DISTINCT b.id, b.user_id, bs.match_id, b.stake,
    (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint + COALESCE(cfg.virtual_win_bonus_tokens, 0),
    'pending'
  FROM public.bets b
  JOIN public.bet_selections bs ON bs.bet_id = b.id
  JOIN public.matches m2 ON m2.id = bs.match_id
  WHERE b.status='won' AND m2.is_virtual=true AND m2.status='ended'
  ON CONFLICT (bet_id) DO NOTHING;

  UPDATE public.app_settings SET virtual_cycle_last_tick = now() WHERE id=1;

  IF cfg.virtual_cycle_running THEN
    SELECT count(*) INTO active_count FROM public.matches
      WHERE is_virtual=true AND status IN ('scheduled','live');
    i := 0;
    WHILE active_count + i < target_n LOOP
      SELECT id INTO t1 FROM public.teams ORDER BY random() LIMIT 1;
      SELECT id INTO t2 FROM public.teams WHERE id <> t1 ORDER BY random() LIMIT 1;
      IF t1 IS NULL OR t2 IS NULL THEN EXIT; END IF;
      SELECT name INTO team_a_name FROM public.teams WHERE id=t1;
      SELECT name INTO team_b_name FROM public.teams WHERE id=t2;
      INSERT INTO public.matches(name, home_team_id, away_team_id, start_time, lock_time, status, is_virtual, is_featured)
        VALUES (team_a_name || ' vs ' || team_b_name, t1, t2, now(), now() + (dur_sec || ' seconds')::interval, 'scheduled', true, false)
        RETURNING id INTO new_match_id;
      INSERT INTO public.markets(match_id, name, is_open) VALUES (new_match_id, 'Win / Draw / Lose', true) RETURNING id INTO market_id;
      INSERT INTO public.odds(market_id, label, value) VALUES
        (market_id, team_a_name, round((1.6 + random()*1.4)::numeric,2)),
        (market_id, 'Draw', round((3.0 + random()*1.5)::numeric,2)),
        (market_id, team_b_name, round((1.6 + random()*1.4)::numeric,2));
      INSERT INTO public.markets(match_id, name, is_open) VALUES (new_match_id, 'First Blood', true) RETURNING id INTO fb_market_id;
      INSERT INTO public.odds(market_id, label, value) VALUES
        (fb_market_id, team_a_name, round((1.7 + random()*1.2)::numeric,2)),
        (fb_market_id, team_b_name, round((1.7 + random()*1.2)::numeric,2));
      spawned := spawned + 1;
      i := i + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('locked', locked_n, 'resolved', resolved_n, 'spawned', spawned, 'swept', swept, 'cycle', cfg.virtual_cycle_running, 'target', target_n);
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('virtual_tick_1m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('virtual_tick_1m', '* * * * *', $$SELECT public.virtual_tick();$$);