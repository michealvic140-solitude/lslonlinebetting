CREATE OR REPLACE FUNCTION public.claim_virtual_payout(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; new_bal bigint; wallet_bal bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO r FROM virtual_payout_requests WHERE id = _id FOR UPDATE;
  IF r IS NULL OR r.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not yours'; END IF;
  IF r.status = 'claimed' THEN RAISE EXCEPTION 'Already claimed'; END IF;
  IF r.status = 'declined' THEN RAISE EXCEPTION 'Payout was declined'; END IF;

  SELECT balance INTO wallet_bal FROM virtual_house_wallet WHERE id=1 FOR UPDATE;
  IF wallet_bal < r.amount THEN
    RAISE EXCEPTION 'Virtual wallet has insufficient funds (need %, have %)', r.amount, wallet_bal USING ERRCODE='P0001';
  END IF;

  PERFORM public.virtual_wallet_debit(r.amount, 'payout', r.user_id, r.bet_id, r.match_id, 'Virtual payout claim');
  UPDATE profiles SET token_balance = token_balance + r.amount,
      xp = xp + COALESCE((SELECT virtual_xp_per_win FROM app_settings WHERE id=1),0)
    WHERE id = auth.uid() RETURNING token_balance INTO new_bal;
  INSERT INTO token_transactions(user_id, amount, balance_after, kind, description)
    VALUES (auth.uid(), r.amount, new_bal, 'bet_win', 'Virtual claim');
  UPDATE virtual_payout_requests
    SET status='claimed', claimed_at=now(),
        reviewed_by = COALESCE(reviewed_by, auth.uid()),
        reviewed_at = COALESCE(reviewed_at, now())
    WHERE id=_id;
  RETURN jsonb_build_object('ok', true, 'amount', r.amount, 'balance', new_bal);
END $$;