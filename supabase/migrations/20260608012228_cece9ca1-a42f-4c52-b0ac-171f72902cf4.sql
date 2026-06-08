
CREATE OR REPLACE FUNCTION public.trg_fix_pending_after_match_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'ended' AND (OLD.status IS DISTINCT FROM 'ended') THEN
    BEGIN
      PERFORM public.fix_pending_virtual_bets();
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS matches_fix_pending_bets ON public.matches;
CREATE TRIGGER matches_fix_pending_bets
AFTER UPDATE OF status ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.trg_fix_pending_after_match_end();

SELECT public.fix_pending_virtual_bets();
