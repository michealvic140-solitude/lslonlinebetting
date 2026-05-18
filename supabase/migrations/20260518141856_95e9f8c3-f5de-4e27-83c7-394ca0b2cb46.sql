
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_virtual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_time timestamptz NULL,
  ADD COLUMN IF NOT EXISTS virtual_first_blood_team_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_matches_is_virtual ON public.matches(is_virtual, start_time DESC);

INSERT INTO public.categories (name, icon)
SELECT 'Virtual Gangs', '🎲'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Virtual Gangs');

CREATE OR REPLACE FUNCTION public.resolve_virtual_round(
  _match_id uuid,
  _home_score int,
  _away_score int,
  _first_blood_team_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  mk record;
  total_kills int := _home_score + _away_score;
  winner_team_id uuid;
  winner_label text;
  cs_label text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO m FROM matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT m.is_virtual THEN RAISE EXCEPTION 'Not a virtual round'; END IF;

  IF _home_score > _away_score THEN winner_team_id := m.home_team_id;
  ELSIF _away_score > _home_score THEN winner_team_id := m.away_team_id;
  ELSE winner_team_id := NULL; END IF;

  cs_label := _home_score || ':' || _away_score;

  UPDATE odds o SET is_winner = false
    FROM markets mm WHERE o.market_id = mm.id AND mm.match_id = _match_id;

  FOR mk IN SELECT * FROM markets WHERE match_id = _match_id LOOP
    IF lower(mk.name) LIKE '%match winner%' OR lower(mk.name) = '1x2' THEN
      IF winner_team_id IS NULL THEN winner_label := 'Draw';
      ELSIF winner_team_id = m.home_team_id THEN
        SELECT name INTO winner_label FROM teams WHERE id = m.home_team_id;
      ELSE
        SELECT name INTO winner_label FROM teams WHERE id = m.away_team_id;
      END IF;
      UPDATE odds SET is_winner = (label = winner_label) WHERE market_id = mk.id;
    ELSIF lower(mk.name) LIKE '%first blood%' THEN
      IF _first_blood_team_id IS NOT NULL THEN
        SELECT name INTO winner_label FROM teams WHERE id = _first_blood_team_id;
        UPDATE odds SET is_winner = (label = winner_label) WHERE market_id = mk.id;
      END IF;
    ELSIF lower(mk.name) LIKE '%total kills%' OR lower(mk.name) LIKE '%over/under%' THEN
      UPDATE odds o SET is_winner = CASE
        WHEN lower(o.label) LIKE 'over %' AND total_kills::numeric > NULLIF(regexp_replace(o.label, '[^0-9.]', '', 'g'), '')::numeric THEN true
        WHEN lower(o.label) LIKE 'under %' AND total_kills::numeric < NULLIF(regexp_replace(o.label, '[^0-9.]', '', 'g'), '')::numeric THEN true
        ELSE false END
      WHERE o.market_id = mk.id;
    ELSIF lower(mk.name) LIKE '%correct score%' THEN
      UPDATE odds SET is_winner = (replace(label, ' ', '') = cs_label) WHERE market_id = mk.id;
    END IF;
  END LOOP;

  UPDATE matches SET
    status = 'ended',
    home_score = _home_score,
    away_score = _away_score,
    winner_team_id = winner_team_id,
    virtual_first_blood_team_id = _first_blood_team_id,
    updated_at = now()
  WHERE id = _match_id;

  WITH bet_ids AS (
    SELECT DISTINCT bs.bet_id FROM bet_selections bs WHERE bs.match_id = _match_id
  ),
  bet_status AS (
    SELECT b.id AS bet_id,
      bool_or(o.is_winner IS FALSE AND o.is_winner IS NOT NULL AND m2.status = 'ended') AS has_loser,
      bool_and(o.is_winner IS TRUE) AS all_winners,
      count(*) FILTER (WHERE m2.status <> 'ended') AS unsettled
    FROM bets b
    JOIN bet_selections bs ON bs.bet_id = b.id
    JOIN odds o ON o.id = bs.odd_id
    JOIN markets mm2 ON mm2.id = bs.market_id
    JOIN matches m2 ON m2.id = bs.match_id
    WHERE b.id IN (SELECT bet_id FROM bet_ids) AND b.status = 'open'
    GROUP BY b.id
  )
  UPDATE bets b SET
    status = CASE WHEN bs.has_loser THEN 'lost'::bet_status
                  WHEN bs.all_winners AND bs.unsettled = 0 THEN 'won'::bet_status
                  ELSE b.status END,
    settled_at = CASE WHEN bs.has_loser OR (bs.all_winners AND bs.unsettled = 0) THEN now() ELSE b.settled_at END
  FROM bet_status bs WHERE b.id = bs.bet_id;

  WITH won_bets AS (
    SELECT b.id, b.user_id, b.potential_payout FROM bets b
    JOIN bet_selections bs ON bs.bet_id = b.id
    WHERE bs.match_id = _match_id AND b.status = 'won' AND b.settled_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM token_transactions tt WHERE tt.user_id = b.user_id AND tt.kind = 'bet_win' AND tt.description LIKE '%' || b.tracking_id || '%')
  )
  UPDATE profiles p SET token_balance = p.token_balance + wb.potential_payout
  FROM won_bets wb WHERE p.id = wb.user_id;

  INSERT INTO token_transactions(user_id, amount, balance_after, kind, description)
  SELECT b.user_id, b.potential_payout,
    (SELECT token_balance FROM profiles WHERE id = b.user_id),
    'bet_win', 'Win: ' || b.tracking_id
  FROM bets b
  JOIN bet_selections bs ON bs.bet_id = b.id
  WHERE bs.match_id = _match_id AND b.status = 'won' AND b.settled_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM token_transactions tt WHERE tt.user_id = b.user_id AND tt.kind = 'bet_win' AND tt.description = 'Win: ' || b.tracking_id);

  RETURN jsonb_build_object('ok', true, 'winner_team_id', winner_team_id, 'total_kills', total_kills);
