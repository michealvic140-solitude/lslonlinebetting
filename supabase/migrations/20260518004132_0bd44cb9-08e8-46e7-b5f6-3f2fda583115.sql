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
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT daily_login_enabled, daily_login_base_reward, daily_login_bonus_per_day, daily_login_max_streak
    INTO cfg FROM app_settings WHERE id = 1;

  IF NOT COALESCE(cfg.daily_login_enabled, true) THEN
    RAISE EXCEPTION 'Daily login rewards are currently paused';
  END IF;

  base_reward   := COALESCE(cfg.daily_login_base_reward, 100000);
  bonus_per_day := COALESCE(cfg.daily_login_bonus_per_day, 0.1);
  max_streak    := COALESCE(cfg.daily_login_max_streak, 30);

  SELECT * INTO p FROM profiles WHERE id=uid FOR UPDATE;
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
    token_balance = token_balance + total
    WHERE id=uid RETURNING token_balance INTO new_balance;
  INSERT INTO token_transactions(user_id, amount, balance_after, kind, description)
    VALUES (uid, total, new_balance, 'daily_login', 'Daily login streak day '||new_streak);
  INSERT INTO notifications(user_id, title, body)
    VALUES (uid, '🔥 Day '||new_streak||' streak!', '+'||total||' tokens credited.');
  RETURN jsonb_build_object('reward', total, 'streak', new_streak, 'balance', new_balance);
END $function$;