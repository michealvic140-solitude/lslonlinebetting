CREATE OR REPLACE FUNCTION public.admin_void_bet(_bet_id uuid, _refund boolean DEFAULT false, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO b FROM public.bets WHERE id = _bet_id FOR UPDATE;
  IF b IS NULL THEN
    RAISE EXCEPTION 'Bet not found';
  END IF;
  IF b.status IN ('won','cashed_out','refunded') THEN
    RAISE EXCEPTION 'Cannot void an already paid or refunded ticket';
  END IF;

  IF _refund THEN
    UPDATE public.profiles SET token_balance = token_balance + b.stake WHERE id = b.user_id;
  END IF;

  UPDATE public.bets SET status = 'void', settled_at = now() WHERE id = _bet_id;

  INSERT INTO public.notifications(user_id, title, body, link)
  VALUES (
    b.user_id,
    CASE WHEN _refund THEN 'Ticket voided and refunded' ELSE 'Ticket voided' END,
    COALESCE(_reason, 'Your bet ticket has been marked void by an admin.') || CASE WHEN _refund THEN ' Stake refunded.' ELSE '' END,
    '/ticket/' || _bet_id
  );

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'void_bet', 'bet', _bet_id::text, jsonb_build_object('reason', _reason, 'refunded', _refund, 'stake', b.stake));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_void_bet(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_void_bet(uuid, boolean, text) TO authenticated;