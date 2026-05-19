-- Virtual Gangs full backend: house wallet, payout requests, cycle engine
-- 1. App settings extensions
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS virtual_cycle_running boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS virtual_round_duration_seconds int NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS virtual_animation_seconds int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS virtual_max_score int NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS virtual_cycle_last_tick timestamptz,
  ADD COLUMN IF NOT EXISTS virtual_concurrent_rounds integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS virtual_max_payout bigint,
  ADD COLUMN IF NOT EXISTS virtual_min_selections int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS virtual_max_selections int NOT NULL DEFAULT 20;

-- 2. Pending payouts table
CREATE TABLE IF NOT EXISTS public.virtual_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  match_id uuid NOT NULL,
  stake bigint NOT NULL,
  amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decline_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bet_id)
);
CREATE INDEX IF NOT EXISTS idx_vpr_status ON public.virtual_payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_vpr_user ON public.virtual_payout_requests(user_id);
ALTER TABLE public.virtual_payout_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vpr own select" ON public.virtual_payout_requests;
CREATE POLICY "vpr own select" ON public.virtual_payout_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));
DROP POLICY IF EXISTS "vpr admin all" ON public.virtual_payout_requests;
CREATE POLICY "vpr admin all" ON public.virtual_payout_requests FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 3. Virtual house wallet
CREATE TABLE IF NOT EXISTS public.virtual_house_wallet (
  id integer PRIMARY KEY DEFAULT 1,
  balance bigint NOT NULL DEFAULT 0,
  total_in bigint NOT NULL DEFAULT 0,
  total_out bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vhw_singleton CHECK (id = 1)
);
INSERT INTO public.virtual_house_wallet(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.virtual_house_wallet ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vhw admin read" ON public.virtual_house_wallet;
CREATE POLICY "vhw admin read" ON public.virtual_house_wallet FOR SELECT TO authenticated USING (is_admin(auth.uid()));
DROP POLICY IF EXISTS "vhw admin update" ON public.virtual_house_wallet;
CREATE POLICY "vhw admin update" ON public.virtual_house_wallet FOR UPDATE TO authenticated USING (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.virtual_house_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  user_id uuid,
  bet_id uuid,
  match_id uuid,
  actor_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.virtual_house_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vht admin read" ON public.virtual_house_transactions;
CREATE POLICY "vht admin read" ON public.virtual_house_transactions FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- 4. Wallet helpers
CREATE OR REPLACE FUNCTION public.virtual_wallet_credit(_amount bigint, _kind text, _user uuid, _bet uuid, _match uuid, _reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_bal bigint;
BEGIN
  UPDATE virtual_house_wallet SET balance = balance + _amount, total_in = total_in + GREATEST(_amount,0), updated_at = now() WHERE id=1 RETURNING balance INTO new_bal;
  INSERT INTO virtual_house_transactions(kind, amount, balance_after, user_id, bet_id, match_id, actor_id, reason)
    VALUES (_kind, _amount, new_bal, _user, _bet, _match, NULL, _reason);
  RETURN new_bal;
END $$;

CREATE OR REPLACE FUNCTION public.virtual_wallet_debit(_amount bigint, _kind text, _user uuid, _bet uuid, _match uuid, _reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_bal bigint; cur bigint;
BEGIN
  SELECT balance INTO cur FROM virtual_house_wallet WHERE id=1 FOR UPDATE;
  IF cur < _amount THEN
    RAISE EXCEPTION 'Virtual wallet has insufficient funds (need %, have %)', _amount, cur USING ERRCODE='P0001';
  END IF;
  UPDATE virtual_house_wallet SET balance = balance - _amount, total_out = total_out + _amount, updated_at = now() WHERE id=1 RETURNING balance INTO new_bal;
  INSERT INTO virtual_house_transactions(kind, amount, balance_after, user_id, bet_id, match_id, actor_id, reason)
    VALUES (_kind, -_amount, new_bal, _user, _bet, _match, NULL, _reason);
  RETURN new_bal;
END $$;

CREATE OR REPLACE FUNCTION public.virtual_wallet_admin_adjust(_amount bigint, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_bal bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _amount = 0 THEN RAISE EXCEPTION 'Amount must be non-zero'; END IF;
  UPDATE virtual_house_wallet
    SET balance = balance + _amount,
        total_in  = total_in  + GREATEST(_amount, 0),
        total_out = total_out + GREATEST(-_amount, 0),
        updated_at = now()
    WHERE id=1 RETURNING balance INTO new_bal;
  IF new_bal < 0 THEN RAISE EXCEPTION 'Adjustment would make wallet negative'; END IF;
  INSERT INTO virtual_house_transactions(kind, amount, balance_after, actor_id, reason)
    VALUES (CASE WHEN _amount>0 THEN 'admin_fund' ELSE 'admin_debit' END, _amount, new_bal, auth.uid(), _reason);
  RETURN jsonb_build_object('balance', new_bal);
END $$;

-- 5. Toggle cycle
CREATE OR REPLACE FUNCTION public.admin_set_virtual_cycle(_running boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE app_settings SET virtual_cycle_running = _running, updated_at = now() WHERE id = 1;
  INSERT INTO audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), CASE WHEN _running THEN 'virtual_cycle_started' ELSE 'virtual_cycle_paused' END, 'cycle', '1', jsonb_build_object('at', now()));
  RETURN jsonb_build_object('ok', true, 'running', _running);
END $$;

-- 6. Auto-resolve round (with lucky-drop win rate)
CREATE OR REPLACE FUNCTION public.auto_resolve_virtual_round(_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record; mk record; prev record;
  hs int; as_ int; max_s int; tries int := 0;
  v_winner_team_id uuid; v_winner_label text;
  v_fb_team_id uuid; v_fb_label text;
  cs_label text; total_kills int;
  cfg record; bonus bigint; xp_per_win int;
  win_rate numeric := 0.0005;
BEGIN
  SELECT * INTO m FROM matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL OR NOT m.is_virtual THEN RAISE EXCEPTION 'Not a virtual round'; END IF;
  IF m.status = 'ended' THEN RETURN jsonb_build_object('ok', false, 'msg', 'already settled'); END IF;

  SELECT virtual_max_score, virtual_win_bonus_tokens, virtual_xp_per_win, virtual_payout_multiplier
    INTO cfg FROM app_settings WHERE id = 1;
  max_s := COALESCE(cfg.virtual_max_score, 8);
  bonus := COALESCE(cfg.virtual_win_bonus_tokens, 0);
  xp_per_win := COALESCE(cfg.virtual_xp_per_win, 0);

  SELECT home_score, away_score INTO prev FROM matches
    WHERE is_virtual = true AND status = 'ended' AND id <> _match_id
    ORDER BY settled_at DESC NULLS LAST LIMIT 1;

  LOOP
    hs := floor(random() * (max_s + 1))::int;
    as_ := floor(random() * (max_s + 1))::int;
    tries := tries + 1;
    EXIT WHEN tries >= 6 OR prev IS NULL OR NOT (hs = prev.home_score AND as_ = prev.away_score);
  END LOOP;
  IF hs = 0 AND as_ = 0 THEN
    IF random() < 0.7 THEN hs := 1 + floor(random()*max_s)::int; END IF;
  END IF;
  total_kills := hs + as_;
  cs_label := hs || ':' || as_;

  IF hs > as_ THEN v_winner_team_id := m.home_team_id;
  ELSIF as_ > hs THEN v_winner_team_id := m.away_team_id;
  ELSE v_winner_team_id := NULL; END IF;

  IF total_kills = 0 THEN v_fb_team_id := NULL;
  ELSIF random() < (hs::numeric / NULLIF(total_kills,0)) THEN v_fb_team_id := m.home_team_id;
  ELSE v_fb_team_id := m.away_team_id; END IF;

  UPDATE odds o SET is_winner = false FROM markets mm WHERE o.market_id = mm.id AND mm.match_id = _match_id;

  FOR mk IN SELECT * FROM markets WHERE match_id = _match_id LOOP
    IF lower(mk.name) LIKE '%match winner%' OR lower(mk.name) = '1x2' THEN
      IF v_winner_team_id IS NULL THEN v_winner_label := 'Draw';
      ELSIF v_winner_team_id = m.home_team_id THEN SELECT name INTO v_winner_label FROM teams WHERE id = m.home_team_id;
      ELSE SELECT name INTO v_winner_label FROM teams WHERE id = m.away_team_id; END IF;
      UPDATE odds SET is_winner = (label = v_winner_label) WHERE market_id = mk.id;
    ELSIF lower(mk.name) LIKE '%first blood%' THEN
      IF v_fb_team_id IS NOT NULL THEN
        SELECT name INTO v_fb_label FROM teams WHERE id = v_fb_team_id;
        UPDATE odds SET is_winner = (label = v_fb_label) WHERE market_id = mk.id;
      END IF;
    ELSIF lower(mk.name) LIKE '%total kills%' OR lower(mk.name) LIKE '%over/under%' THEN
      UPDATE odds o SET is_winner = CASE
        WHEN lower(o.label) LIKE 'over %' AND total_kills::numeric > NULLIF(regexp_replace(o.label, '[^0-9.]', '', 'g'), '')::numeric THEN true
        WHEN lower(o.label) LIKE 'under %' AND total_kills::numeric < NULLIF(regexp_replace(o.label, '[^0-9.]', '', 'g'), '')::numeric THEN true
        ELSE false END WHERE o.market_id = mk.id;
    ELSIF lower(mk.name) LIKE '%correct score%' THEN
      UPDATE odds SET is_winner = (replace(label,' ','') = cs_label) WHERE market_id = mk.id;
    END IF;
  END LOOP;

  UPDATE matches SET
    status='ended', home_score=hs, away_score=as_,
    winner_team_id=v_winner_team_id, virtual_first_blood_team_id=v_fb_team_id,
    settled_by=NULL, settled_at=now(), updated_at=now()
  WHERE id=_match_id;

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

  UPDATE bets b SET status='lost'::bet_status
  WHERE b.id IN (
    SELECT DISTINCT b2.id FROM bets b2
    JOIN bet_selections bs ON bs.bet_id = b2.id
    WHERE bs.match_id = _match_id AND b2.status='won' AND b2.settled_at IS NOT NULL
  ) AND random() > win_rate;

  INSERT INTO virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
  SELECT DISTINCT b.id, b.user_id, _match_id, b.stake,
    (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint + bonus,
    'pending'
  FROM bets b
  JOIN bet_selections bs ON bs.bet_id = b.id
  WHERE bs.match_id = _match_id AND b.status='won' AND b.settled_at IS NOT NULL
  ON CONFLICT (bet_id) DO NOTHING;

  INSERT INTO notifications(user_id, title, body, link)
  SELECT DISTINCT b.user_id, 'Lucky win - awaiting approval',
    'Your virtual ticket ' || b.tracking_id || ' is pending admin approval.',
    '/virtual/history'
  FROM bets b
  JOIN bet_selections bs ON bs.bet_id = b.id
  JOIN virtual_payout_requests vpr ON vpr.bet_id = b.id
  WHERE bs.match_id = _match_id AND vpr.status='pending';

  INSERT INTO audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (NULL, 'virtual_round_auto_resolved', 'match', _match_id::text,
            jsonb_build_object('home', hs, 'away', as_, 'first_blood', v_fb_team_id, 'win_rate', win_rate));

  RETURN jsonb_build_object('ok', true, 'home', hs, 'away', as_, 'first_blood', v_fb_team_id);
END $$;

-- 7. Admin review payout (uses virtual wallet)
CREATE OR REPLACE FUNCTION public.admin_review_virtual_payout(_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; wallet_bal bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO r FROM virtual_payout_requests WHERE id = _id FOR UPDATE;
  IF r IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  IF _approve THEN
    SELECT balance INTO wallet_bal FROM virtual_house_wallet WHERE id=1;
    IF wallet_bal < r.amount THEN
      RAISE EXCEPTION 'Virtual wallet underfunded: need %, have %', r.amount, wallet_bal;
    END IF;
    UPDATE virtual_payout_requests SET status='approved', reviewed_by=auth.uid(), reviewed_at=now() WHERE id=_id;
    INSERT INTO notifications(user_id, title, body, link)
      VALUES (r.user_id, 'Virtual win approved', 'Your payout of '|| r.amount ||' tokens is ready to claim.', '/virtual/history');
  ELSE
    UPDATE virtual_payout_requests SET status='declined', decline_reason=_reason, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=_id;
    INSERT INTO notifications(user_id, title, body, link)
      VALUES (r.user_id, 'Virtual win declined', COALESCE(_reason,'No reason provided'), '/virtual/history');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 8. Claim payout (debits virtual wallet)
CREATE OR REPLACE FUNCTION public.claim_virtual_payout(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; new_bal bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO r FROM virtual_payout_requests WHERE id = _id FOR UPDATE;
  IF r IS NULL OR r.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not yours'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Not approved'; END IF;
  PERFORM public.virtual_wallet_debit(r.amount, 'payout', r.user_id, r.bet_id, r.match_id, 'Virtual payout claim');
  UPDATE profiles SET token_balance = token_balance + r.amount,
      xp = xp + COALESCE((SELECT virtual_xp_per_win FROM app_settings WHERE id=1),0)
    WHERE id = auth.uid() RETURNING token_balance INTO new_bal;
  INSERT INTO token_transactions(user_id, amount, balance_after, kind, description)
    VALUES (auth.uid(), r.amount, new_bal, 'bet_win', 'Virtual claim');
  UPDATE virtual_payout_requests SET status='claimed', claimed_at=now() WHERE id=_id;
  RETURN jsonb_build_object('ok', true, 'amount', r.amount, 'balance', new_bal);
END $$;

-- 9. Place virtual bet (single) — routes stake into virtual wallet
CREATE OR REPLACE FUNCTION public.place_virtual_bet(_match_id uuid, _odd_id uuid, _stake bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  m record; o record; mk record; p record;
  cfg record; cap bigint;
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
  SELECT virtual_min_stake, virtual_max_stake, max_payout, virtual_max_payout, virtual_min_selections INTO cfg FROM app_settings WHERE id=1;
  IF COALESCE(cfg.virtual_min_selections,1) > 1 THEN RAISE EXCEPTION 'Minimum % selections required', cfg.virtual_min_selections; END IF;
  IF _stake < COALESCE(cfg.virtual_min_stake, 100000) THEN RAISE EXCEPTION 'Stake below virtual minimum'; END IF;
  IF _stake > COALESCE(cfg.virtual_max_stake, 10000000) THEN RAISE EXCEPTION 'Stake above virtual maximum'; END IF;
  IF p.token_balance < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  cap := COALESCE(cfg.virtual_max_payout, cfg.max_payout, 100000000);
  payout := LEAST((o.value * _stake)::bigint, cap);
  INSERT INTO bets(user_id, stake, total_odds, potential_payout, status)
    VALUES (uid, _stake, o.value, payout, 'open') RETURNING id, tracking_id INTO bet_id, tracking;
  INSERT INTO bet_selections(bet_id, match_id, market_id, odd_id, locked_odds, selection_label)
    VALUES (bet_id, _match_id, mk.id, o.id, o.value, o.label);
  UPDATE profiles SET token_balance = token_balance - _stake WHERE id = uid RETURNING token_balance INTO new_balance;
  PERFORM public.virtual_wallet_credit(_stake, 'stake', uid, bet_id, _match_id, 'Virtual stake');
  INSERT INTO notifications(user_id, title, body, link)
    VALUES (uid, 'Virtual bet placed', tracking || ' - ' || _stake || ' tokens on ' || o.label, '/ticket/' || bet_id);
  RETURN jsonb_build_object('bet_id', bet_id, 'tracking_id', tracking, 'stake', _stake, 'payout', payout, 'balance', new_balance);
END $$;

-- 10. Place virtual ticket (multi)
CREATE OR REPLACE FUNCTION public.place_virtual_ticket(_selections jsonb, _stake bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); p record; cfg record;
  total_odds numeric := 1; payout bigint; bet_id uuid; tracking text; new_bal bigint;
  s jsonb; o record; mk record; m record;
  first_match uuid; sel_count int; cap bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  sel_count := jsonb_array_length(_selections);
  SELECT * INTO p FROM profiles WHERE id = uid FOR UPDATE;
  IF p.is_banned OR p.is_restricted THEN RAISE EXCEPTION 'Account restricted'; END IF;
  SELECT virtual_min_stake, virtual_max_stake, max_payout, virtual_max_payout, virtual_min_selections, virtual_max_selections INTO cfg FROM app_settings WHERE id=1;
  IF sel_count < COALESCE(cfg.virtual_min_selections,1) THEN RAISE EXCEPTION 'Minimum % selections required', COALESCE(cfg.virtual_min_selections,1); END IF;
  IF sel_count > COALESCE(cfg.virtual_max_selections,20) THEN RAISE EXCEPTION 'Maximum % selections allowed', COALESCE(cfg.virtual_max_selections,20); END IF;
  IF _stake < COALESCE(cfg.virtual_min_stake,100000) THEN RAISE EXCEPTION 'Stake below minimum'; END IF;
  IF _stake > COALESCE(cfg.virtual_max_stake,10000000) THEN RAISE EXCEPTION 'Stake above maximum'; END IF;
  IF p.token_balance < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    SELECT * INTO o FROM odds WHERE id = (s->>'odd_id')::uuid;
    IF o IS NULL THEN RAISE EXCEPTION 'Bad selection'; END IF;
    SELECT * INTO mk FROM markets WHERE id = o.market_id;
    SELECT * INTO m FROM matches WHERE id = mk.match_id;
    IF NOT m.is_virtual THEN RAISE EXCEPTION 'Not virtual'; END IF;
    IF m.status <> 'scheduled' OR (m.lock_time IS NOT NULL AND m.lock_time <= now()) OR NOT mk.is_open THEN
      RAISE EXCEPTION 'Round locked: %', m.name;
    END IF;
    total_odds := total_odds * o.value;
    IF first_match IS NULL THEN first_match := m.id; END IF;
  END LOOP;
  cap := COALESCE(cfg.virtual_max_payout, cfg.max_payout, 100000000);
  payout := LEAST((total_odds * _stake)::bigint, cap);
  INSERT INTO bets(user_id, stake, total_odds, potential_payout, status)
    VALUES (uid, _stake, total_odds, payout, 'open') RETURNING id, tracking_id INTO bet_id, tracking;
  FOR s IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    SELECT * INTO o FROM odds WHERE id = (s->>'odd_id')::uuid;
    SELECT * INTO mk FROM markets WHERE id = o.market_id;
    INSERT INTO bet_selections(bet_id, match_id, market_id, odd_id, locked_odds, selection_label)
      VALUES (bet_id, mk.match_id, mk.id, o.id, o.value, o.label);
  END LOOP;
  UPDATE profiles SET token_balance = token_balance - _stake WHERE id=uid RETURNING token_balance INTO new_bal;
  PERFORM public.virtual_wallet_credit(_stake, 'stake', uid, bet_id, first_match, 'Virtual ticket stake');
  INSERT INTO notifications(user_id, title, body, link)
    VALUES (uid, 'Virtual ticket placed', tracking || ' - ' || _stake || ' tokens', '/ticket/' || bet_id);
  RETURN jsonb_build_object('bet_id', bet_id, 'tracking_id', tracking, 'stake', _stake, 'payout', payout, 'balance', new_bal);
END $$;

-- 11. Virtual tick: maintain N concurrent rounds + lock + animate + resolve + sweep
CREATE OR REPLACE FUNCTION public.virtual_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record; m record; anim_sec int; dur_sec int;
  active_count int; target_n int;
  t1 uuid; t2 uuid; new_match_id uuid; market_id uuid;
  team_a_name text; team_b_name text;
  locked_n int := 0; resolved_n int := 0; spawned int := 0; swept int := 0;
  elapsed numeric; tgt_h int; tgt_a int; max_s int;
  i int;
BEGIN
  SELECT virtual_cycle_running, virtual_round_duration_seconds, virtual_animation_seconds, virtual_max_score, virtual_concurrent_rounds
    INTO cfg FROM app_settings WHERE id=1;
  dur_sec := COALESCE(cfg.virtual_round_duration_seconds, 120);
  anim_sec := COALESCE(cfg.virtual_animation_seconds, 30);
  max_s := COALESCE(cfg.virtual_max_score, 8);
  target_n := GREATEST(COALESCE(cfg.virtual_concurrent_rounds, 4), 1);

  FOR m IN SELECT id FROM matches
    WHERE is_virtual=true AND status='scheduled' AND lock_time IS NOT NULL AND lock_time <= now()
  LOOP
    UPDATE matches SET status='live', locked_at=COALESCE(locked_at,now()), updated_at=now() WHERE id=m.id;
    UPDATE markets SET is_open=false WHERE match_id=m.id;
    locked_n := locked_n + 1;
  END LOOP;

  FOR m IN SELECT id, lock_time, home_score, away_score FROM matches
    WHERE is_virtual=true AND status='live' AND lock_time IS NOT NULL
      AND lock_time + (anim_sec || ' seconds')::interval > now()
  LOOP
    elapsed := EXTRACT(EPOCH FROM (now() - m.lock_time)) / GREATEST(anim_sec, 1);
    elapsed := LEAST(GREATEST(elapsed, 0), 0.95);
    tgt_h := (abs(hashtext(m.id::text || ':h')) % (max_s + 1));
    tgt_a := (abs(hashtext(m.id::text || ':a')) % (max_s + 1));
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
      INSERT INTO markets(match_id, name, is_open) VALUES (new_match_id, 'Match Winner', true) RETURNING id INTO market_id;
      INSERT INTO odds(market_id, label, value) VALUES
        (market_id, team_a_name, round((1.6 + random()*1.4)::numeric,2)),
        (market_id, 'Draw', round((3.0 + random()*1.5)::numeric,2)),
        (market_id, team_b_name, round((1.6 + random()*1.4)::numeric,2));
      INSERT INTO markets(match_id, name, is_open) VALUES (new_match_id, 'First Blood', true) RETURNING id INTO market_id;
      INSERT INTO odds(market_id, label, value) VALUES
        (market_id, team_a_name, round((1.7 + random()*0.4)::numeric,2)),
        (market_id, team_b_name, round((1.7 + random()*0.4)::numeric,2));
      INSERT INTO markets(match_id, name, is_open) VALUES (new_match_id, 'Total Kills', true) RETURNING id INTO market_id;
      INSERT INTO odds(market_id, label, value) VALUES
        (market_id, 'Over 4.5', round((1.8 + random()*0.4)::numeric,2)),
        (market_id, 'Under 4.5', round((1.8 + random()*0.4)::numeric,2));
      INSERT INTO markets(match_id, name, is_open) VALUES (new_match_id, 'Correct Score', true) RETURNING id INTO market_id;
      INSERT INTO odds(market_id, label, value) VALUES
        (market_id, '1:0', 6.5),(market_id,'2:0',9.0),(market_id,'2:1',8.0),
        (market_id, '0:1', 6.5),(market_id,'0:2',9.0),(market_id,'1:2',8.0),
        (market_id, '1:1', 5.5),(market_id,'2:2',12.0),(market_id,'3:1',14.0),
        (market_id, '1:3', 14.0),(market_id,'0:0',8.0),(market_id,'3:0',16.0);
      spawned := spawned + 1;
      i := i + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('locked', locked_n, 'resolved', resolved_n, 'spawned', spawned, 'swept', swept, 'cycle', cfg.virtual_cycle_running, 'target', target_n);
END $$;

GRANT EXECUTE ON FUNCTION public.virtual_tick() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_virtual_cycle(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_virtual_payout(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_virtual_payout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.virtual_wallet_admin_adjust(bigint, text) TO authenticated;

UPDATE app_settings SET virtual_animation_seconds = 120, virtual_round_duration_seconds = 120, updated_at = now() WHERE id = 1;

-- 12. Cron tick every minute (closest pg_cron supports without 1-second resolution)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'virtual_tick_1m') THEN
    PERFORM cron.schedule('virtual_tick_1m', '* * * * *', $cron$SELECT public.virtual_tick();$cron$);
  END IF;
END $$;
