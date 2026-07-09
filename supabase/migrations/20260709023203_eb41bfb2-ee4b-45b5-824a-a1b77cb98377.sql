ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS discord_support_url text;

ALTER TABLE public.lottery_draws ADD COLUMN IF NOT EXISTS picks_count integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shop_redemptions') THEN
    EXECUTE 'DROP POLICY IF EXISTS "shop redemptions admin select" ON public.shop_redemptions';
    EXECUTE 'CREATE POLICY "shop redemptions admin select" ON public.shop_redemptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='poll_votes') THEN
    EXECUTE 'DROP POLICY IF EXISTS "poll votes admin delete" ON public.poll_votes';
    EXECUTE 'CREATE POLICY "poll votes admin delete" ON public.poll_votes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''))';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.refund_shop_redemption(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_red public.shop_redemptions%ROWTYPE;
  v_new bigint;
  v_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_red FROM public.shop_redemptions WHERE id = _id FOR UPDATE;
  IF v_red.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_red.status = 'refunded' THEN RAISE EXCEPTION 'Already refunded'; END IF;
  UPDATE public.profiles SET token_balance = token_balance + v_red.cost
    WHERE id = v_red.user_id RETURNING token_balance INTO v_new;
  SELECT name INTO v_name FROM public.shop_items WHERE id = v_red.item_id;
  INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description)
    VALUES (v_red.user_id, v_red.cost, v_new, 'shop_refund', 'Refund: ' || COALESCE(v_name, 'shop item'));
  UPDATE public.shop_items SET stock = stock + 1 WHERE id = v_red.item_id AND stock IS NOT NULL;
  UPDATE public.shop_redemptions SET status = 'refunded' WHERE id = _id;
  RETURN jsonb_build_object('ok', true, 'new_balance', v_new);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refund_shop_redemption(uuid) TO authenticated;