END $$;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_by uuid,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS virtual_payout_multiplier numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS virtual_min_stake bigint NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS virtual_max_stake bigint NOT NULL DEFAULT 10000000,
  ADD COLUMN IF NOT EXISTS virtual_xp_per_win integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS virtual_win_bonus_tokens bigint NOT NULL DEFAULT 0;

INSERT INTO public.teams (name) SELECT 'Gang A' WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'Gang A');
INSERT INTO public.teams (name) SELECT 'Gang B' WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'Gang B');

CREATE OR REPLACE FUNCTION public.admin_lock_virtual_round(_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO m FROM matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL OR NOT m.is_virtual THEN RAISE EXCEPTION 'Not a virtual round'; END IF;
  IF m.status = 'ended' THEN RAISE EXCEPTION 'Already settled'; END IF;
  UPDATE matches SET lock_time = now(), status = 'live', locked_by = auth.uid(), locked_at = now(), updated_at = now() WHERE id = _match_id;
  UPDATE markets SET is_open = false WHERE match_id = _match_id;
  INSERT INTO audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'virtual_round_locked', 'match', _match_id::text,
            jsonb_build_object('name', m.name, 'at', now()));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.resolve_virtual_round(_match_id uuid, _home_score integer, _away_score integer, _first_blood_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record; mk record;
  total_kills int := _home_score + _away_score;
  winner_team_id uuid;
  winner_label text;
  cs_label text;
  cfg record;
  bonus bigint;
  xp_per_win int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO m FROM matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT m.is_virtual THEN RAISE EXCEPTION 'Not a virtual round'; END IF;
  IF m.status = 'ended' THEN RAISE EXCEPTION 'Already settled'; END IF;

  SELECT virtual_payout_multiplier, virtual_win_bonus_tokens, virtual_xp_per_win INTO cfg FROM app_settings WHERE id=1;
  bonus := COALESCE(cfg.virtual_win_bonus_tokens, 0);
  xp_per_win := COALESCE(cfg.virtual_xp_per_win, 0);

  IF _home_score > _away_score THEN winner_team_id := m.home_team_id;
  ELSIF _away_score > _home_score THEN winner_team_id := m.away_team_id;
  ELSE winner_team_id := NULL; END IF;

  cs_label := _home_score || ':' || _away_score;

  UPDATE odds o SET is_winner = false
    FROM markets mm WHERE o.market_id = mm.id AND mm.match_id = _match_id;

  FOR mk IN SELECT * FROM markets WHERE match_id = _match_id LOOP
    IF lower(mk.name) LIKE '%match winner%' OR lower(mk.name) = '1x2' THEN
      IF winner_team_id IS NULL THEN winner_label := 'Draw';
      ELSIF winner_team_id = m.home_team_id THEN SELECT name INTO winner_label FROM teams WHERE id = m.home_team_id;
      ELSE SELECT name INTO winner_label FROM teams WHERE id = m.away_team_id; END IF;
      UPDATE odds SET is_winner = (label = winner_label) WHERE market_id = mk.id;
    ELSIF lower(mk.name) LIKE '%first blood%' THEN
      IF _first_blood_team_id IS NOT NULL THEN
        SELECT name INTO winner_label FROM teams WHERE id = _first_blood_team_id;
        UPDATE odds SET is_winner = (label = winner_label) WHERE market_id = mk.id;
      END IF;
    ELSIF lower(mk.name) LIKE '%total kills%' OR lower(mk.name) LIKE '%over/under%' THEN
      UPDATE odds o SET is_winner = CASE
        WHEN lower(o.label) LIKE 'over %' AND total_kills::numeric > NULLIF(regexp_replace(o.label, '[^0-9.]', '', 'g'), '')::numeric THEN true
        WHEN lower(o.label) LIKE 'under %' AND total_kills::numeric < NULLIF(regexp_replace(o.label, '[^0-9.]', '', 'g'), '')::numeric THEN true
        ELSE false END
      WHERE o.market_id = mk.id;
    ELSIF lower(mk.name) LIKE '%correct score%' THEN
      UPDATE odds SET is_winner = (replace(label, ' ', '') = cs_label) WHERE market_id = mk.id;
    END IF;
  END LOOP;

  UPDATE matches SET
    status = 'ended', home_score = _home_score, away_score = _away_score,
    winner_team_id = winner_team_id, virtual_first_blood_team_id = _first_blood_team_id,
    settled_by = auth.uid(), settled_at = now(), updated_at = now()
  WHERE id = _match_id;

  WITH bet_ids AS (SELECT DISTINCT bs.bet_id FROM bet_selections bs WHERE bs.match_id = _match_id),
  bet_status AS (
    SELECT b.id AS bet_id,
      bool_or(o.is_winner IS FALSE AND o.is_winner IS NOT NULL AND m2.status = 'ended') AS has_loser,
      bool_and(o.is_winner IS TRUE) AS all_winners,
      count(*) FILTER (WHERE m2.status <> 'ended') AS unsettled
    FROM bets b
    JOIN bet_selections bs ON bs.bet_id = b.id
    JOIN odds o ON o.id = bs.odd_id
    JOIN matches m2 ON m2.id = bs.match_id
    WHERE b.id IN (SELECT bet_id FROM bet_ids) AND b.status = 'open'
    GROUP BY b.id
  )
  UPDATE bets b SET
    status = CASE WHEN bs.has_loser THEN 'lost'::bet_status
                  WHEN bs.all_winners AND bs.unsettled = 0 THEN 'won'::bet_status
                  ELSE b.status END,
    settled_at = CASE WHEN bs.has_loser OR (bs.all_winners AND bs.unsettled = 0) THEN now() ELSE b.settled_at END
  FROM bet_status bs WHERE b.id = bs.bet_id;

  WITH won_bets AS (
    SELECT b.id, b.user_id, b.potential_payout, b.tracking_id FROM bets b
    JOIN bet_selections bs ON bs.bet_id = b.id
    WHERE bs.match_id = _match_id AND b.status = 'won' AND b.settled_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM token_transactions tt WHERE tt.user_id = b.user_id AND tt.kind = 'bet_win' AND tt.description = 'Win: ' || b.tracking_id)
  )
  UPDATE profiles p
  SET token_balance = p.token_balance + (wb.potential_payout * COALESCE(cfg.virtual_payout_multiplier,1.0))::bigint + bonus,
      xp = p.xp + xp_per_win
  FROM won_bets wb WHERE p.id = wb.user_id;

  INSERT INTO token_transactions(user_id, amount, balance_after, kind, description)
  SELECT b.user_id,
    (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier,1.0))::bigint + bonus,
    (SELECT token_balance FROM profiles WHERE id = b.user_id),
    'bet_win', 'Win: ' || b.tracking_id
  FROM bets b
  JOIN bet_selections bs ON bs.bet_id = b.id
  WHERE bs.match_id = _match_id AND b.status = 'won' AND b.settled_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM token_transactions tt WHERE tt.user_id = b.user_id AND tt.kind = 'bet_win' AND tt.description = 'Win: ' || b.tracking_id);

  INSERT INTO audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'virtual_round_resolved', 'match', _match_id::text,
            jsonb_build_object('home', _home_score, 'away', _away_score, 'first_blood', _first_blood_team_id, 'multiplier', cfg.virtual_payout_multiplier, 'bonus', bonus));

  RETURN jsonb_build_object('ok', true, 'winner_team_id', winner_team_id, 'total_kills', total_kills);
