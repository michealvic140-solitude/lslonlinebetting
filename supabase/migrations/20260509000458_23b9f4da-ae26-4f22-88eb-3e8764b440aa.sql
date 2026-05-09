REVOKE EXECUTE ON FUNCTION public.admin_refund_bet(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_refund_bet(uuid, text) TO authenticated;