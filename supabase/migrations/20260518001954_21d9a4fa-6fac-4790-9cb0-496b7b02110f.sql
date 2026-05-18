ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS min_withdrawal bigint NOT NULL DEFAULT 2000000;

CREATE OR REPLACE FUNCTION public.create_withdrawal_request(_amount bigint, _ingame text, _gang text, _ticket text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); bal bigint; req_id uuid; min_amt bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE(min_withdrawal, 2000000) INTO min_amt FROM app_settings WHERE id = 1;
  min_amt := COALESCE(min_amt, 2000000);
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _amount < min_amt THEN
    RAISE EXCEPTION 'Minimum withdrawal is % tokens', min_amt;
  END IF;
  SELECT token_balance INTO bal FROM profiles WHERE id = uid FOR UPDATE;
  IF bal IS NULL OR bal < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE profiles SET token_balance = token_balance - _amount WHERE id = uid;
  INSERT INTO withdrawal_requests(user_id, ingame_name, gang_name, amount, ticket_ref)
    VALUES (uid, _ingame, _gang, _amount, _ticket) RETURNING id INTO req_id;
  INSERT INTO notifications(user_id, title, body)
    VALUES (uid, 'Withdrawal requested', 'Your request for '||_amount||' tokens has been submitted.');
  RETURN req_id;
END $function$;