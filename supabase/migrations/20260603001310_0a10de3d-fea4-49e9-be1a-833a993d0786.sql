
-- 1. Historical purge: pivot on matches.created_at in the date range,
-- delete every dependent row bottom-up.
WITH m AS (
  SELECT id FROM public.matches
  WHERE created_at >= '2026-03-15'::timestamptz
    AND created_at <  '2026-06-03'::timestamptz
)
DELETE FROM public.bet_selections WHERE match_id IN (SELECT id FROM m);

-- Also delete any bets created in the same window (covers tickets without selections).
DELETE FROM public.bets
WHERE created_at >= '2026-03-15'::timestamptz
  AND created_at <  '2026-06-03'::timestamptz;

-- Then orphaned odds/markets/matches in the range.
DELETE FROM public.odds
WHERE market_id IN (
  SELECT mk.id FROM public.markets mk
  JOIN public.matches m ON m.id = mk.match_id
  WHERE m.created_at >= '2026-03-15'::timestamptz
    AND m.created_at <  '2026-06-03'::timestamptz
);

DELETE FROM public.markets
WHERE match_id IN (
  SELECT id FROM public.matches
  WHERE created_at >= '2026-03-15'::timestamptz
    AND created_at <  '2026-06-03'::timestamptz
);

DELETE FROM public.matches
WHERE created_at >= '2026-03-15'::timestamptz
  AND created_at <  '2026-06-03'::timestamptz;

-- 2. Leaderboard reset
DELETE FROM public.leaderboard_overrides;

-- 3. Stuck bet auto-settle helper
CREATE OR REPLACE FUNCTION public.fix_stuck_bets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet RECORD;
  v_fixed integer := 0;
  v_unsettled integer;
BEGIN
  FOR v_bet IN
    SELECT b.id FROM public.bets b
    WHERE b.status = 'open'
      AND b.settled_at IS NULL
      AND EXISTS (SELECT 1 FROM public.bet_selections WHERE bet_id = b.id)
  LOOP
    SELECT count(*) INTO v_unsettled
    FROM public.bet_selections bs
    JOIN public.matches m ON m.id = bs.match_id
    WHERE bs.bet_id = v_bet.id
      AND m.status <> 'ended';

    IF v_unsettled = 0 THEN
      BEGIN
        PERFORM public.settle_pay_winning_bet(v_bet.id);
        v_fixed := v_fixed + 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
  RETURN v_fixed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fix_stuck_bets() TO service_role;

SELECT public.fix_stuck_bets();
SELECT public.fix_pending_virtual_bets();

-- 4. Referral hardening
CREATE UNIQUE INDEX IF NOT EXISTS referral_redemptions_user_id_unique
  ON public.referral_redemptions(user_id);
