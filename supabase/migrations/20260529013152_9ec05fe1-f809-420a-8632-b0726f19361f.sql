
-- Add batch column used by ported engine (kept alongside legacy virtual_round_id)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS virtual_round_batch_id uuid;
CREATE INDEX IF NOT EXISTS idx_matches_virtual_round_batch_id ON public.matches(virtual_round_batch_id);

-- Server clock RPC so all clients agree with DB time
CREATE OR REPLACE FUNCTION public.server_now()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT now(); $$;
GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated, service_role;

-- Deterministic PRNG by match id
CREATE OR REPLACE FUNCTION public.virtual_seed_rand(_seed text, _i integer)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE STRICT SET search_path TO 'public' AS $$
DECLARE s text := COALESCE(_seed,'') || ':' || _i::text; h bigint := 0; pos integer;
BEGIN
  FOR pos IN 1..char_length(s) LOOP h := mod((h*31) + ascii(substr(s,pos,1)), 1000003); END LOOP;
  RETURN mod(h, 10000)::numeric / 10000;
END;$$;

CREATE OR REPLACE FUNCTION public.virtual_score_for_match(_match_id uuid)
RETURNS TABLE(home_score integer, away_score integer, first_blood_team_id uuid)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE m public.matches%ROWTYPE; event_count integer; i integer;
        event_at numeric; first_at numeric := 2; event_side text;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN home_score:=0; away_score:=0; first_blood_team_id:=NULL; RETURN NEXT; RETURN; END IF;
  home_score:=0; away_score:=0; first_blood_team_id:=NULL;
  event_count := 3 + floor(public.virtual_seed_rand(_match_id::text, 901) * 5)::integer;
  FOR i IN 0..GREATEST(0, event_count-1) LOOP
    event_at := 0.08 + public.virtual_seed_rand(_match_id::text, 920+i) * 0.86;
    IF public.virtual_seed_rand(_match_id::text, 960+i) > 0.48 THEN home_score:=home_score+1; event_side:='home';
    ELSE away_score:=away_score+1; event_side:='away'; END IF;
    IF event_at < first_at THEN
      first_at := event_at;
      first_blood_team_id := CASE WHEN event_side='home' THEN m.home_team_id ELSE m.away_team_id END;
    END IF;
  END LOOP;
  RETURN NEXT;
END;$$;