END $$;

CREATE OR REPLACE FUNCTION public.place_virtual_bet(_match_id uuid, _odd_id uuid, _stake bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  m record; o record; mk record; p record;
  cfg record;
  payout bigint; new_balance bigint; bet_id uuid; tracking text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO p FROM profiles WHERE id = uid FOR UPDATE;
  IF p.is_banned OR p.is_restricted THEN RAISE EXCEPTION 'Account cannot place bets'; END IF;

  SELECT * INTO m FROM matches WHERE id = _match_id;
  IF m IS NULL OR NOT m.is_virtual THEN RAISE EXCEPTION 'Round not found'; END IF;
  IF m.status <> 'scheduled' THEN RAISE EXCEPTION 'Round is locked'; END IF;
  IF m.lock_time IS NOT NULL AND m.lock_time <= now() THEN RAISE EXCEPTION 'Round is locked'; END IF;

  SELECT * INTO o FROM odds WHERE id = _odd_id;
  IF o IS NULL THEN RAISE EXCEPTION 'Selection not found'; END IF;
  SELECT * INTO mk FROM markets WHERE id = o.market_id;
  IF mk IS NULL OR mk.match_id <> _match_id OR NOT mk.is_open THEN RAISE EXCEPTION 'Market closed'; END IF;

  SELECT virtual_min_stake, virtual_max_stake, max_payout INTO cfg FROM app_settings WHERE id=1;
  IF _stake < COALESCE(cfg.virtual_min_stake, 100000) THEN RAISE EXCEPTION 'Stake below virtual minimum'; END IF;
  IF _stake > COALESCE(cfg.virtual_max_stake, 10000000) THEN RAISE EXCEPTION 'Stake above virtual maximum'; END IF;
  IF p.token_balance < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  payout := LEAST((o.value * _stake)::bigint, COALESCE(cfg.max_payout, 100000000));

  INSERT INTO bets(user_id, stake, total_odds, potential_payout, status)
    VALUES (uid, _stake, o.value, payout, 'open') RETURNING id, tracking_id INTO bet_id, tracking;
  INSERT INTO bet_selections(bet_id, match_id, market_id, odd_id, locked_odds, selection_label)
    VALUES (bet_id, _match_id, mk.id, o.id, o.value, o.label);

  UPDATE profiles SET token_balance = token_balance - _stake WHERE id = uid RETURNING token_balance INTO new_balance;
  INSERT INTO notifications(user_id, title, body, link)
    VALUES (uid, 'Virtual bet placed', tracking || ' · ' || _stake || ' tokens on ' || o.label, '/ticket/' || bet_id);

  RETURN jsonb_build_object('bet_id', bet_id, 'tracking_id', tracking, 'stake', _stake, 'payout', payout, 'balance', new_balance);
END $$;
