CREATE OR REPLACE FUNCTION public.virtual_score_for_match(_match_id uuid)
RETURNS TABLE(home_score integer, away_score integer, first_blood_team_id uuid)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  m public.matches%ROWTYPE;
  cfg record;
  max_s integer;
  raw_h integer;
  raw_a integer;
  first_raw integer;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN
    home_score := 0;
    away_score := 0;
    first_blood_team_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT virtual_max_score INTO cfg FROM public.app_settings WHERE id = 1;
  max_s := GREATEST(1, LEAST(30, COALESCE(cfg.virtual_max_score, 8)));

  raw_h := mod(abs(hashtext(_match_id::text || ':home-final')::bigint), max_s + 1)::integer;
  raw_a := mod(abs(hashtext(_match_id::text || ':away-final')::bigint), max_s + 1)::integer;

  IF raw_h = 0 AND raw_a = 0 THEN
    IF mod(abs(hashtext(_match_id::text || ':zero-break')::bigint), 2) = 0 THEN
      raw_h := 1;
    ELSE
      raw_a := 1;
    END IF;
  END IF;

  IF max_s >= 3 AND raw_h = 0 AND raw_a >= 3 THEN
    raw_h := 1 + mod(abs(hashtext(_match_id::text || ':home-keepalive')::bigint), LEAST(3, max_s));
  END IF;
  IF max_s >= 3 AND raw_a = 0 AND raw_h >= 3 THEN
    raw_a := 1 + mod(abs(hashtext(_match_id::text || ':away-keepalive')::bigint), LEAST(3, max_s));
  END IF;

  home_score := LEAST(raw_h, max_s);
  away_score := LEAST(raw_a, max_s);
  first_raw := mod(abs(hashtext(_match_id::text || ':first-blood')::bigint), GREATEST(1, home_score + away_score));
  first_blood_team_id := CASE
    WHEN home_score + away_score = 0 THEN NULL
    WHEN home_score = 0 THEN m.away_team_id
    WHEN away_score = 0 THEN m.home_team_id
    WHEN first_raw < home_score THEN m.home_team_id
    ELSE m.away_team_id
  END;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.virtual_score_for_match(uuid) TO anon, authenticated, service_role;