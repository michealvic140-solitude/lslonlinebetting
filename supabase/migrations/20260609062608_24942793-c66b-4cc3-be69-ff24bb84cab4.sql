
CREATE OR REPLACE FUNCTION public.admin_list_users_with_kyc()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  gang_name text,
  gang_type text,
  token_balance bigint,
  is_banned boolean,
  is_muted boolean,
  is_restricted boolean,
  vip_tier text,
  xp bigint,
  created_at timestamptz,
  email_confirmed boolean,
  total_bets bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.phone,
    p.avatar_url,
    p.gang_name,
    p.gang_type::text,
    p.token_balance,
    p.is_banned,
    p.is_muted,
    p.is_restricted,
    p.vip_tier,
    p.xp,
    p.created_at,
    (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
    COALESCE((SELECT count(*) FROM public.bets b WHERE b.user_id = p.id), 0)::bigint AS total_bets
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  ORDER BY p.created_at DESC
  LIMIT 1000;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users_with_kyc() TO authenticated;
