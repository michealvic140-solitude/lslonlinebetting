
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS virtual_round_id uuid;
CREATE INDEX IF NOT EXISTS idx_matches_virtual_round ON public.matches(virtual_round_id) WHERE is_virtual=true;

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS virtual_matches_per_round int NOT NULL DEFAULT 5;

UPDATE public.app_settings SET
  virtual_lock_window_seconds = GREATEST(COALESCE(virtual_lock_window_seconds, 8), 35),
  virtual_matches_per_round   = COALESCE(virtual_matches_per_round, 5)
WHERE id = 1;

-- Enable realtime for instant UI updates
ALTER TABLE public.matches REPLICA IDENTITY FULL;
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.matches';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.token_transactions';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Rewritten tick: round-based batching
CREATE OR REPLACE FUNCTION public.virtual_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cfg record; m record; score record;
  anim_sec int; dur_sec int; lock_win int; max_s int; per_round int;
  active_count int;
  t1 uuid; t2 uuid; new_match_id uuid; market_id uuid; fb_market_id uuid;
  team_a_name text; team_b_name text;
  locked_n int := 0; resolved_n int := 0; spawned int := 0; swept int := 0;
  elapsed numeric; tgt_h int; tgt_a int;
  new_round uuid; shared_lock timestamptz; i int;
BEGIN
  SELECT virtual_cycle_running, virtual_round_duration_seconds, virtual_animation_seconds,
         virtual_max_score, virtual_payout_multiplier, virtual_win_bonus_tokens,
         virtual_lock_window_seconds, virtual_matches_per_round
    INTO cfg FROM public.app_settings WHERE id=1;
  dur_sec  := COALESCE(cfg.virtual_round_duration_seconds, 120);
  anim_sec := COALESCE(cfg.virtual_animation_seconds, 30);
  lock_win := GREATEST(COALESCE(cfg.virtual_lock_window_seconds, 35), 15);
  max_s    := COALESCE(cfg.virtual_max_score, 8);
  per_round := GREATEST(LEAST(COALESCE(cfg.virtual_matches_per_round, 5), 6), 4);

  -- Lock scheduled rounds whose lock_time has arrived.
  FOR m IN SELECT id FROM public.matches
    WHERE is_virtual=true AND status='scheduled' AND lock_time IS NOT NULL AND lock_time <= now()
  LOOP
    UPDATE public.matches SET status='live', locked_at=COALESCE(locked_at,now()), home_score=0, away_score=0, updated_at=now() WHERE id=m.id;
    UPDATE public.markets SET is_open=false WHERE match_id=m.id;
    locked_n := locked_n + 1;
  END LOOP;

  -- Animate scores while play window is open.
  FOR m IN SELECT id, lock_time, home_score, away_score FROM public.matches
    WHERE is_virtual=true AND status='live' AND lock_time IS NOT NULL
      AND lock_time + (anim_sec || ' seconds')::interval > now()
  LOOP
    elapsed := EXTRACT(EPOCH FROM (now() - m.lock_time)) / GREATEST(anim_sec, 1);
    elapsed := LEAST(GREATEST(elapsed, 0), 0.98);
    SELECT * INTO score FROM public.virtual_score_for_match(m.id, max_s);
    tgt_h := score.home_score; tgt_a := score.away_score;
    UPDATE public.matches SET
      home_score = GREATEST(home_score, floor(tgt_h * elapsed)::int),
      away_score = GREATEST(away_score, floor(tgt_a * elapsed)::int),
      updated_at = now()
    WHERE id = m.id;
  END LOOP;

  -- End live rounds whose play window has elapsed (auto-resolve flips winners + settles).
  FOR m IN SELECT id FROM public.matches
    WHERE is_virtual=true AND status='live' AND lock_time IS NOT NULL
      AND lock_time + (anim_sec || ' seconds')::interval <= now()
  LOOP
    PERFORM public.auto_resolve_virtual_round(m.id);
    resolved_n := resolved_n + 1;
  END LOOP;

  -- Settle bet selections for any ended virtual matches.
  UPDATE public.bet_selections bs SET result = CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END
  FROM public.odds o, public.matches m2
  WHERE bs.odd_id = o.id AND bs.match_id = m2.id AND m2.is_virtual=true AND m2.status='ended'
    AND o.is_winner IS NOT NULL AND bs.result IS DISTINCT FROM CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END;

  WITH affected AS (
    SELECT DISTINCT b.id AS bet_id FROM public.bets b
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

  -- ROUND-BASED spawn: only open a new round when no active virtual matches remain.
  IF cfg.virtual_cycle_running THEN
    SELECT count(*) INTO active_count FROM public.matches
      WHERE is_virtual=true AND status IN ('scheduled','live');
    IF active_count = 0 THEN
      new_round := gen_random_uuid();
      shared_lock := now() + (lock_win || ' seconds')::interval;
      i := 0;
      WHILE i < per_round LOOP
        SELECT id INTO t1 FROM public.teams ORDER BY random() LIMIT 1;
        SELECT id INTO t2 FROM public.teams WHERE id <> t1 ORDER BY random() LIMIT 1;
        IF t1 IS NULL OR t2 IS NULL THEN EXIT; END IF;
        SELECT name INTO team_a_name FROM public.teams WHERE id=t1;
        SELECT name INTO team_b_name FROM public.teams WHERE id=t2;
        INSERT INTO public.matches(name, home_team_id, away_team_id, start_time, lock_time, status, is_virtual, is_featured, virtual_round_id)
          VALUES (team_a_name || ' vs ' || team_b_name, t1, t2, now(), shared_lock, 'scheduled', true, false, new_round)
          RETURNING id INTO new_match_id;
        INSERT INTO public.markets(match_id, name, is_open) VALUES (new_match_id, 'Win / Draw / Lose', true) RETURNING id INTO market_id;
        INSERT INTO public.odds(market_id, label, value) VALUES
          (market_id, team_a_name, round((1.6 + random()*1.4)::numeric,2)),
          (market_id, 'Draw',       round((3.0 + random()*1.5)::numeric,2)),
          (market_id, team_b_name, round((1.6 + random()*1.4)::numeric,2));
        INSERT INTO public.markets(match_id, name, is_open) VALUES (new_match_id, 'First Blood', true) RETURNING id INTO fb_market_id;
        INSERT INTO public.odds(market_id, label, value) VALUES
          (fb_market_id, team_a_name, round((1.7 + random()*1.2)::numeric,2)),
          (fb_market_id, team_b_name, round((1.7 + random()*1.2)::numeric,2));
        spawned := spawned + 1;
        i := i + 1;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object('locked', locked_n, 'resolved', resolved_n, 'spawned', spawned, 'swept', swept, 'cycle', cfg.virtual_cycle_running, 'per_round', per_round);
END;
$function$;
