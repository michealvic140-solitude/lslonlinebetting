
-- ============ WATCHLIST ============
CREATE TABLE IF NOT EXISTS public.watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('match','team','player')),
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON public.watchlist(user_id);
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist own select" ON public.watchlist FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "watchlist own insert" ON public.watchlist FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "watchlist own delete" ON public.watchlist FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ PROFILE CUSTOMIZATION ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS xp bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_tier text NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS gang_emblem_url text,
  ADD COLUMN IF NOT EXISTS emblem_status text,
  ADD COLUMN IF NOT EXISTS chat_color text,
  ADD COLUMN IF NOT EXISTS profile_banner_url text,
  ADD COLUMN IF NOT EXISTS profile_title text,
  ADD COLUMN IF NOT EXISTS showcase_achievement_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Backfill referral codes for existing profiles
UPDATE public.profiles SET referral_code = 'LSL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)) WHERE referral_code IS NULL;

CREATE OR REPLACE FUNCTION public.gen_referral_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'LSL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gen_referral_code ON public.profiles;
CREATE TRIGGER trg_gen_referral_code BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.gen_referral_code();

-- ============ REFERRALS ============
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL UNIQUE,
  referrer_bonus bigint NOT NULL DEFAULT 0,
  referee_bonus bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals own select" ON public.referrals FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR referee_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "referrals admin manage" ON public.referrals FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ NOTIFICATION PREFERENCES ============
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id uuid PRIMARY KEY,
  push_enabled boolean NOT NULL DEFAULT true,
  match_starting boolean NOT NULL DEFAULT true,
  bet_results boolean NOT NULL DEFAULT true,
  rewards boolean NOT NULL DEFAULT true,
  daily_streak boolean NOT NULL DEFAULT true,
  referrals boolean NOT NULL DEFAULT true,
  vip_tier_up boolean NOT NULL DEFAULT true,
  withdrawals boolean NOT NULL DEFAULT true,
  promotions boolean NOT NULL DEFAULT true,
  chat_mentions boolean NOT NULL DEFAULT true,
  ticket_replies boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "np own all" ON public.notification_prefs FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============ PUSH SUBSCRIPTIONS ============
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push own all" ON public.push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============ USER SESSIONS (live activity) ============
CREATE TABLE IF NOT EXISTS public.user_sessions (
  user_id uuid PRIMARY KEY,
  last_seen timestamptz NOT NULL DEFAULT now(),
  route text,
  user_agent text
);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "us own upsert" ON public.user_sessions FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============ BROADCASTS ============
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  link text,
  segment text NOT NULL DEFAULT 'all',
  sent_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcasts admin all" ON public.broadcasts FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "broadcasts read authed" ON public.broadcasts FOR SELECT TO authenticated USING (true);

-- ============ GANG EMBLEMS ============
CREATE TABLE IF NOT EXISTS public.gang_emblems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  image_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emblem_user ON public.gang_emblems(user_id);
ALTER TABLE public.gang_emblems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emblems own select" ON public.gang_emblems FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "emblems own insert" ON public.gang_emblems FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "emblems admin update" ON public.gang_emblems FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "emblems admin delete" ON public.gang_emblems FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ============ FRIENDS (follow edges) ============
CREATE TABLE IF NOT EXISTS public.friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  followee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS idx_friends_follower ON public.friends(follower_id);
CREATE INDEX IF NOT EXISTS idx_friends_followee ON public.friends(followee_id);
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friends read authed" ON public.friends FOR SELECT TO authenticated USING (true);
CREATE POLICY "friends own insert" ON public.friends FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "friends own delete" ON public.friends FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- ============ SPINS / GIFTS ============
CREATE TABLE IF NOT EXISTS public.spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spins own select" ON public.spins FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "spins own insert" ON public.spins FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  amount bigint NOT NULL,
  fee bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gifts read participants" ON public.gifts FOR SELECT TO authenticated USING (sender_id = auth.uid() OR recipient_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "gifts own insert" ON public.gifts FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

-- ============ APP SETTINGS COLUMNS ============
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS vapid_public_key text,
  ADD COLUMN IF NOT EXISTS vapid_subject text,
  ADD COLUMN IF NOT EXISTS push_endpoint_url text,
  ADD COLUMN IF NOT EXISTS daily_login_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_login_base_reward bigint NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS daily_login_bonus_per_day numeric NOT NULL DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS daily_login_max_streak integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS xp_per_bet integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS xp_per_win integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS xp_per_login integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS xp_per_referral integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS referral_bonus_referrer bigint NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS referral_bonus_referee bigint NOT NULL DEFAULT 250000,
  ADD COLUMN IF NOT EXISTS vip_token_multipliers jsonb NOT NULL DEFAULT '{"bronze":1,"silver":1.05,"gold":1.10,"platinum":1.25,"legend":1.50}'::jsonb,
  ADD COLUMN IF NOT EXISTS challenge_reward_multiplier numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS spin_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spin_min_reward bigint NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS spin_max_reward bigint NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS spin_cooldown_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS gift_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_daily_limit integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS gift_min_amount bigint NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS gift_max_per_tx bigint NOT NULL DEFAULT 5000000,
  ADD COLUMN IF NOT EXISTS gift_fee_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS friends_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_ai_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS exposure_warn_pct integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS house_low_balance bigint NOT NULL DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS min_selections_per_ticket integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_selections_per_ticket integer NOT NULL DEFAULT 20;

