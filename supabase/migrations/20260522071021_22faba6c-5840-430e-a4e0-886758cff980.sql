-- Chat message interaction fields
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions readable by authed" ON public.chat_message_reactions;
CREATE POLICY "reactions readable by authed"
ON public.chat_message_reactions
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "users react as self" ON public.chat_message_reactions;
CREATE POLICY "users react as self"
ON public.chat_message_reactions
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND length(emoji) BETWEEN 1 AND 16);

DROP POLICY IF EXISTS "users remove own reaction" ON public.chat_message_reactions;
CREATE POLICY "users remove own reaction"
ON public.chat_message_reactions
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.is_mod_or_admin(auth.uid()));

DROP POLICY IF EXISTS "users edit own chat" ON public.chat_messages;
CREATE POLICY "users edit own chat"
ON public.chat_messages
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.is_mod_or_admin(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_mod_or_admin(auth.uid()));

DROP POLICY IF EXISTS "users delete own chat" ON public.chat_messages;
CREATE POLICY "users delete own chat"
ON public.chat_messages
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.is_mod_or_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to ON public.chat_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON public.chat_message_reactions(message_id);

-- Daily login history de-duplication: keep the first claim per user per UTC day.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, (created_at AT TIME ZONE 'utc')::date, kind
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.token_transactions
  WHERE kind = 'daily_login'
)
DELETE FROM public.token_transactions tt
USING ranked r
WHERE tt.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_login_tx_per_user_day
ON public.token_transactions (user_id, ((created_at AT TIME ZONE 'utc')::date))
WHERE kind = 'daily_login';

CREATE OR REPLACE FUNCTION public.claim_daily_login()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid uuid := auth.uid();
  p record;
  cfg record;
  base_reward bigint := 100000;
  multiplier numeric := 1;
  total bigint;
  today date := (now() at time zone 'utc')::date;
  new_streak int;
  new_balance bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO p FROM profiles WHERE id=uid FOR UPDATE;
  IF p.last_login_date = today THEN
    RETURN jsonb_build_object('already_claimed', true, 'streak', p.streak_days);
  END IF;
  SELECT daily_login_base_reward, daily_login_bonus_per_day, daily_login_max_streak, xp_per_login
    INTO cfg FROM app_settings WHERE id = 1;
  base_reward := COALESCE(cfg.daily_login_base_reward, 100000);
  IF p.last_login_date = today - 1 THEN
    new_streak := p.streak_days + 1;
  ELSE
    new_streak := 1;
  END IF;
  multiplier := 1 + LEAST(new_streak, COALESCE(cfg.daily_login_max_streak, 30)) * COALESCE(cfg.daily_login_bonus_per_day, 0.1);
  total := (base_reward * multiplier)::bigint;
  UPDATE profiles SET
    streak_days = new_streak,
    longest_streak = GREATEST(longest_streak, new_streak),
    last_login_date = today,
    token_balance = token_balance + total,
    xp = COALESCE(xp, 0) + COALESCE(cfg.xp_per_login, 5)
    WHERE id=uid RETURNING token_balance INTO new_balance;
  INSERT INTO token_transactions(user_id, amount, balance_after, kind, description, metadata)
    VALUES (uid, total, new_balance, 'daily_login', 'Daily login streak day '||new_streak, jsonb_build_object('claim_date', today, 'streak', new_streak))
    ON CONFLICT (user_id, ((created_at AT TIME ZONE 'utc')::date)) WHERE kind = 'daily_login' DO NOTHING;
  INSERT INTO notifications(user_id, title, body)
    VALUES (uid, '🔥 Day '||new_streak||' streak!', '+'||total||' tokens credited.');
  RETURN jsonb_build_object('reward', total, 'streak', new_streak, 'balance', new_balance);
END $$;

