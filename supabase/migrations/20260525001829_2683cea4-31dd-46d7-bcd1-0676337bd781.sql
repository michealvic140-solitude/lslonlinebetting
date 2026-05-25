
DROP TRIGGER IF EXISTS profiles_log_token ON public.profiles;

DO $$ BEGIN PERFORM cron.unschedule('virtual-tick-every-minute'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.auto_resolve_virtual_round(_match_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m record; mk record; score record;
  hs int; as_ int; max_s int;
  v_winner_team_id uuid; v_winner_label text;
  cfg record; bonus bigint;
BEGIN
  SELECT * INTO m FROM matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL OR NOT m.is_virtual THEN RAISE EXCEPTION 'Not a virtual round'; END IF;
  IF m.status = 'ended' THEN RETURN jsonb_build_object('ok', false, 'msg', 'already settled'); END IF;

  SELECT virtual_max_score, virtual_win_bonus_tokens, virtual_xp_per_win, virtual_payout_multiplier
    INTO cfg FROM app_settings WHERE id = 1;
  max_s := COALESCE(cfg.virtual_max_score, 8);
  bonus := COALESCE(cfg.virtual_win_bonus_tokens, 0);

  SELECT * INTO score FROM public.virtual_score_for_match(_match_id, max_s);
  hs := score.home_score; as_ := score.away_score;

  IF hs > as_ THEN v_winner_team_id := m.home_team_id;
  ELSIF as_ > hs THEN v_winner_team_id := m.away_team_id;
  ELSE v_winner_team_id := NULL; END IF;

  UPDATE odds o SET is_winner = false FROM markets mm WHERE o.market_id = mm.id AND mm.match_id = _match_id;

  FOR mk IN SELECT * FROM markets WHERE match_id = _match_id AND (lower(name) LIKE '%win%' OR lower(name) = '1x2') LOOP
    IF v_winner_team_id IS NULL THEN v_winner_label := 'Draw';
    ELSIF v_winner_team_id = m.home_team_id THEN SELECT name INTO v_winner_label FROM teams WHERE id = m.home_team_id;
    ELSE SELECT name INTO v_winner_label FROM teams WHERE id = m.away_team_id; END IF;
    UPDATE odds SET is_winner = (label = v_winner_label) WHERE market_id = mk.id;
  END LOOP;

  UPDATE matches SET status='ended', home_score=hs, away_score=as_,
    winner_team_id=v_winner_team_id, virtual_first_blood_team_id=NULL,
    settled_by=NULL, settled_at=now(), updated_at=now() WHERE id=_match_id;

  UPDATE bet_selections bs SET result = CASE WHEN o.is_winner THEN 'won' ELSE 'lost' END
  FROM odds o, markets mk
  WHERE bs.odd_id = o.id AND o.market_id = mk.id AND bs.match_id = _match_id AND o.is_winner IS NOT NULL;

  WITH bet_ids AS (SELECT DISTINCT bs.bet_id FROM bet_selections bs WHERE bs.match_id = _match_id),
  bet_status AS (
    SELECT b.id AS bet_id,
      bool_or(o.is_winner IS FALSE AND o.is_winner IS NOT NULL AND m2.status='ended') AS has_loser,
      bool_and(o.is_winner IS TRUE) AS all_winners,
      count(*) FILTER (WHERE m2.status <> 'ended') AS unsettled
    FROM bets b
    JOIN bet_selections bs ON bs.bet_id = b.id
    JOIN odds o ON o.id = bs.odd_id
    JOIN matches m2 ON m2.id = bs.match_id
    WHERE b.id IN (SELECT bet_id FROM bet_ids) AND b.status='open'
    GROUP BY b.id
  )
  UPDATE bets b SET
    status = CASE WHEN bs.has_loser THEN 'lost'::bet_status
                  WHEN bs.all_winners AND bs.unsettled=0 THEN 'won'::bet_status
                  ELSE b.status END,
    settled_at = CASE WHEN bs.has_loser OR (bs.all_winners AND bs.unsettled=0) THEN now() ELSE b.settled_at END
  FROM bet_status bs WHERE b.id = bs.bet_id;

  INSERT INTO virtual_payout_requests(bet_id, user_id, match_id, stake, amount, status)
  SELECT DISTINCT b.id, b.user_id, _match_id, b.stake,
    (b.potential_payout * COALESCE(cfg.virtual_payout_multiplier, 1.0))::bigint + bonus, 'pending'
  FROM bets b JOIN bet_selections bs ON bs.bet_id = b.id
  WHERE bs.match_id = _match_id AND b.status='won' AND b.settled_at IS NOT NULL
  ON CONFLICT (bet_id) DO NOTHING;

  INSERT INTO notifications(user_id, title, body, link)
  SELECT DISTINCT b.user_id, 'Virtual ticket won', 'Ticket '||b.tracking_id||' won. Open rounds & claims to continue.', '/virtual/history'
  FROM bets b JOIN bet_selections bs ON bs.bet_id=b.id
  WHERE bs.match_id=_match_id AND b.status='won';

  RETURN jsonb_build_object('ok', true, 'home', hs, 'away', as_);
END $function$;

DELETE FROM audit_logs WHERE actor_id IS NULL AND action IN ('virtual_round_resolved','virtual_round_locked','virtual_round_spawned');

UPDATE matches SET settled_at = COALESCE(settled_at, updated_at, now())
WHERE is_virtual = true AND status = 'ended' AND settled_at IS NULL;

UPDATE markets SET is_open = false
WHERE match_id IN (SELECT id FROM matches WHERE is_virtual = true)
  AND (lower(name) LIKE '%correct%score%' OR lower(name) LIKE '%total%' OR lower(name) LIKE '%first%blood%');

WITH affected AS (
  SELECT DISTINCT b.id AS bet_id FROM bets b
  JOIN bet_selections bs ON bs.bet_id = b.id
  JOIN matches m2 ON m2.id = bs.match_id
  WHERE b.status='open' AND m2.is_virtual=true
),
bet_status AS (
  SELECT b.id AS bet_id,
    bool_or(o.is_winner IS FALSE AND o.is_winner IS NOT NULL AND m2.status='ended') AS has_loser,
    bool_and(o.is_winner IS TRUE) AS all_winners,
    count(*) FILTER (WHERE m2.status <> 'ended') AS unsettled
  FROM bets b
  JOIN bet_selections bs ON bs.bet_id = b.id
  JOIN odds o ON o.id = bs.odd_id
  JOIN matches m2 ON m2.id = bs.match_id
  WHERE b.id IN (SELECT bet_id FROM affected) AND b.status='open'
  GROUP BY b.id
)
UPDATE bets b SET
  status = CASE WHEN bs.has_loser THEN 'lost'::bet_status
                WHEN bs.all_winners AND bs.unsettled=0 THEN 'won'::bet_status
                ELSE b.status END,
  settled_at = CASE WHEN bs.has_loser OR (bs.all_winners AND bs.unsettled=0) THEN now() ELSE b.settled_at END
FROM bet_status bs WHERE b.id = bs.bet_id
  AND (bs.has_loser OR (bs.all_winners AND bs.unsettled=0));
