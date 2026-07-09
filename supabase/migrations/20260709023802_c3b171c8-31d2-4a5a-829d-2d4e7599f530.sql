
-- 1) Add featured matches background image settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS featured_bg_url text,
  ADD COLUMN IF NOT EXISTS featured_bg_fit text DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS featured_bg_position text DEFAULT 'center';

-- 2) Auto-settle lotteries older than 30 minutes (callable by anon so home page can heartbeat)
CREATE OR REPLACE FUNCTION public.auto_settle_lotteries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draw public.lottery_draws%ROWTYPE;
  v_winning integer[];
  v_count integer;
  v_ticket record;
  v_picks integer[];
  v_matches integer;
  v_npicks integer;
  v_payout bigint;
  v_new_balance bigint;
  v_house bigint;
  v_settled integer := 0;
BEGIN
  FOR v_draw IN
    SELECT * FROM public.lottery_draws
    WHERE status = 'open'
      AND created_at < now() - interval '30 minutes'
    ORDER BY created_at ASC
    LIMIT 5
    FOR UPDATE SKIP LOCKED
  LOOP
    v_count := LEAST(GREATEST(COALESCE(v_draw.win_count, 10), 1), v_draw.number_max + 1);
    SELECT array_agg(n) INTO v_winning
    FROM (SELECT n FROM generate_series(0, v_draw.number_max) n ORDER BY random() LIMIT v_count) s;

    FOR v_ticket IN
      SELECT * FROM public.lottery_tickets WHERE draw_id = v_draw.id AND status = 'open'
    LOOP
      v_picks := COALESCE(v_ticket.numbers, ARRAY[v_ticket.number]);
      v_npicks := COALESCE(array_length(v_picks, 1), 0);
      SELECT count(*) INTO v_matches FROM unnest(v_picks) x WHERE x = ANY(v_winning);
      v_payout := 0;
      IF v_npicks > 0 AND v_matches = v_npicks THEN
        v_payout := (v_ticket.stake * 2)::bigint;
      ELSIF v_npicks = 5 AND v_matches = 2 THEN
        v_payout := v_ticket.stake;
      END IF;
      IF v_payout > 0 THEN
        UPDATE public.lottery_tickets SET status = 'won', payout = v_payout WHERE id = v_ticket.id;
        UPDATE public.profiles SET token_balance = token_balance + v_payout
          WHERE id = v_ticket.user_id RETURNING token_balance INTO v_new_balance;
        INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
          VALUES (v_ticket.user_id, v_payout, v_new_balance, 'lottery_win', 'Lottery win (auto)');
        UPDATE public.house_wallet SET balance = balance - v_payout, total_out = total_out + v_payout, updated_at = now()
          WHERE id = 1 RETURNING balance INTO v_house;
        INSERT INTO public.house_transactions (kind, amount, balance_after, user_id, reason)
          VALUES ('lottery_payout', -v_payout, COALESCE(v_house, 0), v_ticket.user_id, 'Lottery payout (auto)');
      ELSE
        UPDATE public.lottery_tickets SET status = 'lost' WHERE id = v_ticket.id;
      END IF;
    END LOOP;

    UPDATE public.lottery_draws
      SET status = 'drawn', winning_numbers = v_winning, winning_number = v_winning[1], drawn_at = now()
      WHERE id = v_draw.id;
    v_settled := v_settled + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'settled', v_settled);
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_settle_lotteries() TO anon, authenticated;
