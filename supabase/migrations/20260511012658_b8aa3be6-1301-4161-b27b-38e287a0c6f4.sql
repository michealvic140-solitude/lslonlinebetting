
-- Secure redemption RPC
CREATE OR REPLACE FUNCTION public.redeem_promo_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p record;
  user_uses int;
  new_balance bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO p FROM public.promo_codes WHERE code = upper(_code) FOR UPDATE;
  IF p IS NULL THEN RAISE EXCEPTION 'Invalid code'; END IF;
  IF NOT p.is_active THEN RAISE EXCEPTION 'Code is inactive'; END IF;
  IF p.expires_at IS NOT NULL AND p.expires_at < now() THEN RAISE EXCEPTION 'Code has expired'; END IF;
  IF p.target_user_ids IS NOT NULL AND array_length(p.target_user_ids, 1) > 0 AND NOT (uid = ANY(p.target_user_ids)) THEN
    RAISE EXCEPTION 'This code is not available for your account';
  END IF;
  IF p.max_uses IS NOT NULL AND p.used_count >= p.max_uses THEN
    RAISE EXCEPTION 'This code has reached its maximum redemptions';
  END IF;

  SELECT count(*) INTO user_uses FROM public.promo_redemptions WHERE promo_id = p.id AND user_id = uid;
  IF user_uses >= COALESCE(p.usage_limit, 1) THEN
    RAISE EXCEPTION 'You have already used this code the maximum number of times';
  END IF;

  INSERT INTO public.promo_redemptions(promo_id, user_id, amount) VALUES (p.id, uid, p.amount);
  UPDATE public.promo_codes SET used_count = used_count + 1 WHERE id = p.id;
  UPDATE public.profiles SET token_balance = token_balance + p.amount WHERE id = uid
    RETURNING token_balance INTO new_balance;

  INSERT INTO public.token_transactions(user_id, amount, balance_after, kind, description, metadata)
    VALUES (uid, p.amount, new_balance, 'promo', 'Promo code: ' || p.code, jsonb_build_object('promo_id', p.id, 'code', p.code));

  INSERT INTO public.notifications(user_id, title, body)
    VALUES (uid, 'Promo redeemed', '+' || p.amount || ' tokens from code ' || p.code);

  RETURN jsonb_build_object('amount', p.amount, 'balance', new_balance, 'code', p.code);
END $$;

GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text) TO authenticated;

-- Admin view of promo usage (with user info)
CREATE OR REPLACE VIEW public.promo_code_usage_v2
WITH (security_invoker = true) AS
SELECT
  r.id           AS redemption_id,
  r.promo_id,
  pc.code,
  pc.amount      AS code_amount,
  r.user_id,
  pr.full_name,
  pr.ingame_name,
  pr.gang_name,
  pr.email,
  r.amount       AS redeemed_amount,
  r.created_at   AS redeemed_at
FROM public.promo_redemptions r
JOIN public.promo_codes pc ON pc.id = r.promo_id
LEFT JOIN public.profiles pr ON pr.id = r.user_id;

GRANT SELECT ON public.promo_code_usage_v2 TO authenticated;
