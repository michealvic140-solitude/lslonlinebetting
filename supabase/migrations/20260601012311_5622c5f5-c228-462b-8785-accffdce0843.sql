-- Referral redemptions, leaderboard admin RPCs, and stuck-voucher repair

-- 1) Extend user_sessions with richer activity tracking
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS session_start timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS signed_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS os text;

-- 2) Referral redemptions table (one per user)
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  referrer_id uuid NOT NULL,
  code text NOT NULL,
  referee_bonus bigint NOT NULL DEFAULT 0,
  referrer_bonus bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.referral_redemptions TO authenticated;
GRANT ALL ON public.referral_redemptions TO service_role;

ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own referral redemption read" ON public.referral_redemptions;
CREATE POLICY "own referral redemption read"
  ON public.referral_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = referrer_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "referral redemption admin" ON public.referral_redemptions;
CREATE POLICY "referral redemption admin"
  ON public.referral_redemptions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referrer
  ON public.referral_redemptions(referrer_id);

-- 3) redeem_referral_code RPC
CREATE OR REPLACE FUNCTION public.redeem_referral_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  ref_profile public.profiles%ROWTYPE;
  cfg record;
  normalized text := upper(trim(_code));
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauth'); END IF;
  IF normalized = '' OR normalized IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referral_redemptions WHERE user_id = uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_redeemed');
  END IF;

  SELECT * INTO ref_profile FROM public.profiles
   WHERE upper(referral_code) = normalized LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'code_not_found'); END IF;
  IF ref_profile.id = uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  SELECT COALESCE(referral_bonus_referee, 0) AS referee_bonus,
         COALESCE(referral_bonus_referrer, 0) AS referrer_bonus
    INTO cfg FROM public.app_settings WHERE id = 1;

  INSERT INTO public.referral_redemptions (user_id, referrer_id, code, referee_bonus, referrer_bonus)
    VALUES (uid, ref_profile.id, normalized, cfg.referee_bonus, cfg.referrer_bonus);

  INSERT INTO public.referrals (referrer_id, referee_id, referrer_bonus, referee_bonus)
    VALUES (ref_profile.id, uid, cfg.referrer_bonus, cfg.referee_bonus);

  UPDATE public.profiles SET token_balance = token_balance + cfg.referee_bonus,
                              referred_by = ref_profile.id WHERE id = uid;
  UPDATE public.profiles SET token_balance = token_balance + cfg.referrer_bonus WHERE id = ref_profile.id;

  IF cfg.referee_bonus > 0 THEN
    INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
      SELECT uid, cfg.referee_bonus, token_balance, 'referral_redeem', 'Redeemed referral ' || normalized
        FROM public.profiles WHERE id = uid;
  END IF;
  IF cfg.referrer_bonus > 0 THEN
    INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
      SELECT ref_profile.id, cfg.referrer_bonus, token_balance, 'referral_bonus', 'Referral bonus from ' || uid::text
        FROM public.profiles WHERE id = ref_profile.id;
    INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (ref_profile.id, 'Referral bonus', cfg.referrer_bonus || ' tokens credited for a referred sign-up.', '/dashboard');
  END IF;

  RETURN jsonb_build_object('ok', true, 'referee_bonus', cfg.referee_bonus, 'referrer_bonus', cfg.referrer_bonus);
END $$;

-- 4) Extend handle_new_user to auto-apply referral code from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  meta_code text;
  ref_id uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, discord_username, discord_full_name, ingame_name, country, server, gang_name, gang_type, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'discord_username',
    NEW.raw_user_meta_data->>'discord_full_name',
    NEW.raw_user_meta_data->>'ingame_name',
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'server','LOMITA AFR'),
    NEW.raw_user_meta_data->>'gang_name',
    NULLIF(NEW.raw_user_meta_data->>'gang_type','')::public.gang_type,
    'LSL-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6))
  );

  IF NEW.email = 'lomitashootersleague@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;

  meta_code := COALESCE(NEW.raw_user_meta_data->>'referral_code', NEW.raw_user_meta_data->>'referred_by');
  IF meta_code IS NOT NULL AND length(trim(meta_code)) > 0 THEN
    SELECT id INTO ref_id FROM public.profiles
      WHERE upper(referral_code) = upper(trim(meta_code)) AND id <> NEW.id LIMIT 1;
    IF ref_id IS NOT NULL THEN
      UPDATE public.profiles SET referred_by = ref_id WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- 5) Leaderboard admin RPCs
CREATE OR REPLACE FUNCTION public.admin_clear_leaderboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RETURN jsonb_build_object('ok', false); END IF;
  TRUNCATE TABLE public.season_points;
  DELETE FROM public.leaderboard_overrides;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_leaderboard_override(
  _id uuid, _kind text, _name text, _top_player text,
  _wins integer, _losses integer, _draws integer, _played integer,
  _points bigint, _manual_rank integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RETURN jsonb_build_object('ok', false); END IF;
  IF _id IS NULL THEN
    INSERT INTO public.leaderboard_overrides
      (kind, name, top_player, wins, losses, draws, played, points, manual_rank)
      VALUES (_kind, _name, _top_player, _wins, _losses, _draws, _played, _points, _manual_rank)
      RETURNING id INTO new_id;
  ELSE
    UPDATE public.leaderboard_overrides SET
      kind = _kind, name = _name, top_player = _top_player,
      wins = _wins, losses = _losses, draws = _draws, played = _played,
      points = _points, manual_rank = _manual_rank
      WHERE id = _id RETURNING id INTO new_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_leaderboard_override(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RETURN jsonb_build_object('ok', false); END IF;
  DELETE FROM public.leaderboard_overrides WHERE id = _id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6) Repair stuck open vouchers whose matches have already ended
CREATE OR REPLACE FUNCTION public.fix_pending_virtual_bets()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bet record;
  total_sel int;
  ended_sel int;
  lost_sel int;
  won_sel int;
  fixed int := 0;
BEGIN
  FOR bet IN
    SELECT DISTINCT b.* FROM public.bets b
    JOIN public.bet_selections bs ON bs.bet_id = b.id
    WHERE b.status = 'open'
  LOOP
    UPDATE public.bet_selections bs
      SET result = CASE WHEN o.is_winner IS TRUE THEN 'won' ELSE 'lost' END
      FROM public.odds o, public.matches m
      WHERE bs.bet_id = bet.id
        AND bs.odd_id = o.id
        AND bs.match_id = m.id
        AND m.status = 'ended'
        AND bs.result IS NULL;

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE m.status = 'ended'),
           COUNT(*) FILTER (WHERE bs.result = 'lost'),
           COUNT(*) FILTER (WHERE bs.result = 'won')
      INTO total_sel, ended_sel, lost_sel, won_sel
      FROM public.bet_selections bs JOIN public.matches m ON m.id = bs.match_id
     WHERE bs.bet_id = bet.id;

    IF lost_sel > 0 THEN
      UPDATE public.bets SET status='lost', settled_at = COALESCE(settled_at, now()) WHERE id = bet.id;
      fixed := fixed + 1;
    ELSIF ended_sel = total_sel AND total_sel > 0 AND won_sel = total_sel THEN
      UPDATE public.bets SET status='won', settled_at = COALESCE(settled_at, now()) WHERE id = bet.id;
      fixed := fixed + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'fixed', fixed);
END $$;

SELECT public.fix_pending_virtual_bets();