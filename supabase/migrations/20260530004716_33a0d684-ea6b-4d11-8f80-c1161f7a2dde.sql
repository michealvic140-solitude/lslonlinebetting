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
  planned record;
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
    SELECT * INTO planned FROM public.virtual_score_for_match(scheduled_row.id);
    UPDATE public.matches
       SET status = 'live',
           locked_at = COALESCE(locked_at, lock_time, now()),
           home_score = planned.home_score,
           away_score = planned.away_score,
           virtual_first_blood_team_id = planned.first_blood_team_id,
           updated_at = now()
     WHERE id = scheduled_row.id;
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

GRANT EXECUTE ON FUNCTION public.virtual_tick() TO anon, authenticated, service_role;