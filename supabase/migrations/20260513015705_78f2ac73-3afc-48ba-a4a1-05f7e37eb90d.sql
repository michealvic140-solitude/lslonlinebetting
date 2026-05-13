-- =========== CHALLENGES ===========
CREATE TABLE IF NOT EXISTS public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily','weekly','login')),
  title text NOT NULL,
  description text,
  reward_tokens bigint NOT NULL DEFAULT 0,
  target_count integer NOT NULL DEFAULT 1,
  action_key text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenges read authed" ON public.challenges FOR SELECT TO authenticated USING (true);
CREATE POLICY "challenges admin write" ON public.challenges FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.user_challenge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  period_key text NOT NULL DEFAULT to_char(now(),'YYYY-MM-DD'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id, period_key)
);
ALTER TABLE public.user_challenge_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ucp own select" ON public.user_challenge_progress FOR SELECT TO authenticated USING (user_id=auth.uid() OR is_admin(auth.uid()));
CREATE POLICY "ucp own write" ON public.user_challenge_progress FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY "ucp own update" ON public.user_challenge_progress FOR UPDATE TO authenticated USING (user_id=auth.uid() OR is_admin(auth.uid()));
CREATE POLICY "ucp admin manage" ON public.user_challenge_progress FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_date date;

CREATE OR REPLACE FUNCTION public.claim_daily_login()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid uuid := auth.uid();
  p record;
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
  IF p.last_login_date = today - 1 THEN
    new_streak := p.streak_days + 1;
  ELSE
    new_streak := 1;
  END IF;
  multiplier := 1 + LEAST(new_streak, 30) * 0.1;
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
END $$;

CREATE OR REPLACE FUNCTION public.claim_challenge(_progress_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid uuid := auth.uid();
  ucp record;
  ch record;
  new_balance bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO ucp FROM user_challenge_progress WHERE id=_progress_id FOR UPDATE;
  IF ucp IS NULL OR ucp.user_id <> uid THEN RAISE EXCEPTION 'Not found'; END IF;
  IF ucp.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Already claimed'; END IF;
  IF ucp.completed_at IS NULL THEN RAISE EXCEPTION 'Not completed yet'; END IF;
  SELECT * INTO ch FROM challenges WHERE id=ucp.challenge_id;
  UPDATE user_challenge_progress SET claimed_at=now() WHERE id=_progress_id;
  UPDATE profiles SET token_balance = token_balance + ch.reward_tokens WHERE id=uid RETURNING token_balance INTO new_balance;
  INSERT INTO token_transactions(user_id, amount, balance_after, kind, description)
    VALUES (uid, ch.reward_tokens, new_balance, 'challenge', 'Challenge: '||ch.title);
  INSERT INTO notifications(user_id, title, body) VALUES (uid, 'Challenge complete!', '+'||ch.reward_tokens||' tokens · '||ch.title);
  RETURN jsonb_build_object('reward', ch.reward_tokens, 'balance', new_balance);
END $$;

-- =========== SEASONS ===========
CREATE TABLE IF NOT EXISTS public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  banner_url text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  reward_structure jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasons read" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "seasons admin write" ON public.seasons FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.season_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  correct_scores integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);
ALTER TABLE public.season_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp read" ON public.season_points FOR SELECT USING (true);
CREATE POLICY "sp admin write" ON public.season_points FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- =========== HOT BETS VIEW ===========
DROP VIEW IF EXISTS public.hot_bets_v1;
CREATE VIEW public.hot_bets_v1
WITH (security_invoker=on) AS
SELECT
  bs.match_id,
  m.name AS match_name,
  mk.name AS market_name,
  bs.selection_label,
  AVG(bs.locked_odds)::numeric(10,2) AS avg_odds,
  COUNT(DISTINCT b.user_id) AS users_count,
  COUNT(*) AS bets_count,
  SUM(b.stake)::bigint AS total_stake,
  MAX(b.created_at) AS last_bet_at
FROM bet_selections bs
JOIN bets b ON b.id = bs.bet_id
JOIN markets mk ON mk.id = bs.market_id
LEFT JOIN matches m ON m.id = bs.match_id
WHERE b.created_at > now() - interval '7 days'
  AND b.status IN ('open','won','lost')
GROUP BY bs.match_id, m.name, mk.name, bs.selection_label
HAVING COUNT(*) >= 1;

GRANT SELECT ON public.hot_bets_v1 TO authenticated, anon;