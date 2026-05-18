CREATE OR REPLACE FUNCTION public.admin_delete_bet(_bet_id uuid, _refund boolean DEFAULT false, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO b FROM public.bets WHERE id=_bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF _refund AND b.status IN ('refunded','won','cashed_out','void') THEN
    RAISE EXCEPTION 'Stake already settled or refunded — cannot refund again (status: %)', b.status;
  END IF;
  IF _refund THEN
    UPDATE public.profiles SET token_balance = token_balance + b.stake WHERE id = b.user_id;
  END IF;
  DELETE FROM public.bet_selections WHERE bet_id = _bet_id;
  DELETE FROM public.bets WHERE id = _bet_id;
  INSERT INTO public.notifications(user_id, title, body)
    VALUES (b.user_id, 'Ticket removed', COALESCE(_reason,'Your bet ticket has been removed by an admin.') || CASE WHEN _refund THEN ' Stake refunded.' ELSE '' END);
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'delete_bet', 'bet', _bet_id::text, jsonb_build_object('reason', _reason, 'refunded', _refund, 'stake', b.stake));
END $$;