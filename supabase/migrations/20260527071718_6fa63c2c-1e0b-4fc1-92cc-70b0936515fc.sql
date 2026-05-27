
-- Fix ambiguous "mk" column reference that was breaking auto_resolve_virtual_round,
-- and shorten the locking window so virtual rounds don't waste the entire pre-match
-- duration in a "locked" state.

CREATE OR REPLACE FUNCTION public.auto_resolve_virtual_round(_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m record; mkt record; score record;
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

  FOR mkt IN SELECT * FROM public.markets WHERE match_id = _match_id LOOP
    IF lower(mkt.name) LIKE '%match winner%' OR lower(mkt.name) LIKE '%win / draw / lose%' OR lower(mkt.name) = '1x2' THEN
      IF v_winner_team_id IS NULL THEN v_winner_label := 'Draw';
      ELSIF v_winner_team_id = m.home_team_id THEN SELECT name INTO v_winner_label FROM public.teams WHERE id = m.home_team_id;
      ELSE SELECT name INTO v_winner_label FROM public.teams WHERE id = m.away_team_id; END IF;
      UPDATE public.odds SET is_winner = (label = v_winner_label) WHERE market_id = mkt.id;
    ELSIF lower(mkt.name) LIKE '%first blood%' THEN
      IF first_team IS NOT NULL THEN
        SELECT name INTO first_label FROM public.teams WHERE id = first_team;
        UPDATE public.odds SET is_winner = (label = first_label) WHERE market_id = mkt.id;
      ELSE
        UPDATE public.odds SET is_winner = false WHERE market_id = mkt.id;
      END IF;
    ELSE
      UPDATE public.markets SET is_open = false WHERE id = mkt.id;
    END IF;
  END LOOP;

  UPDATE public.matches SET status='ended', home_score=hs, away_score=as_,
    winner_team_id=v_winner_team_id, virtual_first_blood_team_id=first_team,
    settled_by=NULL, settled_at=now(), updated_at=now() WHERE id=_match_id;

  UPDATE public.bet_selections bs SET result = CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END
  FROM public.odds o, public.markets mm
  WHERE bs.odd_id = o.id AND o.market_id = mm.id AND bs.match_id = _match_id AND o.is_winner IS NOT NULL;

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
$function$;

-- Shorter pre-match locking window so rounds spawn -> lock quickly -> play -> end.
-- Spawned rounds will lock after virtual_lock_window_seconds (default 8s) instead
-- of the full round duration. The "play" phase uses virtual_animation_seconds.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS virtual_lock_window_seconds int NOT NULL DEFAULT 8;

CREATE OR REPLACE FUNCTION public.virtual_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg record; m record; score record; anim_sec int; dur_sec int; lock_win int;
  active_count int; target_n int;
  t1 uuid; t2 uuid; new_match_id uuid; market_id uuid; fb_market_id uuid;
  team_a_name text; team_b_name text;
  locked_n int := 0; resolved_n int := 0; spawned int := 0; swept int := 0;
  elapsed numeric; tgt_h int; tgt_a int; max_s int;
  i int;
BEGIN
  SELECT virtual_cycle_running, virtual_round_duration_seconds, virtual_animation_seconds,
         virtual_max_score, virtual_concurrent_rounds, virtual_payout_multiplier,
         virtual_win_bonus_tokens, virtual_lock_window_seconds
    INTO cfg FROM public.app_settings WHERE id=1;
  dur_sec  := COALESCE(cfg.virtual_round_duration_seconds, 120);
  anim_sec := COALESCE(cfg.virtual_animation_seconds, 30);
  lock_win := GREATEST(COALESCE(cfg.virtual_lock_window_seconds, 8), 3);
  max_s    := COALESCE(cfg.virtual_max_score, 8);
  target_n := GREATEST(COALESCE(cfg.virtual_concurrent_rounds, 4), 1);

  -- Lock scheduled rounds whose lock_time has arrived.
  FOR m IN SELECT id FROM public.matches
    WHERE is_virtual=true AND status='scheduled' AND lock_time IS NOT NULL AND lock_time <= now()
  LOOP
    UPDATE public.matches SET status='live', locked_at=COALESCE(locked_at,now()), home_score=0, away_score=0, updated_at=now() WHERE id=m.id;
    UPDATE public.markets SET is_open=false WHERE match_id=m.id;
    locked_n := locked_n + 1;
  END LOOP;

  -- Animate scores while the play window is still open.
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

  -- Resolve any live round whose play window has ended.
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
        VALUES (team_a_name || ' vs ' || team_b_name, t1, t2, now(), now() + (lock_win || ' seconds')::interval, 'scheduled', true, false)
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
$function$;

-- Unstick any currently-live virtual matches whose play window already passed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.matches
    WHERE is_virtual=true AND status='live'
      AND lock_time IS NOT NULL
      AND lock_time + interval '60 seconds' <= now()
  LOOP
    PERFORM public.auto_resolve_virtual_round(r.id);
  END LOOP;
END $$;

-- And settle any scheduled rounds whose lock_time has long since passed without locking.
UPDATE public.matches
SET status='ended', settled_at=COALESCE(settled_at, now()), updated_at=now()
WHERE is_virtual=true AND status='scheduled'
  AND lock_time IS NOT NULL AND lock_time + interval '5 minutes' <= now();
