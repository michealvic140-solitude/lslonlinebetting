DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ticket_status' AND e.enumlabel = 'in_progress'
  ) THEN
    ALTER TYPE public.ticket_status ADD VALUE 'in_progress' AFTER 'open';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'bet_status' AND e.enumlabel = 'refunded'
  ) THEN
    ALTER TYPE public.bet_status ADD VALUE 'refunded' AFTER 'suspended';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_refund_bet(_bet_id uuid, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE b record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO b FROM public.bets WHERE id = _bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF b.status = 'refunded' THEN RAISE EXCEPTION 'Ticket already refunded'; END IF;
  IF b.status IN ('won','cashed_out') THEN RAISE EXCEPTION 'Cannot refund an already paid ticket'; END IF;

  UPDATE public.profiles SET token_balance = token_balance + b.stake WHERE id = b.user_id;
  UPDATE public.bets SET status = 'refunded', settled_at = now() WHERE id = _bet_id;

  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (b.user_id, 'Ticket refunded', COALESCE(_reason,'Your bet ticket stake has been refunded by an admin.'), '/ticket/'||_bet_id);
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'refund_bet', 'bet', _bet_id::text, jsonb_build_object('reason', _reason, 'stake', b.stake));
END $$;

CREATE OR REPLACE VIEW public.promo_code_usage_log AS
SELECT
  pc.id AS promo_id,
  pc.code,
  pc.amount,
  pc.usage_limit,
  pc.used_count,
  pc.is_active,
  pc.created_at AS generated_at,
  pc.created_by,
  creator.full_name AS generated_by_name,
  creator.email AS generated_by_email,
  pr.id AS redemption_id,
  pr.user_id AS used_by,
  redeemer.full_name AS used_by_name,
  redeemer.email AS used_by_email,
  pr.created_at AS used_at
FROM public.promo_codes pc
LEFT JOIN public.profiles creator ON creator.id = pc.created_by
LEFT JOIN public.promo_redemptions pr ON pr.promo_id = pc.id
LEFT JOIN public.profiles redeemer ON redeemer.id = pr.user_id;

ALTER VIEW public.promo_code_usage_log SET (security_invoker = true);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profiles','token_requests','withdrawal_requests','support_tickets','ticket_messages','bets','promo_code_requests','ban_appeals','chat_messages'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;