CREATE OR REPLACE FUNCTION public.resolve_virtual_round(_match_id uuid, _home_score integer DEFAULT NULL, _away_score integer DEFAULT NULL, _first_blood_team_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.matches%ROWTYPE; planned record;
        hs integer; as_ integer; fb uuid; winner uuid;
        bet record; unresolved_count integer; has_lost boolean; is_virtual_bet boolean;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id=_match_id AND is_virtual=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  SELECT * INTO planned FROM public.virtual_score_for_match(_match_id);
  hs := COALESCE(_home_score, CASE WHEN m.status='ended' THEN m.home_score END, planned.home_score, 0);
  as_:= COALESCE(_away_score, CASE WHEN m.status='ended' THEN m.away_score END, planned.away_score, 0);
  fb := COALESCE(_first_blood_team_id, CASE WHEN m.status='ended' THEN m.virtual_first_blood_team_id END, planned.first_blood_team_id,
                 CASE WHEN hs>=as_ THEN m.home_team_id ELSE m.away_team_id END);
  winner := CASE WHEN hs>as_ THEN m.home_team_id WHEN as_>hs THEN m.away_team_id ELSE NULL END;

  UPDATE public.odds o SET is_winner = CASE
    WHEN winner IS NULL AND lower(o.label)='draw' THEN true
    WHEN winner=m.home_team_id AND lower(o.label)=lower(COALESCE((SELECT name FROM public.teams WHERE id=m.home_team_id),'')) THEN true
    WHEN winner=m.away_team_id AND lower(o.label)=lower(COALESCE((SELECT name FROM public.teams WHERE id=m.away_team_id),'')) THEN true
    ELSE false END
    FROM public.markets mk WHERE o.market_id=mk.id AND mk.match_id=_match_id AND mk.name ILIKE '%winner%';

  UPDATE public.odds o SET is_winner = (
    (fb=m.home_team_id AND lower(o.label)=lower(COALESCE((SELECT name FROM public.teams WHERE id=m.home_team_id),'')))
    OR (fb=m.away_team_id AND lower(o.label)=lower(COALESCE((SELECT name FROM public.teams WHERE id=m.away_team_id),'')))
  ) FROM public.markets mk WHERE o.market_id=mk.id AND mk.match_id=_match_id AND mk.name ILIKE '%first%blood%';

  UPDATE public.odds o SET is_winner = (o.label = hs||':'||as_)
    FROM public.markets mk WHERE o.market_id=mk.id AND mk.match_id=_match_id AND mk.name ILIKE '%correct%score%';

  UPDATE public.odds o SET is_winner = CASE
    WHEN o.label ILIKE 'Over%' THEN (hs+as_) > COALESCE(NULLIF(regexp_replace(o.label,'[^0-9.]','','g'),'')::numeric, 4.5)
    WHEN o.label ILIKE 'Under%' THEN (hs+as_) < COALESCE(NULLIF(regexp_replace(o.label,'[^0-9.]','','g'),'')::numeric, 4.5)
    ELSE false END
    FROM public.markets mk WHERE o.market_id=mk.id AND mk.match_id=_match_id AND mk.name ILIKE '%total%';

  UPDATE public.matches SET status='ended', home_score=hs, away_score=as_,
    winner_team_id=winner, virtual_first_blood_team_id=fb,
    settled_at=COALESCE(settled_at, now()), updated_at=now()
   WHERE id=_match_id;

  FOR bet IN SELECT DISTINCT b.* FROM public.bets b
    JOIN public.bet_selections bs ON bs.bet_id=b.id
    WHERE bs.match_id=_match_id AND b.status IN ('open','won')
  LOOP
    UPDATE public.bet_selections bs
      SET result = CASE WHEN o.is_winner IS TRUE THEN 'won' ELSE 'lost' END
      FROM public.odds o
      WHERE bs.odd_id=o.id AND bs.bet_id=bet.id AND bs.match_id=_match_id;

    SELECT COUNT(*) FILTER (WHERE bs2.result IS NULL),
           bool_or(bs2.result = 'lost')
      INTO unresolved_count, has_lost
      FROM public.bet_selections bs2 WHERE bs2.bet_id=bet.id;

    SELECT bool_or(mt.is_virtual) INTO is_virtual_bet
      FROM public.bet_selections bs3
      JOIN public.matches mt ON mt.id=bs3.match_id
     WHERE bs3.bet_id=bet.id;

    IF has_lost IS TRUE THEN
      UPDATE public.bets SET status='lost', settled_at=COALESCE(settled_at, now()) WHERE id=bet.id;
    ELSIF unresolved_count=0 THEN
      UPDATE public.bets SET status='won', settled_at=COALESCE(settled_at, now()) WHERE id=bet.id;
      IF bet.status <> 'won' THEN
        IF is_virtual_bet IS TRUE THEN
          INSERT INTO public.notifications (user_id,title,body,link)
            VALUES (bet.user_id, 'Virtual ticket won — claim now',
              bet.tracking_id||' is eligible for a '||bet.potential_payout::text||' token payout (admin approval required).',
              '/ticket/'||bet.id::text);
        ELSE
          UPDATE public.profiles SET token_balance=token_balance+bet.potential_payout WHERE id=bet.user_id;
          INSERT INTO public.token_transactions (user_id,amount,balance_after,kind,description)
            SELECT bet.user_id, bet.potential_payout, token_balance, 'bet_won', 'Win '||bet.tracking_id
              FROM public.profiles WHERE id=bet.user_id;
          INSERT INTO public.notifications (user_id,title,body,link)
            VALUES (bet.user_id,'Ticket won', bet.tracking_id||' paid '||bet.potential_payout::text||' tokens.', '/ticket/'||bet.id::text);
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'home',hs,'away',as_);
END;$$;

CREATE OR REPLACE FUNCTION public.virtual_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cfg record; dur_sec integer; anim_sec integer; conc integer;
        open_count integer; scheduled_row record; live_row record;
        team_a record; team_b record; cat_id uuid; batch_id uuid; new_match_id uuid; mk_id uuid;
        h int; a int; spawned integer:=0; resolved integer:=0; promoted integer:=0;
