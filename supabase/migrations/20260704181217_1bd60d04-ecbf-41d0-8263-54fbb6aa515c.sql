-- Consolidated upstream migrations 2026-06-17 → 2026-07-04
-- (paste of /tmp/combined.sql content follows)

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS site_bg_url text,
  ADD COLUMN IF NOT EXISTS admin_hero_url text;
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS site_logo_url text,
  ADD COLUMN IF NOT EXISTS site_bg_fit text DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS site_bg_position text DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS admin_hero_fit text DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS admin_hero_position text DEFAULT 'center right';
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS hero_title text,
  ADD COLUMN IF NOT EXISTS hero_subtitle text,
  ADD COLUMN IF NOT EXISTS nav_bg_url text,
  ADD COLUMN IF NOT EXISTS nav_bg_fit text DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS nav_bg_position text DEFAULT 'center';

CREATE OR REPLACE FUNCTION public.recalc_vip_tier(_user_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE cur_xp bigint; new_tier text; old_tier text; tier_rank int; old_rank int;
BEGIN
  SELECT xp, vip_tier INTO cur_xp, old_tier FROM public.profiles WHERE id = _user_id;
  IF cur_xp IS NULL THEN RETURN NULL; END IF;
  new_tier := CASE
    WHEN cur_xp >= 250000 THEN 'immortal'
    WHEN cur_xp >= 100000 THEN 'titan'
    WHEN cur_xp >= 50000  THEN 'mythic'
    WHEN cur_xp >= 25000  THEN 'legend'
    WHEN cur_xp >= 10000  THEN 'platinum'
    WHEN cur_xp >= 3000   THEN 'gold'
    WHEN cur_xp >= 500    THEN 'silver'
    ELSE 'bronze' END;
  IF new_tier <> COALESCE(old_tier,'bronze') THEN
    UPDATE public.profiles SET vip_tier = new_tier WHERE id = _user_id;
    tier_rank := CASE new_tier WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'platinum' THEN 4 WHEN 'legend' THEN 5 WHEN 'mythic' THEN 6 WHEN 'titan' THEN 7 ELSE 8 END;
    old_rank  := CASE COALESCE(old_tier,'bronze') WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'platinum' THEN 4 WHEN 'legend' THEN 5 WHEN 'mythic' THEN 6 WHEN 'titan' THEN 7 ELSE 8 END;
    IF tier_rank > old_rank THEN
      INSERT INTO public.notifications(user_id, title, body, link)
        VALUES (_user_id, '🎉 VIP Tier Up!', 'You have reached ' || upper(new_tier) || ' tier.', '/dashboard');
    END IF;
  END IF;
  RETURN new_tier;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_xp(_user_id uuid, _delta integer, _reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE new_xp bigint; new_tier text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE profiles SET xp = GREATEST(0, xp + _delta) WHERE id = _user_id RETURNING xp INTO new_xp;
  new_tier := CASE
    WHEN new_xp >= 250000 THEN 'immortal'
    WHEN new_xp >= 100000 THEN 'titan'
    WHEN new_xp >= 50000  THEN 'mythic'
    WHEN new_xp >= 25000  THEN 'legend'
    WHEN new_xp >= 10000  THEN 'platinum'
    WHEN new_xp >= 3000   THEN 'gold'
    WHEN new_xp >= 500    THEN 'silver'
    ELSE 'bronze' END;
  UPDATE profiles SET vip_tier = new_tier WHERE id = _user_id;
  INSERT INTO audit_logs(actor_id, action, target_type, target_id, metadata) VALUES (auth.uid(), 'admin_adjust_xp', 'profile', _user_id::text, jsonb_build_object('delta', _delta, 'reason', _reason, 'new_xp', new_xp));
  RETURN jsonb_build_object('xp', new_xp, 'vip_tier', new_tier);
END $function$;

CREATE OR REPLACE FUNCTION public.verify_xp_consistency(_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE checked int := 0; fixed int := 0; r record; calc_xp bigint; rules record; new_tier text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT xp_per_bet, xp_per_win, xp_per_login, xp_per_referral INTO rules FROM app_settings WHERE id = 1;
  FOR r IN SELECT id, xp, vip_tier FROM profiles WHERE (_user_id IS NULL OR id = _user_id) LOOP
    checked := checked + 1;
    SELECT
      COALESCE((SELECT count(*) FROM bets WHERE user_id = r.id),0) * rules.xp_per_bet +
      COALESCE((SELECT count(*) FROM bets WHERE user_id = r.id AND status='won'),0) * rules.xp_per_win +
      COALESCE((SELECT count(*) FROM referrals WHERE referrer_id = r.id),0) * rules.xp_per_referral
      INTO calc_xp;
    new_tier := CASE
      WHEN calc_xp >= 250000 THEN 'immortal'
      WHEN calc_xp >= 100000 THEN 'titan'
      WHEN calc_xp >= 50000  THEN 'mythic'
      WHEN calc_xp >= 25000  THEN 'legend'
      WHEN calc_xp >= 10000  THEN 'platinum'
      WHEN calc_xp >= 3000   THEN 'gold'
      WHEN calc_xp >= 500    THEN 'silver'
      ELSE 'bronze' END;
    IF r.xp <> calc_xp OR r.vip_tier <> new_tier THEN
      UPDATE profiles SET xp = calc_xp, vip_tier = new_tier WHERE id = r.id;
      fixed := fixed + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('checked', checked, 'fixed', fixed);
END $function$;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS hero_bg_url text,
  ADD COLUMN IF NOT EXISTS hero_bg_fit text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS hero_bg_position text NOT NULL DEFAULT 'center';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS special_id text;

CREATE OR REPLACE FUNCTION public.gen_special_id()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; candidate text; i int; exists_already boolean;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..7 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE special_id = candidate) INTO exists_already;
    IF NOT exists_already THEN RETURN candidate; END IF;
  END LOOP;
END; $$;

UPDATE public.profiles SET special_id = public.gen_special_id() WHERE special_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_special_id_key ON public.profiles (special_id);

CREATE OR REPLACE FUNCTION public.assign_special_id()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.special_id IS NULL THEN NEW.special_id := public.gen_special_id(); END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_assign_special_id ON public.profiles;
CREATE TRIGGER trg_assign_special_id BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.assign_special_id();

CREATE OR REPLACE FUNCTION public.resolve_special_id(_special_id text)
RETURNS TABLE (id uuid, full_name text, special_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.special_id FROM public.profiles p
  WHERE upper(p.special_id) = upper(trim(_special_id)) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.transfer_tokens(_recipient_special_id text, _amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sender uuid := auth.uid(); v_recipient uuid; v_recipient_name text;
  v_sender_balance bigint; v_new_sender bigint; v_new_recipient bigint;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  SELECT id, full_name INTO v_recipient, v_recipient_name
  FROM public.profiles WHERE upper(special_id) = upper(trim(_recipient_special_id)) LIMIT 1;
  IF v_recipient IS NULL THEN RAISE EXCEPTION 'No user found with that Special ID'; END IF;
  IF v_recipient = v_sender THEN RAISE EXCEPTION 'You cannot transfer tokens to yourself'; END IF;
  SELECT token_balance INTO v_sender_balance FROM public.profiles WHERE id = v_sender FOR UPDATE;
  IF v_sender_balance < _amount THEN RAISE EXCEPTION 'Insufficient token balance'; END IF;
  UPDATE public.profiles SET token_balance = token_balance - _amount WHERE id = v_sender RETURNING token_balance INTO v_new_sender;
  UPDATE public.profiles SET token_balance = token_balance + _amount WHERE id = v_recipient RETURNING token_balance INTO v_new_recipient;
  INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
  VALUES (v_sender, -_amount, v_new_sender, 'transfer_out', 'Transfer to ' || v_recipient_name);
  INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
  VALUES (v_recipient, _amount, v_new_recipient, 'transfer_in', 'Transfer received');
  RETURN jsonb_build_object('ok', true, 'recipient_name', v_recipient_name, 'new_balance', v_new_sender);
END; $$;

GRANT EXECUTE ON FUNCTION public.resolve_special_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_tokens(text, bigint) TO authenticated;

-- ============ LOTTERY ============
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS lottery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lottery_min_stake bigint NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS lottery_max_stake bigint NOT NULL DEFAULT 50000000,
  ADD COLUMN IF NOT EXISTS lottery_intro text;

CREATE TABLE IF NOT EXISTS public.lottery_draws (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT 'Lucky Numbers Draw',
  number_max integer NOT NULL DEFAULT 9,
  multiplier numeric NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'open',
  winning_number integer,
  draw_at timestamp with time zone,
  drawn_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lottery_draws TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lottery_draws TO authenticated;
GRANT ALL ON public.lottery_draws TO service_role;
ALTER TABLE public.lottery_draws ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view lottery draws" ON public.lottery_draws;
CREATE POLICY "Anyone can view lottery draws" ON public.lottery_draws FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage lottery draws" ON public.lottery_draws;
CREATE POLICY "Admins manage lottery draws" ON public.lottery_draws FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.lottery_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draw_id uuid NOT NULL REFERENCES public.lottery_draws(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number integer,
  numbers integer[],
  stake bigint NOT NULL,
  status text NOT NULL DEFAULT 'open',
  payout bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lottery_tickets TO authenticated;
GRANT ALL ON public.lottery_tickets TO service_role;
ALTER TABLE public.lottery_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own lottery tickets" ON public.lottery_tickets;
CREATE POLICY "Users view own lottery tickets" ON public.lottery_tickets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage lottery tickets" ON public.lottery_tickets;
CREATE POLICY "Admins manage lottery tickets" ON public.lottery_tickets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_lottery_tickets_draw ON public.lottery_tickets (draw_id);
CREATE INDEX IF NOT EXISTS idx_lottery_tickets_user ON public.lottery_tickets (user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_lottery_draws_updated_at ON public.lottery_draws;
CREATE TRIGGER update_lottery_draws_updated_at BEFORE UPDATE ON public.lottery_draws FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lottery_draws ADD COLUMN IF NOT EXISTS winning_numbers integer[];
ALTER TABLE public.lottery_draws ADD COLUMN IF NOT EXISTS win_count integer NOT NULL DEFAULT 10;

CREATE OR REPLACE FUNCTION public.place_lottery_ticket_multi(_draw_id uuid, _numbers integer[], _stake bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_user uuid := auth.uid(); v_draw public.lottery_draws%ROWTYPE;
  v_enabled boolean; v_min bigint; v_max bigint;
  v_balance bigint; v_new_balance bigint; v_house bigint;
  v_ticket_id uuid; v_n integer; v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT lottery_enabled, lottery_min_stake, lottery_max_stake INTO v_enabled, v_min, v_max FROM public.app_settings WHERE id = 1;
  IF NOT COALESCE(v_enabled, false) THEN RAISE EXCEPTION 'The lottery is currently closed'; END IF;
  SELECT * INTO v_draw FROM public.lottery_draws WHERE id = _draw_id;
  IF v_draw.id IS NULL THEN RAISE EXCEPTION 'Draw not found'; END IF;
  IF v_draw.status <> 'open' THEN RAISE EXCEPTION 'This draw is not accepting tickets'; END IF;
  SELECT array_agg(DISTINCT x) INTO _numbers FROM unnest(_numbers) x;
  v_count := COALESCE(array_length(_numbers, 1), 0);
  IF v_count < 1 OR v_count > 5 THEN RAISE EXCEPTION 'Pick between 1 and 5 numbers'; END IF;
  FOREACH v_n IN ARRAY _numbers LOOP
    IF v_n < 0 OR v_n > v_draw.number_max THEN RAISE EXCEPTION 'Numbers must be between 0 and %', v_draw.number_max; END IF;
  END LOOP;
  IF _stake < v_min THEN RAISE EXCEPTION 'Minimum stake is %', v_min; END IF;
  IF _stake > v_max THEN RAISE EXCEPTION 'Maximum stake is %', v_max; END IF;
  SELECT token_balance INTO v_balance FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_balance < _stake THEN RAISE EXCEPTION 'Insufficient token balance'; END IF;
  UPDATE public.profiles SET token_balance = token_balance - _stake WHERE id = v_user RETURNING token_balance INTO v_new_balance;
  INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
  VALUES (v_user, -_stake, v_new_balance, 'lottery_stake', 'Lottery ticket: ' || array_to_string(_numbers, ','));
  UPDATE public.house_wallet SET balance = balance + _stake, total_in = total_in + _stake, updated_at = now()
    WHERE id = 1 RETURNING balance INTO v_house;
  INSERT INTO public.house_transactions (kind, amount, balance_after, user_id, reason)
  VALUES ('lottery_stake', _stake, COALESCE(v_house, 0), v_user, 'Lottery ticket');
  INSERT INTO public.lottery_tickets (draw_id, user_id, number, numbers, stake)
  VALUES (_draw_id, v_user, _numbers[1], _numbers, _stake) RETURNING id INTO v_ticket_id;
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket_id, 'new_balance', v_new_balance);
END; $function$;
GRANT EXECUTE ON FUNCTION public.place_lottery_ticket_multi(uuid, integer[], bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.draw_lottery(_draw_id uuid, _winning_number integer DEFAULT NULL::integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_draw public.lottery_draws%ROWTYPE; v_winning integer[]; v_count integer;
  v_ticket record; v_picks integer[]; v_matches integer; v_npicks integer;
  v_payout bigint; v_new_balance bigint; v_house bigint;
  v_winners integer := 0; v_total_payout bigint := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO v_draw FROM public.lottery_draws WHERE id = _draw_id FOR UPDATE;
  IF v_draw.id IS NULL THEN RAISE EXCEPTION 'Draw not found'; END IF;
  IF v_draw.status = 'drawn' THEN RAISE EXCEPTION 'This draw is already settled'; END IF;
  v_count := LEAST(GREATEST(COALESCE(v_draw.win_count, 10), 1), v_draw.number_max + 1);
  SELECT array_agg(n) INTO v_winning FROM (SELECT n FROM generate_series(0, v_draw.number_max) n ORDER BY random() LIMIT v_count) s;
  FOR v_ticket IN SELECT * FROM public.lottery_tickets WHERE draw_id = _draw_id AND status = 'open' LOOP
    v_picks := COALESCE(v_ticket.numbers, ARRAY[v_ticket.number]);
    v_npicks := COALESCE(array_length(v_picks, 1), 0);
    SELECT count(*) INTO v_matches FROM unnest(v_picks) x WHERE x = ANY(v_winning);
    v_payout := 0;
    IF v_npicks > 0 AND v_matches = v_npicks THEN v_payout := (v_ticket.stake * 2)::bigint;
    ELSIF v_npicks = 5 AND v_matches = 2 THEN v_payout := v_ticket.stake;
    END IF;
    IF v_payout > 0 THEN
      UPDATE public.lottery_tickets SET status = 'won', payout = v_payout WHERE id = v_ticket.id;
      UPDATE public.profiles SET token_balance = token_balance + v_payout WHERE id = v_ticket.user_id RETURNING token_balance INTO v_new_balance;
      INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
      VALUES (v_ticket.user_id, v_payout, v_new_balance, 'lottery_win', 'Lottery win');
      UPDATE public.house_wallet SET balance = balance - v_payout, total_out = total_out + v_payout, updated_at = now() WHERE id = 1 RETURNING balance INTO v_house;
      INSERT INTO public.house_transactions (kind, amount, balance_after, user_id, reason)
      VALUES ('lottery_payout', -v_payout, COALESCE(v_house, 0), v_ticket.user_id, 'Lottery payout');
      v_winners := v_winners + 1;
      v_total_payout := v_total_payout + v_payout;
    ELSE
      UPDATE public.lottery_tickets SET status = 'lost' WHERE id = v_ticket.id;
    END IF;
  END LOOP;
  UPDATE public.lottery_draws SET status = 'drawn', winning_numbers = v_winning, winning_number = v_winning[1], drawn_at = now() WHERE id = _draw_id;
  RETURN jsonb_build_object('ok', true, 'winning_numbers', v_winning, 'winners', v_winners, 'total_payout', v_total_payout);
END; $function$;
GRANT EXECUTE ON FUNCTION public.draw_lottery(uuid, integer) TO authenticated;

-- ============ USER GIFTS + SPIN ============
CREATE TABLE IF NOT EXISTS public.user_gifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_user_gifts_user ON public.user_gifts(user_id, status);
GRANT SELECT, UPDATE ON public.user_gifts TO authenticated;
GRANT ALL ON public.user_gifts TO service_role;
ALTER TABLE public.user_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view their own gifts" ON public.user_gifts;
CREATE POLICY "Users view their own gifts" ON public.user_gifts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins view all gifts" ON public.user_gifts;
CREATE POLICY "Admins view all gifts" ON public.user_gifts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_send_gift(_user_id uuid, _amount bigint, _message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF _user_id IS NULL THEN
    INSERT INTO public.user_gifts (user_id, amount, message, created_by)
    SELECT id, _amount, _message, auth.uid() FROM public.profiles;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    INSERT INTO public.user_gifts (user_id, amount, message, created_by)
    VALUES (_user_id, _amount, _message, auth.uid());
    v_count := 1;
  END IF;
  RETURN jsonb_build_object('ok', true, 'sent', v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_gift(_gift_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_gift public.user_gifts%ROWTYPE; v_new bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_gift FROM public.user_gifts WHERE id = _gift_id FOR UPDATE;
  IF v_gift.id IS NULL THEN RAISE EXCEPTION 'Gift not found'; END IF;
  IF v_gift.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your gift'; END IF;
  IF v_gift.status <> 'pending' THEN RAISE EXCEPTION 'Gift already claimed'; END IF;
  UPDATE public.profiles SET token_balance = token_balance + v_gift.amount WHERE id = v_gift.user_id RETURNING token_balance INTO v_new;
  UPDATE public.user_gifts SET status = 'claimed', claimed_at = now() WHERE id = _gift_id;
  RETURN jsonb_build_object('ok', true, 'amount', v_gift.amount, 'balance', v_new);
END; $$;

CREATE OR REPLACE FUNCTION public.spin_wheel()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_enabled boolean; v_cooldown integer;
  v_min bigint; v_max bigint; v_last timestamptz; v_reward bigint; v_new bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT spin_enabled, COALESCE(spin_cooldown_hours,24), COALESCE(spin_min_reward,0), COALESCE(spin_max_reward,0)
  INTO v_enabled, v_cooldown, v_min, v_max FROM public.app_settings WHERE id = 1;
  IF NOT COALESCE(v_enabled, false) THEN RAISE EXCEPTION 'The lucky spin is currently disabled'; END IF;
  IF v_max <= 0 OR v_max < v_min THEN RAISE EXCEPTION 'Spin rewards are not configured'; END IF;
  SELECT max(created_at) INTO v_last FROM public.spins WHERE user_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - make_interval(hours => v_cooldown) THEN
    RAISE EXCEPTION 'You can spin again after the cooldown ends';
  END IF;
  v_reward := v_min + floor(random() * (v_max - v_min + 1))::bigint;
  UPDATE public.profiles SET token_balance = token_balance + v_reward WHERE id = v_uid RETURNING token_balance INTO v_new;
  INSERT INTO public.spins (user_id, amount) VALUES (v_uid, v_reward);
  RETURN jsonb_build_object('ok', true, 'reward', v_reward, 'balance', v_new, 'next_in_hours', v_cooldown);
END; $$;

-- ============ SURVEYS ============
CREATE TABLE IF NOT EXISTS public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_user_ids uuid[],
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.surveys TO authenticated;
GRANT ALL ON public.surveys TO service_role;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view targeted active surveys" ON public.surveys;
CREATE POLICY "view targeted active surveys" ON public.surveys FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR (is_active AND (target_user_ids IS NULL OR auth.uid() = ANY(target_user_ids))));
DROP POLICY IF EXISTS "admins manage surveys" ON public.surveys;
CREATE POLICY "admins manage surveys" ON public.surveys FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_responses TO authenticated;
GRANT ALL ON public.survey_responses TO service_role;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own survey responses" ON public.survey_responses;
CREATE POLICY "users manage own survey responses" ON public.survey_responses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admins view survey responses" ON public.survey_responses;
CREATE POLICY "admins view survey responses" ON public.survey_responses FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS update_surveys_updated_at ON public.surveys;
CREATE TRIGGER update_surveys_updated_at BEFORE UPDATE ON public.surveys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.submit_survey(_survey_id uuid, _answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.survey_responses(survey_id, user_id, answers, status)
  VALUES (_survey_id, uid, COALESCE(_answers, '{}'::jsonb), 'submitted')
  ON CONFLICT (survey_id, user_id) DO UPDATE SET answers = EXCLUDED.answers, status = 'submitted';
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.dismiss_survey(_survey_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.survey_responses(survey_id, user_id, answers, status)
  VALUES (_survey_id, uid, '{}'::jsonb, 'dismissed')
  ON CONFLICT (survey_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_survey(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.dismiss_survey(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_survey(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_survey(uuid) TO authenticated;

-- ============ TASKS extras ============
ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS target_progress numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS progress numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS reward_kind text NOT NULL DEFAULT 'tokens',
  ADD COLUMN IF NOT EXISTS period text;

CREATE OR REPLACE FUNCTION public.user_task_progress_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.target_progress > 0 AND NEW.progress >= NEW.target_progress THEN
    NEW.status := 'completed';
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_user_task_progress ON public.user_tasks;
CREATE TRIGGER trg_user_task_progress BEFORE INSERT OR UPDATE ON public.user_tasks FOR EACH ROW EXECUTE FUNCTION public.user_task_progress_check();

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS tasks_bg_url text,
  ADD COLUMN IF NOT EXISTS tasks_bg_fit text DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS tasks_bg_position text DEFAULT 'center';

-- ============ APP SETTINGS: new feature toggles ============
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ticker_enabled boolean DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ticker_text text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ticker_speed integer DEFAULT 30;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS shop_enabled boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS coinflip_enabled boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS coinflip_min bigint DEFAULT 100000;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS coinflip_max bigint DEFAULT 50000000;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS coinflip_payout numeric DEFAULT 1.95;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS wheel_enabled boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS wheel_min bigint DEFAULT 100000;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS wheel_max bigint DEFAULT 50000000;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS scratch_enabled boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS scratch_price bigint DEFAULT 500000;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS trivia_enabled boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS polls_enabled boolean DEFAULT true;

-- ============ UTILITY FEATURE TABLES ============
CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL, answer text NOT NULL, category text,
  sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faqs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "faqs public read active" ON public.faqs;
CREATE POLICY "faqs public read active" ON public.faqs FOR SELECT USING (is_active OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "faqs admin manage" ON public.faqs;
CREATE POLICY "faqs admin manage" ON public.faqs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general', message text NOT NULL,
  status text NOT NULL DEFAULT 'open', admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback own select" ON public.feedback;
CREATE POLICY "feedback own select" ON public.feedback FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "feedback own insert" ON public.feedback;
CREATE POLICY "feedback own insert" ON public.feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "feedback admin update" ON public.feedback;
CREATE POLICY "feedback admin update" ON public.feedback FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "feedback admin delete" ON public.feedback;
CREATE POLICY "feedback admin delete" ON public.feedback FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text, image_url text,
  cost bigint NOT NULL DEFAULT 0, stock integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_items TO authenticated;
GRANT ALL ON public.shop_items TO service_role;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop items public read" ON public.shop_items;
CREATE POLICY "shop items public read" ON public.shop_items FOR SELECT USING (is_active OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "shop items admin manage" ON public.shop_items;
CREATE POLICY "shop items admin manage" ON public.shop_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.shop_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  cost bigint NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_redemptions TO authenticated;
GRANT ALL ON public.shop_redemptions TO service_role;
ALTER TABLE public.shop_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop redemptions own select" ON public.shop_redemptions;
CREATE POLICY "shop redemptions own select" ON public.shop_redemptions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "shop redemptions admin update" ON public.shop_redemptions;
CREATE POLICY "shop redemptions admin update" ON public.shop_redemptions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.redeem_shop_item(_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_user uuid := auth.uid(); v_item public.shop_items%ROWTYPE;
  v_bal bigint; v_new bigint; v_rid uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = _item_id FOR UPDATE;
  IF v_item.id IS NULL OR NOT v_item.is_active THEN RAISE EXCEPTION 'Item unavailable'; END IF;
  IF v_item.stock IS NOT NULL AND v_item.stock <= 0 THEN RAISE EXCEPTION 'Out of stock'; END IF;
  SELECT token_balance INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_bal < v_item.cost THEN RAISE EXCEPTION 'Insufficient token balance'; END IF;
  UPDATE public.profiles SET token_balance = token_balance - v_item.cost WHERE id = v_user RETURNING token_balance INTO v_new;
  INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
  VALUES (v_user, -v_item.cost, v_new, 'shop_redeem', 'Reward shop: ' || v_item.name);
  IF v_item.stock IS NOT NULL THEN UPDATE public.shop_items SET stock = stock - 1 WHERE id = _item_id; END IF;
  INSERT INTO public.shop_redemptions (user_id, item_id, cost) VALUES (v_user, _item_id, v_item.cost) RETURNING id INTO v_rid;
  RETURN jsonb_build_object('ok', true, 'redemption_id', v_rid, 'balance', v_new);
END; $function$;
GRANT EXECUTE ON FUNCTION public.redeem_shop_item(uuid) TO authenticated;

-- ============ Fix stuck won bets (final commit) ============
CREATE OR REPLACE FUNCTION public.resettle_won_bets()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE b record; v_count integer := 0; new_house bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  FOR b IN
    SELECT bt.* FROM public.bets bt
    WHERE bt.status = 'lost'
      AND EXISTS (SELECT 1 FROM public.bet_selections s WHERE s.bet_id = bt.id)
      AND NOT EXISTS (SELECT 1 FROM public.bet_selections s WHERE s.bet_id = bt.id AND (s.result IS NULL OR s.result <> 'won'))
  LOOP
    UPDATE public.profiles SET token_balance = token_balance + b.potential_payout WHERE id = b.user_id;
    UPDATE public.house_wallet SET balance = balance - b.potential_payout, total_out = total_out + b.potential_payout, updated_at = now()
      WHERE id = 1 RETURNING balance INTO new_house;
    INSERT INTO public.house_transactions(kind, amount, balance_after, user_id, bet_id, reason)
      VALUES ('payout', -b.potential_payout, new_house, b.user_id, b.id, 'Corrected payout — all selections won for ' || b.tracking_id);
    UPDATE public.bets SET status = 'won', settled_at = COALESCE(settled_at, now()) WHERE id = b.id;
    INSERT INTO public.notifications(user_id, title, body, link)
      VALUES (b.user_id, 'Bet won! 🎉', 'Your ticket ' || b.tracking_id || ' was corrected to WON. +' || b.potential_payout || ' tokens credited.', '/ticket/' || b.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;
REVOKE ALL ON FUNCTION public.resettle_won_bets() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resettle_won_bets() TO authenticated;