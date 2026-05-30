DROP FUNCTION IF EXISTS public.virtual_score_for_match(uuid, integer);

CREATE OR REPLACE FUNCTION public.virtual_score_for_match(_match_id uuid)
RETURNS TABLE(home_score integer, away_score integer, first_blood_team_id uuid)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  m public.matches%ROWTYPE;
  cfg record;
  max_s integer;
  raw_h integer;
  raw_a integer;
  first_pick numeric;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN
    home_score := 0;
    away_score := 0;
    first_blood_team_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT virtual_max_score INTO cfg FROM public.app_settings WHERE id = 1;
  max_s := GREATEST(1, LEAST(30, COALESCE(cfg.virtual_max_score, 8)));

  raw_h := floor(public.virtual_seed_rand(_match_id::text, 3101) * (max_s + 1))::integer;
  raw_a := floor(public.virtual_seed_rand(_match_id::text, 3102) * (max_s + 1))::integer;

  IF raw_h = 0 AND raw_a = 0 THEN
    IF public.virtual_seed_rand(_match_id::text, 3103) >= 0.5 THEN
      raw_h := 1;
    ELSE
      raw_a := 1;
    END IF;
  END IF;

  IF max_s >= 3 AND raw_h = 0 AND raw_a >= 3 THEN
    raw_h := 1 + floor(public.virtual_seed_rand(_match_id::text, 3104) * LEAST(3, max_s))::integer;
  END IF;
  IF max_s >= 3 AND raw_a = 0 AND raw_h >= 3 THEN
    raw_a := 1 + floor(public.virtual_seed_rand(_match_id::text, 3105) * LEAST(3, max_s))::integer;
  END IF;

  home_score := LEAST(raw_h, max_s);
  away_score := LEAST(raw_a, max_s);
  first_pick := public.virtual_seed_rand(_match_id::text, 3106);
  first_blood_team_id := CASE
    WHEN home_score + away_score = 0 THEN NULL
    WHEN home_score = 0 THEN m.away_team_id
    WHEN away_score = 0 THEN m.home_team_id
    WHEN first_pick < (home_score::numeric / GREATEST(1, home_score + away_score)) THEN m.home_team_id
    ELSE m.away_team_id
  END;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_resolve_virtual_round(_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public.resolve_virtual_round(_match_id, NULL, NULL, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_virtual_round(_match_id uuid, _home_score integer DEFAULT NULL, _away_score integer DEFAULT NULL, _first_blood_team_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    ELSIF unresolved_count = 0 THEN
      UPDATE public.bets SET status = 'won', settled_at = COALESCE(settled_at, now()) WHERE id = bet.id;
      IF bet.status <> 'won' THEN
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
END;
$$;

CREATE OR REPLACE FUNCTION public.virtual_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  cfg record;
  dur_sec integer;
  anim_sec integer;
  match_count integer;
  active_count integer;
  scheduled_row record;
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
  promoted integer := 0;
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

  FOR scheduled_row IN
    SELECT id FROM public.matches
     WHERE is_virtual = true AND status = 'scheduled' AND COALESCE(lock_time, now()) <= now()
     ORDER BY lock_time ASC
  LOOP
    UPDATE public.matches SET status = 'live', locked_at = COALESCE(locked_at, lock_time, now()), updated_at = now() WHERE id = scheduled_row.id;
    UPDATE public.markets SET is_open = false WHERE match_id = scheduled_row.id;
    promoted := promoted + 1;
  END LOOP;

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
    RETURN jsonb_build_object('ok', true, 'running', false, 'spawned', 0, 'promoted', promoted, 'resolved', resolved);
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

      INSERT INTO public.matches (name, home_team_id, away_team_id, category_id, status, is_virtual, start_time, lock_time, virtual_round_batch_id, virtual_round_id, home_score, away_score)
        VALUES (team_a.name || ' vs ' || team_b.name, team_a.id, team_b.id, cat_id, 'scheduled', true, now(), now() + (dur_sec || ' seconds')::interval, batch_id, batch_id, 0, 0)
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

  RETURN jsonb_build_object('ok', true, 'running', true, 'spawned', spawned, 'promoted', promoted, 'resolved', resolved, 'active_count', active_count, 'matches_per_round', match_count, 'round_seconds', dur_sec, 'animation_seconds', anim_sec);
END;
$$;

GRANT EXECUTE ON FUNCTION public.virtual_score_for_match(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_resolve_virtual_round(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_virtual_round(uuid, integer, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.virtual_tick() TO anon, authenticated, service_role;

SELECT public.virtual_tick();