BEGIN
  SELECT COALESCE(virtual_cycle_running,false) AS running,
         GREATEST(10, COALESCE(virtual_round_duration_seconds,60)) AS dur,
         GREATEST(8, COALESCE(virtual_animation_seconds,30)) AS anim,
         GREATEST(4, LEAST(6, COALESCE(virtual_concurrent_rounds,4))) AS conc
    INTO cfg FROM public.app_settings WHERE id=1;
  UPDATE public.app_settings SET virtual_cycle_last_tick=now() WHERE id=1;
  IF NOT cfg.running THEN RETURN jsonb_build_object('ok',true,'running',false); END IF;
  dur_sec:=cfg.dur; anim_sec:=cfg.anim; conc:=cfg.conc;

  FOR scheduled_row IN
    SELECT id FROM public.matches
     WHERE is_virtual=true AND status='scheduled' AND COALESCE(lock_time, now()) <= now()
     ORDER BY lock_time ASC
  LOOP
    UPDATE public.matches SET status='live', locked_at=now(), updated_at=now() WHERE id=scheduled_row.id;
    promoted := promoted+1;
  END LOOP;

  FOR live_row IN
    SELECT id FROM public.matches
     WHERE is_virtual=true AND status='live'
       AND COALESCE(locked_at, lock_time, start_time, created_at, now()) + (anim_sec||' seconds')::interval <= now()
     ORDER BY COALESCE(locked_at, lock_time, start_time, created_at) ASC LIMIT 50
  LOOP
    PERFORM public.resolve_virtual_round(live_row.id, NULL, NULL, NULL);
    resolved := resolved+1;
  END LOOP;

  SELECT COUNT(*) INTO open_count FROM public.matches WHERE is_virtual=true AND status IN ('scheduled','live');

  IF open_count = 0 THEN
    batch_id := gen_random_uuid();
    WHILE spawned < conc LOOP
      SELECT id, name INTO team_a FROM public.teams ORDER BY random() LIMIT 1;
      SELECT id, name INTO team_b FROM public.teams WHERE id <> team_a.id ORDER BY random() LIMIT 1;
      EXIT WHEN team_a.id IS NULL OR team_b.id IS NULL;
      SELECT id INTO cat_id FROM public.categories WHERE name='Virtual Gangs' LIMIT 1;
      IF cat_id IS NULL THEN INSERT INTO public.categories (name,icon) VALUES ('Virtual Gangs','🎲') RETURNING id INTO cat_id; END IF;

      INSERT INTO public.matches (name,home_team_id,away_team_id,category_id,status,is_virtual,start_time,lock_time,virtual_round_batch_id,virtual_round_id,home_score,away_score)
        VALUES (team_a.name||' vs '||team_b.name, team_a.id, team_b.id, cat_id, 'scheduled', true, now(), now()+(dur_sec||' seconds')::interval, batch_id, batch_id, 0, 0)
        RETURNING id INTO new_match_id;
      INSERT INTO public.markets (match_id,name,is_open) VALUES (new_match_id,'Match Winner',true) RETURNING id INTO mk_id;
      INSERT INTO public.odds (market_id,label,value) VALUES (mk_id,team_a.name,1.95),(mk_id,'Draw',3.40),(mk_id,team_b.name,1.95);
      INSERT INTO public.markets (match_id,name,is_open) VALUES (new_match_id,'First Blood',true) RETURNING id INTO mk_id;
      INSERT INTO public.odds (market_id,label,value) VALUES (mk_id,team_a.name,1.95),(mk_id,team_b.name,1.95);
      INSERT INTO public.markets (match_id,name,is_open) VALUES (new_match_id,'Total Kills O/U 4.5',true) RETURNING id INTO mk_id;
      INSERT INTO public.odds (market_id,label,value) VALUES (mk_id,'Over 4.5',1.85),(mk_id,'Under 4.5',1.85);
      INSERT INTO public.markets (match_id,name,is_open) VALUES (new_match_id,'Correct Score',true) RETURNING id INTO mk_id;
      FOR h IN 0..7 LOOP FOR a IN 0..7 LOOP
        INSERT INTO public.odds (market_id,label,value) VALUES (mk_id, h::text||':'||a::text, 8.50);
      END LOOP; END LOOP;
      spawned := spawned+1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok',true,'running',true,'spawned',spawned,'promoted',promoted,'resolved',resolved,'open_count',open_count);
END;$$;

GRANT EXECUTE ON FUNCTION public.virtual_tick() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_virtual_round(uuid,integer,integer,uuid) TO authenticated, service_role;
