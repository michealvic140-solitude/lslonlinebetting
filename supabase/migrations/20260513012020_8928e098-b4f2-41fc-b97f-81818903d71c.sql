
DROP VIEW IF EXISTS public.promo_code_usage_v2 CASCADE;
DROP VIEW IF EXISTS public.promo_code_usage_log CASCADE;

CREATE VIEW public.promo_code_usage_v2
WITH (security_invoker = on)
AS
SELECT
  r.id         AS redemption_id,
  r.promo_id   AS promo_id,
  pc.code      AS code,
  pc.amount    AS code_amount,
  r.amount     AS redeemed_amount,
  r.created_at AS redeemed_at,
  r.user_id    AS user_id,
  p.full_name  AS full_name,
  p.email      AS email,
  p.ingame_name AS ingame_name,
  p.gang_name  AS gang_name
FROM public.promo_redemptions r
JOIN public.promo_codes pc ON pc.id = r.promo_id
LEFT JOIN public.profiles p ON p.id = r.user_id;

CREATE VIEW public.promo_code_usage_log
WITH (security_invoker = on)
AS
SELECT
  pc.id              AS promo_id,
  pc.code            AS code,
  pc.amount          AS amount,
  pc.created_by      AS created_by,
  pc.expires_at      AS expires_at,
  pc.created_at      AS generated_at,
  creator.full_name  AS generated_by_name,
  creator.email      AS generated_by_email,
  pc.is_active       AS is_active,
  pc.max_uses        AS max_uses,
  pc.target_user_ids AS target_user_ids,
  pc.usage_limit     AS usage_limit,
  pc.used_count      AS used_count,
  r.id               AS redemption_id,
  r.created_at       AS used_at,
  r.user_id          AS used_by,
  used.full_name     AS used_by_name,
  used.email         AS used_by_email,
  used.gang_name     AS used_by_gang_name
FROM public.promo_codes pc
LEFT JOIN public.promo_redemptions r ON r.promo_id = pc.id
LEFT JOIN public.profiles creator ON creator.id = pc.created_by
LEFT JOIN public.profiles used ON used.id = r.user_id;

GRANT SELECT ON public.promo_code_usage_v2 TO authenticated;
GRANT SELECT ON public.promo_code_usage_log TO authenticated;
