
CREATE OR REPLACE FUNCTION public.claim_task(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t public.user_tasks%ROWTYPE;
  uid uuid := auth.uid();
  new_balance bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO t FROM public.user_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF t.user_id <> uid THEN RAISE EXCEPTION 'Not your task'; END IF;
  IF t.status = 'claimed' THEN RAISE EXCEPTION 'Already claimed'; END IF;
  IF t.status <> 'completed' THEN RAISE EXCEPTION 'Task not completed'; END IF;

  UPDATE public.user_tasks SET status = 'claimed', completed_at = COALESCE(completed_at, now()) WHERE id = _task_id;
  UPDATE public.profiles SET token_balance = token_balance + t.reward_tokens WHERE id = uid
    RETURNING token_balance INTO new_balance;

  INSERT INTO public.token_transactions (user_id, amount, balance_after, kind, description, metadata)
  VALUES (uid, t.reward_tokens, new_balance, 'task_reward', 'Task: ' || t.title, jsonb_build_object('task_id', t.id));

  RETURN jsonb_build_object('ok', true, 'reward', t.reward_tokens, 'balance', new_balance);
END;
$$;