-- Virtual score helper for first-half display.
CREATE OR REPLACE FUNCTION public.virtual_half_score_for_match(_match_id uuid, _max_score int DEFAULT 8)
RETURNS TABLE(home_score int, away_score int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH final AS (
    SELECT * FROM public.virtual_score_for_match(_match_id, _max_score)
  )
  SELECT
    GREATEST(0, floor(final.home_score * (0.35 + (abs(hashtext(_match_id::text || ':h1')) % 25) / 100.0))::int)::int,
    GREATEST(0, floor(final.away_score * (0.35 + (abs(hashtext(_match_id::text || ':a1')) % 25) / 100.0))::int)::int
  FROM final;
$$;

-- Resolve virtual rounds using only Win / Draw / Lose match-winner outcomes.
CREATE OR REPLACE FUNCTION public.auto_resolve_virtual_round(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m record; mk record; score record;
  hs int; as_ int; max_s int;
  v_winner_team_id uuid; v_winner_label text;
  cfg record; bonus bigint;
BEGIN
  SELECT * INTO m FROM matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL OR NOT m.is_virtual THEN RAISE EXCEPTION 'Not a virtual round'; END IF;
  IF m.status = 'ended' THEN RETURN jsonb_build_object('ok', false, 'msg', 'already settled'); END IF;

  SELECT virtual_max_score, virtual_win_bonus_tokens, virtual_xp_per_win, virtual_payout_multiplier
    INTO cfg FROM app_settings WHERE id = 1;
  max_s := COALESCE(cfg.virtual_max_score, 8);
  bonus := COALESCE(cfg.virtual_win_bonus_tokens, 0);

  SELECT * INTO score FROM public.virtual_score_for_match(_match_id, max_s);
  hs := score.home_score;
  as_ := score.away_score;

  IF hs > as_ THEN v_winner_team_id := m.home_team_id;
  ELSIF as_ > hs THEN v_winner_team_id := m.away_team_id;
  ELSE v_winner_team_id := NULL; END IF;

  UPDATE odds o SET is_winner = false FROM markets mm WHERE o.market_id = mm.id AND mm.match_id = _match_id;

  FOR mk IN SELECT * FROM markets WHERE match_id = _match_id AND (lower(name) LIKE '%match winner%' OR lower(name) = '1x2') LOOP
    IF v_winner_team_id IS NULL THEN v_winner_label := 'Draw';
    ELSIF v_winner_team_id = m.home_team_id THEN SELECT name INTO v_winner_label FROM teams WHERE id = m.home_team_id;
    ELSE SELECT name INTO v_winner_label FROM teams WHERE id = m.away_team_id; END IF;
    UPDATE odds SET is_winner = (label = v_winner_label) WHERE market_id = mk.id;
  END LOOP;

  UPDATE matches SET
    status='ended', home_score=hs, away_score=as_,
    winner_team_id=v_winner_team_id, virtual_first_blood_team_id=NULL,
    settled_by=NULL, settled_at=now(), updated_at=now()
  WHERE id=_match_id;

  UPDATE bet_selections bs SET result = CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END
  FROM odds o, markets mk
  WHERE bs.odd_id = o.id AND o.market_id = mk.id AND bs.match_id = _match_id AND o.is_winner IS NOT NULL;

  WITH bet_ids AS (SELECT DISTINCT bs.bet_id FROM bet_selections bs WHERE bs.match_id = _match_id),
  bet_status AS (
    SELECT b.id AS bet_id,
      bool_or(o.is_winner IS FALSE AND o.is_winner IS NOT NULL AND m2.status='ended') AS has_loser,
      bool_and(o.is_winner IS TRUE) AS all_winners,
      count(*) FILTER (WHERE m2.status <> 'ended') AS unsettled
    FROM bets b
    JOIN bet_selections bs ON bs.bet_id = b.id
    JOIN odds o ON o.id = bs.odd_id
    JOIN matches m2 ON m2.id = bs.match_id
    WHERE b.id IN (SELECT bet_id FROM bet_ids) AND b.status='open'
    GROUP BY b.id
  )
  UPDATE bets b SET
    status = CASE WHEN bs.has_loser THEN 'lost'::bet_status
                  WHEN bs.all_winners AND bs.unsettled=0 THEN 'won'::bet_status
                  ELSE b.status END,
    settled_at = CASE WHEN bs.has_loser OR (bs.all_winners AND bs.unsettled=0) THEN now() ELSE b.settled_at END
  FROM bet_status bs WHERE b.id = bs.bet_id;

  INSERT INTO virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
  SELECT DISTINCT b.id, b.user_id, _match_id, b.stake,
    (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint + bonus,
    'pending'
  FROM bets b
  JOIN bet_selections bs ON bs.bet_id = b.id
  WHERE bs.match_id = _match_id AND b.status='won' AND b.settled_at IS NOT NULL
  ON CONFLICT (bet_id) DO NOTHING;

  INSERT INTO notifications(user_id, title, body, link)
  SELECT DISTINCT b.user_id, 'Virtual ticket won', 'Ticket '||b.tracking_id||' won. Open rounds & claims to continue.', '/virtual/history'
  FROM bets b JOIN bet_selections bs ON bs.bet_id=b.id
  WHERE bs.match_id=_match_id AND b.status='won';

  INSERT INTO audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (NULL, 'virtual_round_resolved', 'match', _match_id::text, jsonb_build_object('home_score', hs, 'away_score', as_, 'winner_team_id', v_winner_team_id));

  RETURN jsonb_build_object('ok', true, 'home', hs, 'away', as_);
END $$;

-- New virtual rounds only create Win / Draw / Lose markets.
CREATE OR REPLACE FUNCTION public.virtual_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg record; m record; score record; anim_sec int; dur_sec int;
  active_count int; target_n int;
  t1 uuid; t2 uuid; new_match_id uuid; market_id uuid;
  team_a_name text; team_b_name text;
  locked_n int := 0; resolved_n int := 0; spawned int := 0; swept int := 0;
  elapsed numeric; tgt_h int; tgt_a int; max_s int;
  i int;
BEGIN
  SELECT virtual_cycle_running, virtual_round_duration_seconds, virtual_animation_seconds, virtual_max_score, virtual_concurrent_rounds, virtual_payout_multiplier, virtual_win_bonus_tokens
    INTO cfg FROM app_settings WHERE id=1;
  dur_sec := COALESCE(cfg.virtual_round_duration_seconds, 120);
  anim_sec := COALESCE(cfg.virtual_animation_seconds, 120);
  max_s := COALESCE(cfg.virtual_max_score, 8);
  target_n := GREATEST(COALESCE(cfg.virtual_concurrent_rounds, 4), 1);

  FOR m IN SELECT id FROM matches
    WHERE is_virtual=true AND status='scheduled' AND lock_time IS NOT NULL AND lock_time <= now()
  LOOP
    UPDATE matches SET status='live', locked_at=COALESCE(locked_at,now()), home_score=0, away_score=0, updated_at=now() WHERE id=m.id;
    UPDATE markets SET is_open=false WHERE match_id=m.id;
    locked_n := locked_n + 1;
  END LOOP;

  FOR m IN SELECT id, lock_time, home_score, away_score FROM matches
    WHERE is_virtual=true AND status='live' AND lock_time IS NOT NULL
      AND lock_time + (anim_sec || ' seconds')::interval > now()
  LOOP
    elapsed := EXTRACT(EPOCH FROM (now() - m.lock_time)) / GREATEST(anim_sec, 1);
    elapsed := LEAST(GREATEST(elapsed, 0), 0.98);
    SELECT * INTO score FROM public.virtual_score_for_match(m.id, max_s);
    tgt_h := score.home_score;
    tgt_a := score.away_score;
    UPDATE matches SET
      home_score = GREATEST(home_score, floor(tgt_h * elapsed)::int),
      away_score = GREATEST(away_score, floor(tgt_a * elapsed)::int),
      updated_at = now() WHERE id = m.id;
  END LOOP;

  FOR m IN SELECT id FROM matches
    WHERE is_virtual=true AND status='live' AND lock_time IS NOT NULL AND lock_time + (anim_sec || ' seconds')::interval <= now()
  LOOP
    PERFORM public.auto_resolve_virtual_round(m.id);
    resolved_n := resolved_n + 1;
  END LOOP;

  UPDATE bet_selections bs SET result = CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END
  FROM odds o, matches m2
  WHERE bs.odd_id = o.id AND bs.match_id = m2.id AND m2.is_virtual=true AND m2.status='ended' AND o.is_winner IS NOT NULL AND bs.result IS DISTINCT FROM CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END;

  WITH affected AS (
    SELECT DISTINCT b.id AS bet_id
    FROM bets b
    JOIN bet_selections bs ON bs.bet_id = b.id
    JOIN matches m2 ON m2.id = bs.match_id
    WHERE b.status='open' AND m2.is_virtual=true
  ),
  bet_status AS (
    SELECT b.id AS bet_id,
      bool_or(o.is_winner IS FALSE AND o.is_winner IS NOT NULL AND m2.status='ended') AS has_loser,
      bool_and(o.is_winner IS TRUE) AS all_winners,
      count(*) FILTER (WHERE m2.status <> 'ended') AS unsettled
    FROM bets b
    JOIN bet_selections bs ON bs.bet_id = b.id
    JOIN odds o ON o.id = bs.odd_id
    JOIN matches m2 ON m2.id = bs.match_id
    WHERE b.id IN (SELECT bet_id FROM affected) AND b.status='open'
    GROUP BY b.id
  ),
  upd AS (
    UPDATE bets b SET
      status = CASE WHEN bs.has_loser THEN 'lost'::bet_status
                    WHEN bs.all_winners AND bs.unsettled=0 THEN 'won'::bet_status
                    ELSE b.status END,
      settled_at = CASE WHEN bs.has_loser OR (bs.all_winners AND bs.unsettled=0) THEN now() ELSE b.settled_at END
    FROM bet_status bs WHERE b.id = bs.bet_id
      AND (bs.has_loser OR (bs.all_winners AND bs.unsettled=0))
    RETURNING b.id
  )
  SELECT count(*) INTO swept FROM upd;

  INSERT INTO virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
  SELECT DISTINCT b.id, b.user_id, bs.match_id, b.stake,
    (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint + COALESCE(cfg.virtual_win_bonus_tokens, 0),
    'pending'
  FROM bets b
  JOIN bet_selections bs ON bs.bet_id = b.id
  JOIN matches m2 ON m2.id = bs.match_id
  WHERE b.status='won' AND m2.is_virtual=true AND m2.status='ended'
  ON CONFLICT (bet_id) DO NOTHING;

  UPDATE app_settings SET virtual_cycle_last_tick = now() WHERE id=1;

  IF cfg.virtual_cycle_running THEN
    SELECT count(*) INTO active_count FROM matches
      WHERE is_virtual=true AND status IN ('scheduled','live');
    i := 0;
    WHILE active_count + i < target_n LOOP
      SELECT id INTO t1 FROM teams ORDER BY random() LIMIT 1;
      SELECT id INTO t2 FROM teams WHERE id <> t1 ORDER BY random() LIMIT 1;
      IF t1 IS NULL OR t2 IS NULL THEN EXIT; END IF;
      SELECT name INTO team_a_name FROM teams WHERE id=t1;
      SELECT name INTO team_b_name FROM teams WHERE id=t2;
      INSERT INTO matches(name, home_team_id, away_team_id, start_time, lock_time, status, is_virtual, is_featured)
        VALUES (team_a_name || ' vs ' || team_b_name, t1, t2, now(), now() + (dur_sec || ' seconds')::interval, 'scheduled', true, false)
        RETURNING id INTO new_match_id;
      INSERT INTO markets(match_id, name, is_open) VALUES (new_match_id, 'Win / Draw / Lose', true) RETURNING id INTO market_id;
      INSERT INTO odds(market_id, label, value) VALUES
        (market_id, team_a_name, round((1.6 + random()*1.4)::numeric,2)),
        (market_id, 'Draw', round((3.0 + random()*1.5)::numeric,2)),
        (market_id, team_b_name, round((1.6 + random()*1.4)::numeric,2));
      spawned := spawned + 1;
      i := i + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('locked', locked_n, 'resolved', resolved_n, 'spawned', spawned, 'swept', swept, 'cycle', cfg.virtual_cycle_running, 'target', target_n);
END $$;

-- Hide deprecated virtual markets from future betting without deleting old ticket history.
UPDATE public.markets
SET is_open = false
WHERE match_id IN (SELECT id FROM public.matches WHERE is_virtual = true AND status = 'scheduled')
  AND lower(name) ~ '(correct score|first blood|total kills|over/under)';

-- Ensure any currently scheduled virtual rounds have a simplified market available.
DO $$
DECLARE r record; market_id uuid; team_a_name text; team_b_name text;
BEGIN
  FOR r IN SELECT m.* FROM matches m WHERE m.is_virtual=true AND m.status='scheduled'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM markets WHERE match_id=r.id AND (lower(name) LIKE '%match winner%' OR lower(name) LIKE '%win / draw / lose%')) THEN
      SELECT name INTO team_a_name FROM teams WHERE id=r.home_team_id;
      SELECT name INTO team_b_name FROM teams WHERE id=r.away_team_id;
      INSERT INTO markets(match_id, name, is_open) VALUES (r.id, 'Win / Draw / Lose', true) RETURNING id INTO market_id;
      INSERT INTO odds(market_id, label, value) VALUES
        (market_id, team_a_name, round((1.6 + random()*1.4)::numeric,2)),
        (market_id, 'Draw', round((3.0 + random()*1.5)::numeric,2)),
        (market_id, team_b_name, round((1.6 + random()*1.4)::numeric,2));
    END IF;
  END LOOP;
END $$;