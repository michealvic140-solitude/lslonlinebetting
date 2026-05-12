CREATE TABLE IF NOT EXISTS public.house_wallet (
  id integer PRIMARY KEY DEFAULT 1,
  balance bigint NOT NULL DEFAULT 0,
  total_in bigint NOT NULL DEFAULT 0,
  total_out bigint NOT NULL DEFAULT 0,
  payouts_paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT house_wallet_singleton CHECK (id = 1)
);
INSERT INTO public.house_wallet (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.house_wallet ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "house wallet read admin" ON public.house_wallet;
CREATE POLICY "house wallet read admin" ON public.house_wallet FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "house wallet update admin" ON public.house_wallet;
CREATE POLICY "house wallet update admin" ON public.house_wallet FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.house_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  user_id uuid,
  bet_id uuid,
  actor_id uuid,
  reason text
);
ALTER TABLE public.house_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "house tx admin read" ON public.house_transactions;
CREATE POLICY "house tx admin read" ON public.house_transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_house_tx_created ON public.house_transactions(created_at DESC);

CREATE OR REPLACE FUNCTION public.house_on_bet_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_bal bigint;
BEGIN
  UPDATE public.house_wallet
    SET balance = balance + NEW.stake,
        total_in = total_in + NEW.stake,
        updated_at = now()
    WHERE id = 1
    RETURNING balance INTO new_bal;
  INSERT INTO public.house_transactions(kind, amount, balance_after, user_id, bet_id, reason)
    VALUES ('bet_inflow', NEW.stake, new_bal, NEW.user_id, NEW.id, 'Stake from bet ' || NEW.tracking_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_house_on_bet_insert ON public.bets;
CREATE TRIGGER trg_house_on_bet_insert AFTER INSERT ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.house_on_bet_insert();

CREATE OR REPLACE FUNCTION public.house_on_bet_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_bal bigint;
BEGIN
  IF NEW.status IN ('refunded') AND OLD.status <> 'refunded' THEN
    UPDATE public.house_wallet
      SET balance = balance - OLD.stake,
          total_out = total_out + OLD.stake,
          updated_at = now()
      WHERE id = 1
      RETURNING balance INTO new_bal;
    INSERT INTO public.house_transactions(kind, amount, balance_after, user_id, bet_id, reason)
      VALUES ('refund_inflow', -OLD.stake, new_bal, NEW.user_id, NEW.id, 'Refund of bet ' || NEW.tracking_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_house_on_bet_refund ON public.bets;
CREATE TRIGGER trg_house_on_bet_refund AFTER UPDATE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.house_on_bet_refund();

CREATE OR REPLACE FUNCTION public.user_cashout_bet(_bet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE b record; total_sels int; won_sels int; lost_sels int; pending_sels int;
        new_bal bigint; new_house bigint; paused boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT payouts_paused INTO paused FROM public.house_wallet WHERE id = 1;
  IF paused THEN RAISE EXCEPTION 'Payouts are temporarily paused by the house. Please try again later.'; END IF;

  SELECT * INTO b FROM public.bets WHERE id = _bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  IF b.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your ticket'; END IF;
  IF b.status <> 'open' THEN RAISE EXCEPTION 'Ticket is %, cannot cash out', b.status; END IF;

  SELECT count(*),
    count(*) FILTER (WHERE result = 'won'),
    count(*) FILTER (WHERE result = 'lost'),
    count(*) FILTER (WHERE result IS NULL)
  INTO total_sels, won_sels, lost_sels, pending_sels
  FROM public.bet_selections WHERE bet_id = _bet_id;

  IF lost_sels > 0 THEN RAISE EXCEPTION 'Cannot cash out: at least one selection lost'; END IF;
  IF pending_sels > 0 THEN RAISE EXCEPTION 'Cannot cash out: % selection(s) still pending', pending_sels; END IF;

  UPDATE public.profiles SET token_balance = token_balance + b.potential_payout
    WHERE id = b.user_id RETURNING token_balance INTO new_bal;
  UPDATE public.house_wallet
    SET balance = balance - b.potential_payout,
        total_out = total_out + b.potential_payout,
        updated_at = now()
    WHERE id = 1 RETURNING balance INTO new_house;
  INSERT INTO public.house_transactions(kind, amount, balance_after, user_id, bet_id, reason)
    VALUES ('cashout', -b.potential_payout, new_house, b.user_id, b.id, 'Cashout of bet ' || b.tracking_id);

  UPDATE public.bets SET status = 'won', cashout_amount = b.potential_payout,
         cashed_out_at = now(), settled_at = COALESCE(settled_at, now())
    WHERE id = _bet_id;
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (b.user_id, 'Ticket cashed out', '+' || b.potential_payout || ' tokens credited.', '/ticket/'||_bet_id);
  RETURN jsonb_build_object('credited', b.potential_payout, 'balance', new_bal);
END $$;

CREATE OR REPLACE FUNCTION public.settle_pay_winning_bet(_bet_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE b record; new_bal bigint; new_house bigint; paused boolean;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT payouts_paused INTO paused FROM public.house_wallet WHERE id = 1;
  IF paused THEN RAISE EXCEPTION 'Payouts paused — resume the house wallet to credit winnings.'; END IF;

  SELECT * INTO b FROM public.bets WHERE id = _bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF b.status = 'won' AND b.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  UPDATE public.profiles SET token_balance = token_balance + b.potential_payout
    WHERE id = b.user_id RETURNING token_balance INTO new_bal;
  UPDATE public.house_wallet
    SET balance = balance - b.potential_payout,
        total_out = total_out + b.potential_payout,
        updated_at = now()
    WHERE id = 1 RETURNING balance INTO new_house;
  INSERT INTO public.house_transactions(kind, amount, balance_after, user_id, bet_id, reason)
    VALUES ('payout', -b.potential_payout, new_house, b.user_id, b.id, 'Winnings for bet ' || b.tracking_id);
  UPDATE public.bets SET status = 'won', settled_at = now() WHERE id = _bet_id;
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (b.user_id, 'Bet won! 🎉', '+' || b.potential_payout || ' tokens credited.', '/ticket/'||_bet_id);
  RETURN jsonb_build_object('paid', b.potential_payout, 'balance', new_bal);
END $$;

CREATE OR REPLACE FUNCTION public.house_set_paused(_paused boolean, _reason text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.house_wallet SET payouts_paused = _paused, pause_reason = _reason, updated_at = now() WHERE id = 1;
  INSERT INTO public.audit_logs(actor_id, action, target_type, metadata)
    VALUES (auth.uid(), CASE WHEN _paused THEN 'house_paused' ELSE 'house_resumed' END, 'house_wallet', jsonb_build_object('reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.house_manual_adjust(_amount bigint, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_bal bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _amount = 0 THEN RAISE EXCEPTION 'Amount must be non-zero'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'Reason required'; END IF;
  UPDATE public.house_wallet
    SET balance = balance + _amount,
        total_in = total_in + GREATEST(_amount, 0),
        total_out = total_out + GREATEST(-_amount, 0),
        updated_at = now()
    WHERE id = 1 RETURNING balance INTO new_bal;
  INSERT INTO public.house_transactions(kind, amount, balance_after, actor_id, reason)
    VALUES (CASE WHEN _amount > 0 THEN 'manual_credit' ELSE 'manual_debit' END, _amount, new_bal, auth.uid(), _reason);
  RETURN jsonb_build_object('balance', new_bal);
END $$;

DO $$
DECLARE in_total bigint; out_total bigint;
BEGIN
  SELECT COALESCE(SUM(stake),0) INTO in_total FROM public.bets;
  SELECT COALESCE(SUM(potential_payout),0) INTO out_total FROM public.bets WHERE status IN ('won');
  UPDATE public.house_wallet SET
    total_in = in_total,
    total_out = out_total,
    balance = in_total - out_total,
    updated_at = now()
  WHERE id = 1;
END $$;