-- ============ RPCs ============

CREATE OR REPLACE FUNCTION public.apply_referral_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); ref record; me record; bonus_referrer bigint; bonus_referee bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO me FROM profiles WHERE id = uid FOR UPDATE;
  IF me.referred_by IS NOT NULL THEN RAISE EXCEPTION 'You have already used a referral code'; END IF;
  SELECT * INTO ref FROM profiles WHERE referral_code = upper(_code) AND id <> uid;
  IF ref IS NULL THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
  SELECT referral_bonus_referrer, referral_bonus_referee INTO bonus_referrer, bonus_referee FROM app_settings WHERE id = 1;
  INSERT INTO referrals(referrer_id, referee_id, referrer_bonus, referee_bonus) VALUES (ref.id, uid, bonus_referrer, bonus_referee);
  UPDATE profiles SET referred_by = ref.id, token_balance = token_balance + bonus_referee WHERE id = uid;
  UPDATE profiles SET token_balance = token_balance + bonus_referrer WHERE id = ref.id;
  INSERT INTO notifications(user_id, title, body) VALUES (ref.id, 'New referral!', '+' || bonus_referrer || ' tokens credited.');
  INSERT INTO notifications(user_id, title, body) VALUES (uid, 'Referral applied', '+' || bonus_referee || ' tokens credited.');
  RETURN jsonb_build_object('referee_bonus', bonus_referee, 'referrer_bonus', bonus_referrer);
END $$;

CREATE OR REPLACE FUNCTION public.verify_xp_consistency(_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    new_tier := CASE WHEN calc_xp >= 25000 THEN 'legend' WHEN calc_xp >= 10000 THEN 'platinum' WHEN calc_xp >= 3000 THEN 'gold' WHEN calc_xp >= 500 THEN 'silver' ELSE 'bronze' END;
    IF r.xp <> calc_xp OR r.vip_tier <> new_tier THEN
      UPDATE profiles SET xp = calc_xp, vip_tier = new_tier WHERE id = r.id;
      fixed := fixed + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('checked', checked, 'fixed', fixed);
END $$;

CREATE OR REPLACE FUNCTION public.admin_risk_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hw record; exposure bigint; open_bets int; pending_wd int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT balance, payouts_paused INTO hw FROM house_wallet WHERE id = 1;
  SELECT COALESCE(SUM(potential_payout - stake),0), COUNT(*) INTO exposure, open_bets FROM bets WHERE status='open';
  SELECT COUNT(*) INTO pending_wd FROM withdrawal_requests WHERE status='pending';
  RETURN jsonb_build_object('house_balance', hw.balance, 'payouts_paused', hw.payouts_paused, 'total_exposure', exposure, 'open_bets', open_bets, 'pending_withdrawals', pending_wd);
END $$;

CREATE OR REPLACE FUNCTION public.admin_exposure_per_match()
RETURNS TABLE (match_id uuid, match_name text, bet_count int, exposure bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN QUERY
  SELECT m.id, m.name, COUNT(DISTINCT b.id)::int, COALESCE(SUM(b.potential_payout - b.stake),0)::bigint
  FROM matches m
  JOIN bet_selections bs ON bs.match_id = m.id
  JOIN bets b ON b.id = bs.bet_id
  WHERE b.status='open'
  GROUP BY m.id, m.name
  ORDER BY 4 DESC
  LIMIT 30;
END $$;

CREATE OR REPLACE FUNCTION public.admin_pnl_summary(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - (_days || ' days')::interval; stakes_in bigint; payouts_out bigint; bets_count int; wins_count int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT COALESCE(SUM(stake),0), COUNT(*) INTO stakes_in, bets_count FROM bets WHERE created_at >= since;
  SELECT COALESCE(SUM(potential_payout),0), COUNT(*) INTO payouts_out, wins_count FROM bets WHERE status='won' AND created_at >= since;
  RETURN jsonb_build_object('stakes_in', stakes_in, 'payouts_out', payouts_out, 'net', stakes_in - payouts_out, 'bets', bets_count, 'wins', wins_count);
END $$;

CREATE OR REPLACE FUNCTION public.admin_broadcast(_title text, _body text, _link text, _segment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sent int := 0; r record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  FOR r IN SELECT p.id FROM profiles p
    WHERE CASE
      WHEN _segment = 'vip' THEN p.vip_tier IN ('gold','platinum','legend')
      WHEN _segment = 'admins' THEN EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
      ELSE true
    END
  LOOP
    INSERT INTO notifications(user_id, title, body, link) VALUES (r.id, _title, NULLIF(_body,''), NULLIF(_link,''));
    sent := sent + 1;
  END LOOP;
  INSERT INTO broadcasts(title, body, link, segment, sent_count, created_by) VALUES (_title, _body, _link, _segment, sent, auth.uid());
  RETURN jsonb_build_object('sent', sent);
END $$;
