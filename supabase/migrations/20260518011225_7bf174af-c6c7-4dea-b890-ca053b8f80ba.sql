
CREATE OR REPLACE FUNCTION public.claim_task(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t public.user_tasks%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO t FROM public.user_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF t.user_id <> uid THEN RAISE EXCEPTION 'Not your task'; END IF;
  IF t.status = 'claimed' THEN RAISE EXCEPTION 'Already claimed'; END IF;
  IF t.status <> 'completed' THEN RAISE EXCEPTION 'Task not completed'; END IF;

  UPDATE public.user_tasks SET status = 'claimed', completed_at = COALESCE(completed_at, now()) WHERE id = _task_id;
  UPDATE public.profiles SET token_balance = token_balance + t.reward_tokens WHERE id = uid;

  INSERT INTO public.token_transactions (user_id, amount, kind, reason, metadata)
  VALUES (uid, t.reward_tokens, 'task_reward', 'Task: ' || t.title, jsonb_build_object('task_id', t.id));

  RETURN jsonb_build_object('ok', true, 'reward', t.reward_tokens);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_award_achievement(_user_id uuid, _code text, _title text, _description text DEFAULT NULL, _icon text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  INSERT INTO public.user_achievements (user_id, code, title, description, icon)
  VALUES (_user_id, _code, _title, _description, _icon)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_task_completed(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.user_tasks SET status = 'completed', completed_at = now() WHERE id = _task_id AND status = 'pending';
END;
$$;
