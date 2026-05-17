
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS emblem_auto_approve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.review_gang_emblem(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO e FROM gang_emblems WHERE id = _id FOR UPDATE;
  IF e IS NULL THEN RAISE EXCEPTION 'Emblem not found'; END IF;
  UPDATE gang_emblems SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _id;
  IF _approve THEN
    UPDATE profiles SET gang_emblem_url = e.image_url, emblem_status = 'approved' WHERE id = e.user_id;
    INSERT INTO notifications(user_id, title, body) VALUES (e.user_id, 'Gang emblem approved', 'Your emblem is now live.');
  ELSE
    UPDATE profiles SET emblem_status = 'rejected' WHERE id = e.user_id;
    INSERT INTO notifications(user_id, title, body) VALUES (e.user_id, 'Gang emblem rejected', COALESCE(_note, 'Please submit a different emblem.'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_adjust_xp(_user_id uuid, _delta integer, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_xp bigint; new_tier text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE profiles SET xp = GREATEST(0, xp + _delta) WHERE id = _user_id RETURNING xp INTO new_xp;
  new_tier := CASE WHEN new_xp >= 25000 THEN 'legend' WHEN new_xp >= 10000 THEN 'platinum' WHEN new_xp >= 3000 THEN 'gold' WHEN new_xp >= 500 THEN 'silver' ELSE 'bronze' END;
  UPDATE profiles SET vip_tier = new_tier WHERE id = _user_id;
  INSERT INTO audit_logs(actor_id, action, target_type, target_id, metadata) VALUES (auth.uid(), 'admin_adjust_xp', 'profile', _user_id::text, jsonb_build_object('delta', _delta, 'reason', _reason, 'new_xp', new_xp));
  RETURN jsonb_build_object('xp', new_xp, 'vip_tier', new_tier);
END $$;

CREATE OR REPLACE FUNCTION public.gen_referral_code() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'LSL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  END IF;
  RETURN NEW;
END $$;
