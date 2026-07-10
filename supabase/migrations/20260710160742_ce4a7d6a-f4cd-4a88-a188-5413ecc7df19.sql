-- ============ NEWS TABLE ============
CREATE TABLE IF NOT EXISTS public.news (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text,
  image_url text,
  link_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.news TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news TO authenticated;
GRANT ALL ON public.news TO service_role;

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news public read" ON public.news;
CREATE POLICY "news public read" ON public.news FOR SELECT USING (true);
DROP POLICY IF EXISTS "admins manage news" ON public.news;
CREATE POLICY "admins manage news" ON public.news FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_news_updated_at ON public.news;
CREATE TRIGGER update_news_updated_at BEFORE UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'news'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news;
  END IF;
END $$;

-- ============ LOTTERY: allow 1-10 picks ============
CREATE OR REPLACE FUNCTION public.place_lottery_ticket_multi(_draw_id uuid, _numbers integer[], _stake bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_draw public.lottery_draws%ROWTYPE;
  v_enabled boolean; v_min bigint; v_max bigint;
  v_balance bigint; v_new_balance bigint; v_house bigint;
  v_ticket_id uuid; v_n integer; v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT lottery_enabled, lottery_min_stake, lottery_max_stake
    INTO v_enabled, v_min, v_max FROM public.app_settings WHERE id = 1;
  IF NOT COALESCE(v_enabled, false) THEN RAISE EXCEPTION 'The lottery is currently closed'; END IF;
  SELECT * INTO v_draw FROM public.lottery_draws WHERE id = _draw_id;
  IF v_draw.id IS NULL THEN RAISE EXCEPTION 'Draw not found'; END IF;
  IF v_draw.status <> 'open' THEN RAISE EXCEPTION 'This draw is not accepting tickets'; END IF;
  SELECT array_agg(DISTINCT x) INTO _numbers FROM unnest(_numbers) x;
  v_count := COALESCE(array_length(_numbers, 1), 0);
  IF v_count < 1 OR v_count > 10 THEN RAISE EXCEPTION 'Pick between 1 and 10 numbers'; END IF;
  IF v_count <> COALESCE(v_draw.picks_count, 1) THEN
    RAISE EXCEPTION 'Pick exactly % number(s) for this draw', COALESCE(v_draw.picks_count, 1);
  END IF;
  FOREACH v_n IN ARRAY _numbers LOOP
    IF v_n < 0 OR v_n > v_draw.number_max THEN
      RAISE EXCEPTION 'Numbers must be between 0 and %', v_draw.number_max;
    END IF;
  END LOOP;
  IF _stake < v_min THEN RAISE EXCEPTION 'Minimum stake is %', v_min; END IF;
  IF _stake > v_max THEN RAISE EXCEPTION 'Maximum stake is %', v_max; END IF;
  SELECT token_balance INTO v_balance FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_balance < _stake THEN RAISE EXCEPTION 'Insufficient token balance'; END IF;
  UPDATE public.profiles SET token_balance = token_balance - _stake
    WHERE id = v_user RETURNING token_balance INTO v_new_balance;
  INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
  VALUES (v_user, -_stake, v_new_balance, 'lottery_stake', 'Lottery ticket: ' || array_to_string(_numbers, ','));
  UPDATE public.house_wallet SET balance = balance + _stake, total_in = total_in + _stake, updated_at = now()
    WHERE id = 1 RETURNING balance INTO v_house;
  INSERT INTO public.house_transactions (kind, amount, balance_after, user_id, reason)
  VALUES ('lottery_stake', _stake, COALESCE(v_house, 0), v_user, 'Lottery ticket');
  INSERT INTO public.lottery_tickets (draw_id, user_id, number, numbers, stake)
  VALUES (_draw_id, v_user, _numbers[1], _numbers, _stake) RETURNING id INTO v_ticket_id;
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket_id, 'new_balance', v_new_balance);
END;
$function$;

-- Shared settlement
CREATE OR REPLACE FUNCTION public._settle_lottery_draw(_draw_id uuid, _winning integer[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_draw public.lottery_draws%ROWTYPE; v_ticket record;
  v_picks integer[]; v_matches integer; v_npicks integer;
  v_payout bigint; v_new_balance bigint; v_house bigint;
  v_winners integer := 0; v_total_payout bigint := 0;
BEGIN
  SELECT * INTO v_draw FROM public.lottery_draws WHERE id = _draw_id FOR UPDATE;
  IF v_draw.id IS NULL THEN RAISE EXCEPTION 'Draw not found'; END IF;
  IF v_draw.status = 'drawn' THEN RAISE EXCEPTION 'This draw is already settled'; END IF;
  FOR v_ticket IN SELECT * FROM public.lottery_tickets WHERE draw_id = _draw_id AND status = 'open' LOOP
    v_picks := COALESCE(v_ticket.numbers, ARRAY[v_ticket.number]);
    v_npicks := COALESCE(array_length(v_picks, 1), 0);
    SELECT count(*) INTO v_matches FROM unnest(v_picks) x WHERE x = ANY(_winning);
    v_payout := 0;
    IF v_npicks > 0 AND v_matches = v_npicks THEN
      v_payout := (v_ticket.stake * v_draw.multiplier)::bigint;
    END IF;
    IF v_payout > 0 THEN
      UPDATE public.lottery_tickets SET status = 'won', payout = v_payout WHERE id = v_ticket.id;
      UPDATE public.profiles SET token_balance = token_balance + v_payout
        WHERE id = v_ticket.user_id RETURNING token_balance INTO v_new_balance;
      INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
      VALUES (v_ticket.user_id, v_payout, v_new_balance, 'lottery_win', 'Lottery win');
      UPDATE public.house_wallet SET balance = balance - v_payout, total_out = total_out + v_payout, updated_at = now()
        WHERE id = 1 RETURNING balance INTO v_house;
      INSERT INTO public.house_transactions (kind, amount, balance_after, user_id, reason)
      VALUES ('lottery_payout', -v_payout, COALESCE(v_house, 0), v_ticket.user_id, 'Lottery payout');
      v_winners := v_winners + 1; v_total_payout := v_total_payout + v_payout;
    ELSE
      UPDATE public.lottery_tickets SET status = 'lost' WHERE id = v_ticket.id;
    END IF;
  END LOOP;
  UPDATE public.lottery_draws
    SET status = 'drawn', winning_numbers = _winning, winning_number = _winning[1], drawn_at = now()
    WHERE id = _draw_id;
  RETURN jsonb_build_object('ok', true, 'winning_numbers', _winning, 'winners', v_winners, 'total_payout', v_total_payout);
END;
$function$;

-- Admin draw uses shared settlement
CREATE OR REPLACE FUNCTION public.draw_lottery(_draw_id uuid, _winning_number integer DEFAULT NULL::integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_draw public.lottery_draws%ROWTYPE; v_winning integer[]; v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO v_draw FROM public.lottery_draws WHERE id = _draw_id;
  IF v_draw.id IS NULL THEN RAISE EXCEPTION 'Draw not found'; END IF;
  v_count := LEAST(GREATEST(COALESCE(v_draw.win_count, 10), 10), v_draw.number_max + 1);
  IF _winning_number IS NOT NULL THEN
    v_winning := ARRAY[_winning_number];
    SELECT v_winning || COALESCE(array_agg(n), ARRAY[]::integer[]) INTO v_winning FROM (
      SELECT n FROM generate_series(0, v_draw.number_max) n
      WHERE n <> _winning_number ORDER BY random() LIMIT GREATEST(v_count - 1, 0)
    ) s;
  ELSE
    SELECT array_agg(n) INTO v_winning FROM (
      SELECT n FROM generate_series(0, v_draw.number_max) n ORDER BY random() LIMIT v_count
    ) s;
  END IF;
  RETURN public._settle_lottery_draw(_draw_id, v_winning);
END;
$function$;

-- Auto-draw due lotteries
CREATE OR REPLACE FUNCTION public.auto_draw_due_lotteries()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_draw record; v_winning integer[]; v_count integer; v_done integer := 0;
BEGIN
  FOR v_draw IN
    SELECT * FROM public.lottery_draws
    WHERE status = 'open' AND (COALESCE(draw_at, created_at + interval '30 minutes') <= now())
  LOOP
    v_count := LEAST(GREATEST(COALESCE(v_draw.win_count, 10), 10), v_draw.number_max + 1);
    SELECT array_agg(n) INTO v_winning FROM (
      SELECT n FROM generate_series(0, v_draw.number_max) n ORDER BY random() LIMIT v_count
    ) s;
    PERFORM public._settle_lottery_draw(v_draw.id, v_winning);
    v_done := v_done + 1;
  END LOOP;
  RETURN v_done;
END;
$function$;

REVOKE ALL ON FUNCTION public._settle_lottery_draw(uuid, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_draw_due_lotteries() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-draw-lotteries') THEN
    PERFORM cron.unschedule('auto-draw-lotteries');
  END IF;
  PERFORM cron.schedule('auto-draw-lotteries', '*/5 * * * *', $$ SELECT public.auto_draw_due_lotteries(); $$);
END;
$cron$;