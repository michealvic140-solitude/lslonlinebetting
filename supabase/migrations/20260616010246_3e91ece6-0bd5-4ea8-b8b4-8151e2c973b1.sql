CREATE OR REPLACE FUNCTION public.sync_future_contender_scores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  home_player_name text;
  away_player_name text;
  home_team_name text;
  away_team_name text;
  home_name text;
  away_name text;
BEGIN
  SELECT NULLIF(trim(p.name), ''), NULLIF(trim(t.name), '')
    INTO home_player_name, home_team_name
  FROM (SELECT NEW.home_player_id AS player_id, NEW.home_team_id AS team_id) s
  LEFT JOIN public.players p ON p.id = s.player_id
  LEFT JOIN public.teams t ON t.id = s.team_id;

  SELECT NULLIF(trim(p.name), ''), NULLIF(trim(t.name), '')
    INTO away_player_name, away_team_name
  FROM (SELECT NEW.away_player_id AS player_id, NEW.away_team_id AS team_id) s
  LEFT JOIN public.players p ON p.id = s.player_id
  LEFT JOIN public.teams t ON t.id = s.team_id;

  home_name := COALESCE(home_player_name, home_team_name, 'Home');
  away_name := COALESCE(away_player_name, away_team_name, 'Away');

  UPDATE public.odds o
  SET
    future_match_id = NEW.id,
    future_match_side = CASE
      WHEN lower(trim(o.label)) IN (lower(home_player_name), lower(home_team_name)) THEN 'home'
      WHEN lower(trim(o.label)) IN (lower(away_player_name), lower(away_team_name)) THEN 'away'
      ELSE NULL
    END,
    future_live_score = CASE
      WHEN lower(trim(o.label)) IN (lower(away_player_name), lower(away_team_name))
        THEN COALESCE(NEW.away_score,0) || '-' || COALESCE(NEW.home_score,0)
      ELSE COALESCE(NEW.home_score,0) || '-' || COALESCE(NEW.away_score,0)
    END,
    future_live_opponent = CASE
      WHEN lower(trim(o.label)) IN (lower(away_player_name), lower(away_team_name)) THEN home_name
      ELSE away_name
    END,
    future_live_outcome = CASE
      WHEN NEW.status::text NOT IN ('ended','completed','settled') THEN 'pending'
      WHEN NEW.winner_team_id IS NOT NULL
        AND lower(trim(o.label)) IN (lower(away_player_name), lower(away_team_name))
        AND NEW.winner_team_id = NEW.away_team_id THEN 'won'
      WHEN NEW.winner_team_id IS NOT NULL
        AND lower(trim(o.label)) IN (lower(home_player_name), lower(home_team_name))
        AND NEW.winner_team_id = NEW.home_team_id THEN 'won'
      WHEN NEW.winner_team_id IS NOT NULL THEN 'lost'
      WHEN lower(trim(o.label)) IN (lower(away_player_name), lower(away_team_name))
        AND COALESCE(NEW.away_score,0) > COALESCE(NEW.home_score,0) THEN 'won'
      WHEN lower(trim(o.label)) IN (lower(home_player_name), lower(home_team_name))
        AND COALESCE(NEW.home_score,0) > COALESCE(NEW.away_score,0) THEN 'won'
      WHEN COALESCE(NEW.home_score,0) <> COALESCE(NEW.away_score,0) THEN 'lost'
      ELSE 'pending'
    END,
    updated_at = now()
  FROM public.markets mk
  JOIN public.matches fm ON fm.id = mk.match_id
  WHERE o.market_id = mk.id
    AND fm.match_kind = 'future'
    AND fm.is_archived = false
    AND (
      lower(trim(o.label)) IN (lower(home_player_name), lower(home_team_name))
      OR lower(trim(o.label)) IN (lower(away_player_name), lower(away_team_name))
    );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_virtual_cycle(_running boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.app_settings SET virtual_cycle_running = _running, updated_at = now() WHERE id = 1;
  PERFORM public.admin_log_action(
    CASE WHEN _running THEN 'virtual_cycle_started' ELSE 'virtual_cycle_paused' END,
    'cycle', '1', jsonb_build_object('manual', true, 'reason', 'Manual virtual cycle control')
  );
  IF _running THEN
    PERFORM public.virtual_tick();
  END IF;
  RETURN jsonb_build_object('ok', true, 'running', _running);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_virtual_round(
  _match_id uuid,
  _home_score integer DEFAULT NULL,
  _away_score integer DEFAULT NULL,
  _first_blood_team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN public.resolve_virtual_round(_match_id, _home_score, _away_score, _first_blood_team_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_bet(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_refund_bet(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_void_bet(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_bet(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_bet(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_void_bet(uuid, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_virtual_cycle(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_lock_virtual_round(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_virtual_round(uuid, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_resolve_virtual_round(uuid, integer, integer, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_virtual_cycle(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_lock_virtual_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_virtual_round(uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_virtual_round(uuid, integer, integer, uuid) TO service_role;