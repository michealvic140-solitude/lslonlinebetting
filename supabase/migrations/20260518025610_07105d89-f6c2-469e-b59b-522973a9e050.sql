
-- 1. Spotlights table
CREATE TABLE IF NOT EXISTS public.spotlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  headline text NOT NULL,
  message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.spotlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spotlights public read" ON public.spotlights;
CREATE POLICY "spotlights public read" ON public.spotlights FOR SELECT USING (true);

DROP POLICY IF EXISTS "spotlights mod write" ON public.spotlights;
CREATE POLICY "spotlights mod write" ON public.spotlights FOR ALL TO authenticated
  USING (public.is_mod_or_admin(auth.uid()))
  WITH CHECK (public.is_mod_or_admin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.spotlights;

-- 2. Unique constraint for season_points upserts
CREATE UNIQUE INDEX IF NOT EXISTS season_points_user_season_unique
  ON public.season_points(season_id, user_id);

-- 3. VIP tier recalc helper (emits notification on tier-up)
CREATE OR REPLACE FUNCTION public.recalc_vip_tier(_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur_xp bigint; new_tier text; old_tier text;
  tier_rank int; old_rank int;
BEGIN
  SELECT xp, vip_tier INTO cur_xp, old_tier FROM public.profiles WHERE id = _user_id;
  IF cur_xp IS NULL THEN RETURN NULL; END IF;
  new_tier := CASE
    WHEN cur_xp >= 25000 THEN 'legend'
    WHEN cur_xp >= 10000 THEN 'platinum'
    WHEN cur_xp >= 3000  THEN 'gold'
    WHEN cur_xp >= 500   THEN 'silver'
    ELSE 'bronze'
  END;
  IF new_tier <> COALESCE(old_tier,'bronze') THEN
    UPDATE public.profiles SET vip_tier = new_tier WHERE id = _user_id;
    tier_rank := CASE new_tier WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'platinum' THEN 4 ELSE 5 END;
    old_rank  := CASE COALESCE(old_tier,'bronze') WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'platinum' THEN 4 ELSE 5 END;
    IF tier_rank > old_rank THEN
      INSERT INTO public.notifications(user_id, title, body, link)
        VALUES (_user_id, '🎉 VIP Tier Up!', 'You have reached ' || upper(new_tier) || ' tier.', '/dashboard');
    END IF;
  END IF;
  RETURN new_tier;
END $$;

-- 4. XP on bet INSERT
CREATE OR REPLACE FUNCTION public.xp_on_bet_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE xp_amt int;
BEGIN
  SELECT xp_per_bet INTO xp_amt FROM public.app_settings WHERE id = 1;
  UPDATE public.profiles SET xp = xp + COALESCE(xp_amt, 10) WHERE id = NEW.user_id;
  PERFORM public.recalc_vip_tier(NEW.user_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS xp_bet_insert ON public.bets;
CREATE TRIGGER xp_bet_insert AFTER INSERT ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_bet_insert();

-- 5. XP + season points on bet WIN
CREATE OR REPLACE FUNCTION public.xp_on_bet_win()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE xp_amt int; active_season uuid;
BEGIN
  IF NEW.status = 'won' AND OLD.status IS DISTINCT FROM 'won' THEN
    SELECT xp_per_win INTO xp_amt FROM public.app_settings WHERE id = 1;
    UPDATE public.profiles SET xp = xp + COALESCE(xp_amt, 25) WHERE id = NEW.user_id;
    PERFORM public.recalc_vip_tier(NEW.user_id);

    SELECT id INTO active_season FROM public.seasons
      WHERE is_active = true AND now() BETWEEN starts_at AND ends_at
      ORDER BY starts_at DESC LIMIT 1;
    IF active_season IS NOT NULL THEN
      INSERT INTO public.season_points(season_id, user_id, points, wins)
        VALUES (active_season, NEW.user_id, 10, 1)
        ON CONFLICT (season_id, user_id) DO UPDATE
          SET points = public.season_points.points + 10,
              wins   = public.season_points.wins + 1,
              updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS xp_bet_win ON public.bets;
CREATE TRIGGER xp_bet_win AFTER UPDATE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_bet_win();

-- 6. XP on referral
CREATE OR REPLACE FUNCTION public.xp_on_referral()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE xp_amt int;
BEGIN
  SELECT xp_per_referral INTO xp_amt FROM public.app_settings WHERE id = 1;
  UPDATE public.profiles SET xp = xp + COALESCE(xp_amt, 100) WHERE id = NEW.referrer_id;
  PERFORM public.recalc_vip_tier(NEW.referrer_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS xp_referral_insert ON public.referrals;
CREATE TRIGGER xp_referral_insert AFTER INSERT ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.xp_on_referral();

-- 7. Patch claim_daily_login to also award XP and recalc tier
CREATE OR REPLACE FUNCTION public.claim_daily_login()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  p record;
  cfg record;
  base_reward bigint;
  bonus_per_day numeric;
  max_streak int;
  multiplier numeric := 1;
  total bigint;
  today date := (now() at time zone 'utc')::date;
  new_streak int;
  new_balance bigint;
  xp_amt int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT daily_login_enabled, daily_login_base_reward, daily_login_bonus_per_day, daily_login_max_streak, xp_per_login
    INTO cfg FROM app_settings WHERE id = 1;

  IF NOT COALESCE(cfg.daily_login_enabled, true) THEN
    RAISE EXCEPTION 'Daily login rewards are currently paused';
  END IF;

  base_reward   := COALESCE(cfg.daily_login_base_reward, 100000);
  bonus_per_day := COALESCE(cfg.daily_login_bonus_per_day, 0.1);
  max_streak    := COALESCE(cfg.daily_login_max_streak, 30);
  xp_amt        := COALESCE(cfg.xp_per_login, 5);

  SELECT * INTO p FROM profiles WHERE id = uid FOR UPDATE;
  IF p.last_login_date = today THEN
    RETURN jsonb_build_object('already_claimed', true, 'streak', p.streak_days);
  END IF;
  IF p.last_login_date = today - 1 THEN
    new_streak := p.streak_days + 1;
  ELSE
    new_streak := 1;
  END IF;
  multiplier := 1 + LEAST(new_streak, max_streak) * bonus_per_day;
  total := (base_reward * multiplier)::bigint;
  UPDATE profiles SET
    streak_days = new_streak,
    longest_streak = GREATEST(longest_streak, new_streak),
    last_login_date = today,
    token_balance = token_balance + total,
    xp = xp + xp_amt
    WHERE id = uid RETURNING token_balance INTO new_balance;
  PERFORM public.recalc_vip_tier(uid);
  INSERT INTO token_transactions(user_id, amount, balance_after, kind, description)
    VALUES (uid, total, new_balance, 'daily_login', 'Daily login streak day ' || new_streak);
  INSERT INTO notifications(user_id, title, body)
    VALUES (uid, '🔥 Day ' || new_streak || ' streak!', '+' || total || ' tokens credited.');
  RETURN jsonb_build_object('reward', total, 'streak', new_streak, 'balance', new_balance);
END $function$;

-- 8. Spotlight → auto-post chat message + notify highlighted user
CREATE OR REPLACE FUNCTION public.spotlight_post_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE name_txt text;
BEGIN
  SELECT COALESCE(NULLIF(ingame_name,''), NULLIF(full_name,''), 'Player')
    INTO name_txt FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.chat_messages(user_id, room, content)
    VALUES (
      COALESCE(NEW.created_by, NEW.user_id),
      'general',
      '🌟 SPOTLIGHT — ' || name_txt || ': ' || NEW.headline ||
        CASE WHEN NEW.message IS NOT NULL AND length(trim(NEW.message)) > 0 THEN E'\n' || NEW.message ELSE '' END
    );
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (NEW.user_id, '🌟 You are in the spotlight!', NEW.headline, '/');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS spotlight_chat ON public.spotlights;
CREATE TRIGGER spotlight_chat AFTER INSERT ON public.spotlights
  FOR EACH ROW EXECUTE FUNCTION public.spotlight_post_chat();
