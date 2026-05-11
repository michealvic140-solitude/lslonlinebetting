-- 1) Ensure auth signup trigger exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill missing profiles/roles
INSERT INTO public.profiles (id, full_name, email, phone, discord_username, discord_full_name, ingame_name, country, server, gang_name, gang_type)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)), u.email,
  u.raw_user_meta_data->>'phone', u.raw_user_meta_data->>'discord_username', u.raw_user_meta_data->>'discord_full_name',
  u.raw_user_meta_data->>'ingame_name', u.raw_user_meta_data->>'country',
  COALESCE(u.raw_user_meta_data->>'server','LOMITA AFR'),
  u.raw_user_meta_data->>'gang_name', NULLIF(u.raw_user_meta_data->>'gang_type','')::public.gang_type
FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, CASE WHEN u.email = 'lomitashootersleague@gmail.com' THEN 'admin'::public.app_role ELSE 'viewer'::public.app_role END
FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id WHERE r.user_id IS NULL;

-- 3) Notify ticket owner when an admin/mod replies on their ticket
CREATE OR REPLACE FUNCTION public.notify_ticket_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF owner IS NULL OR NEW.user_id = owner THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(user_id, title, body, link)
  VALUES (owner, 'New reply on your support ticket',
          COALESCE(LEFT(NEW.content, 140), 'Admin sent you a reply.'),
          '/ticket/' || NEW.ticket_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_reply ON public.ticket_messages;
CREATE TRIGGER trg_notify_ticket_reply
AFTER INSERT ON public.ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_reply();

-- 4) Re-point user_id FKs from auth.users to public.profiles (so PostgREST embeds work)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE conname IN (
      'support_tickets_user_id_fkey','ticket_messages_user_id_fkey',
      'bets_user_id_fkey','promo_code_requests_user_id_fkey',
      'withdrawal_requests_user_id_fkey','user_tasks_user_id_fkey',
      'user_achievements_user_id_fkey','ban_appeals_user_id_fkey',
      'notifications_user_id_fkey','chat_messages_user_id_fkey',
      'token_requests_user_id_fkey','token_transactions_user_id_fkey',
      'promo_redemptions_user_id_fkey','user_roles_user_id_fkey'
    )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.support_tickets   ADD CONSTRAINT support_tickets_user_id_fkey   FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_messages   ADD CONSTRAINT ticket_messages_user_id_fkey   FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.bets              ADD CONSTRAINT bets_user_id_fkey              FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.promo_code_requests ADD CONSTRAINT promo_code_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_tasks        ADD CONSTRAINT user_tasks_user_id_fkey        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_achievements ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.ban_appeals       ADD CONSTRAINT ban_appeals_user_id_fkey       FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.notifications     ADD CONSTRAINT notifications_user_id_fkey     FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages     ADD CONSTRAINT chat_messages_user_id_fkey     FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.token_requests    ADD CONSTRAINT token_requests_user_id_fkey    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.token_transactions ADD CONSTRAINT token_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.promo_redemptions ADD CONSTRAINT promo_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles        ADD CONSTRAINT user_roles_user_id_fkey        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 5) Promo code targeting + view
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS max_uses integer,
  ADD COLUMN IF NOT EXISTS target_user_ids uuid[];

DROP VIEW IF EXISTS public.promo_code_usage_log;
CREATE VIEW public.promo_code_usage_log
WITH (security_invoker = true) AS
SELECT pc.id AS promo_id, pc.code, pc.amount, pc.usage_limit, pc.max_uses, pc.target_user_ids,
  pc.used_count, pc.is_active, pc.expires_at, pc.created_at AS generated_at, pc.created_by,
  creator.full_name AS generated_by_name, creator.email AS generated_by_email,
  pr.id AS redemption_id, pr.user_id AS used_by, pr.created_at AS used_at,
  user_p.full_name AS used_by_name, user_p.email AS used_by_email, user_p.gang_name AS used_by_gang_name
FROM public.promo_codes pc
LEFT JOIN public.profiles creator ON creator.id = pc.created_by
LEFT JOIN public.promo_redemptions pr ON pr.promo_id = pc.id
LEFT JOIN public.profiles user_p ON user_p.id = pr.user_id;

NOTIFY pgrst, 'reload schema';