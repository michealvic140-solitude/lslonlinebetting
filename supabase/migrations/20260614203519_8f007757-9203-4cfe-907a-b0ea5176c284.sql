-- Port of upstream schema deltas from betting-platform-builder (28 migrations consolidated)
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.relname);
  END LOOP;
END $$;

-- Selective anon read
DO $$ DECLARE n text;
BEGIN
  FOR n IN SELECT unnest(ARRAY['advertisements','announcements','app_settings','ban_appeals','categories','events','highlights','leaderboard_overrides','markets','matches','odds','players','season_points','seasons','spotlights','teams','token_transactions'])
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', n);
  END LOOP;
END $$;

-- ============ Players / Matches deltas ============
ALTER TABLE public.players ALTER COLUMN team_id DROP NOT NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_kind text NOT NULL DEFAULT 'gang',
  ADD COLUMN IF NOT EXISTS home_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS away_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketing_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_match_kind_check') THEN
    ALTER TABLE public.matches ADD CONSTRAINT matches_match_kind_check CHECK (match_kind IN ('gang', 'shooter', 'future'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_match_kind ON public.matches(match_kind);
CREATE INDEX IF NOT EXISTS idx_matches_home_player_id ON public.matches(home_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_player_id ON public.matches(away_player_id);

-- ============ Odds: futures fields ============
ALTER TABLE public.odds
  ADD COLUMN IF NOT EXISTS future_candidate_type text,
  ADD COLUMN IF NOT EXISTS future_emblem_url text,
  ADD COLUMN IF NOT EXISTS future_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS future_next_title text,
  ADD COLUMN IF NOT EXISTS future_next_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS future_progress jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS future_match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS future_match_side text,
  ADD COLUMN IF NOT EXISTS future_live_score text,
  ADD COLUMN IF NOT EXISTS future_live_outcome text,
  ADD COLUMN IF NOT EXISTS future_live_opponent text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'odds_future_status_check') THEN
    ALTER TABLE public.odds ADD CONSTRAINT odds_future_status_check CHECK (future_status IN ('active','qualified','disqualified','lost','winner','settled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_odds_future_status ON public.odds(future_status);

-- ============ App settings: futures + new flags ============
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS futures_section_title text NOT NULL DEFAULT 'SEASONAL TOURNAMENT',
  ADD COLUMN IF NOT EXISTS futures_min_stake bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS futures_max_payout bigint NOT NULL DEFAULT 100000000,
  ADD COLUMN IF NOT EXISTS futures_max_selections integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS allow_rebet boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS leaderboard_header_url text,
  ADD COLUMN IF NOT EXISTS closed_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_message text NOT NULL DEFAULT 'The website is currently closed. Please check back later.',
  ADD COLUMN IF NOT EXISTS hot_bets_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS maintenance_image text,
  ADD COLUMN IF NOT EXISTS closed_image text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_futures_max_selections_check') THEN
    ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_futures_max_selections_check CHECK (futures_max_selections BETWEEN 1 AND 3);
  END IF;
END $$;

-- ============ Tournaments (idempotent) ============
CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tagline text DEFAULT 'ONE LEAGUE. NO MERCY. RESPECT THE GAME.',
  event_date date,
  status text NOT NULL DEFAULT 'draft',
  is_featured boolean NOT NULL DEFAULT false,
  champion_id uuid,
  futures_match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS tagline text DEFAULT 'ONE LEAGUE. NO MERCY. RESPECT THE GAME.',
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS champion_id uuid,
  ADD COLUMN IF NOT EXISTS futures_match_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid;

GRANT SELECT ON public.tournaments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tournaments are viewable by everyone" ON public.tournaments;
CREATE POLICY "Tournaments are viewable by everyone" ON public.tournaments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage tournaments" ON public.tournaments;
CREATE POLICY "Admins manage tournaments" ON public.tournaments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  logo_url text,
  seed int,
  current_round int NOT NULL DEFAULT 1,
  is_eliminated boolean NOT NULL DEFAULT false,
  eliminated_round int,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS seed int,
  ADD COLUMN IF NOT EXISTS current_round int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_eliminated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eliminated_round int,
  ADD COLUMN IF NOT EXISTS is_disqualified boolean NOT NULL DEFAULT false;

GRANT SELECT ON public.tournament_participants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_participants TO authenticated;
GRANT ALL ON public.tournament_participants TO service_role;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants viewable by everyone" ON public.tournament_participants;
CREATE POLICY "Participants viewable by everyone" ON public.tournament_participants FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage participants" ON public.tournament_participants;
CREATE POLICY "Admins manage participants" ON public.tournament_participants FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_champion_fk;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_champion_fk FOREIGN KEY (champion_id)
  REFERENCES public.tournament_participants(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round int NOT NULL,
  round_name text,
  slot int NOT NULL DEFAULT 0,
  label text,
  participant_a_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  participant_b_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  score_a int,
  score_b int,
  winner_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  next_match_id uuid REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  next_slot text,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS round_name text,
  ADD COLUMN IF NOT EXISTS slot int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS participant_a_id uuid,
  ADD COLUMN IF NOT EXISTS participant_b_id uuid,
  ADD COLUMN IF NOT EXISTS score_a int,
  ADD COLUMN IF NOT EXISTS score_b int,
  ADD COLUMN IF NOT EXISTS winner_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS next_match_id uuid,
  ADD COLUMN IF NOT EXISTS next_slot text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_label text;

CREATE INDEX IF NOT EXISTS idx_tmatch_match_id ON public.tournament_matches(match_id);

GRANT SELECT ON public.tournament_matches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_matches TO authenticated;
GRANT ALL ON public.tournament_matches TO service_role;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bracket matches viewable by everyone" ON public.tournament_matches;
CREATE POLICY "Bracket matches viewable by everyone" ON public.tournament_matches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage bracket matches" ON public.tournament_matches;
CREATE POLICY "Admins manage bracket matches" ON public.tournament_matches FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ Highlight reactions ============
ALTER TABLE public.highlights
  ADD COLUMN IF NOT EXISTS likes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislikes integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.highlight_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id uuid NOT NULL REFERENCES public.highlights(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like','dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (highlight_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.highlight_reactions TO authenticated;
GRANT ALL ON public.highlight_reactions TO service_role;
ALTER TABLE public.highlight_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own reactions" ON public.highlight_reactions;
CREATE POLICY "own reactions" ON public.highlight_reactions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ Profile / Bet sensitive-field triggers (relaxed for service_role + admin) ============
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Service role and admins may update sensitive fields directly
  IF current_setting('role', true) = 'service_role' OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.token_balance := OLD.token_balance;
  NEW.is_banned := OLD.is_banned;
  NEW.ban_reason := OLD.ban_reason;
  NEW.is_muted := OLD.is_muted;
  NEW.mute_reason := OLD.mute_reason;
  NEW.is_restricted := OLD.is_restricted;
  NEW.restrict_reason := OLD.restrict_reason;
  NEW.vip_tier := OLD.vip_tier;
  NEW.xp := OLD.xp;
  NEW.streak_days := OLD.streak_days;
  NEW.longest_streak := OLD.longest_streak;
  NEW.last_login_date := OLD.last_login_date;
  NEW.referral_code := OLD.referral_code;
  NEW.referred_by := OLD.referred_by;
  NEW.emblem_status := OLD.emblem_status;
  RETURN NEW;
END $$;

-- ============ Admin bet ops ============
CREATE OR REPLACE FUNCTION public.admin_refund_bet(_bet_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO b FROM public.bets WHERE id = _bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF b.status = 'void' THEN RAISE EXCEPTION 'Already refunded'; END IF;
  UPDATE public.profiles SET token_balance = token_balance + b.stake WHERE id = b.user_id;
  UPDATE public.bets SET status = 'void', settled_at = now() WHERE id = _bet_id;
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (b.user_id, 'Ticket refunded', COALESCE(_reason, 'Stake refunded.'), '/ticket/'||_bet_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_refund_bet(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refund_bet(uuid, text) TO authenticated;

-- ============ User self-cashout ============
CREATE OR REPLACE FUNCTION public.user_cashout_bet(_bet_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; cashout_pct numeric := 0.7; payout bigint; new_bal bigint;
BEGIN
  SELECT * INTO b FROM public.bets WHERE id = _bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF b.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your ticket'; END IF;
  IF b.status <> 'open' THEN RAISE EXCEPTION 'Cannot cash out: %', b.status; END IF;
  payout := GREATEST(b.stake, (b.potential_payout * cashout_pct)::bigint);
  UPDATE public.profiles SET token_balance = token_balance + payout WHERE id = b.user_id
    RETURNING token_balance INTO new_bal;
  UPDATE public.bets SET status = 'cashed_out', cashout_amount = payout, cashed_out_at = now(), settled_at = now() WHERE id = _bet_id;
  RETURN jsonb_build_object('paid', payout, 'balance', new_bal);
END $$;
REVOKE ALL ON FUNCTION public.user_cashout_bet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_cashout_bet(uuid) TO authenticated;

-- ============ One-open-bet rule (relaxed for futures) ============
CREATE OR REPLACE FUNCTION public.enforce_one_open_bet_per_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bet_user uuid; m_kind text; existing int; allow_rebet_flag boolean;
BEGIN
  SELECT user_id INTO bet_user FROM public.bets WHERE id = NEW.bet_id;
  SELECT match_kind INTO m_kind FROM public.matches WHERE id = NEW.match_id;
  IF m_kind = 'future' THEN RETURN NEW; END IF;
  SELECT COALESCE(allow_rebet, true) INTO allow_rebet_flag FROM public.app_settings WHERE id = 1;
  IF allow_rebet_flag THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO existing
    FROM public.bet_selections bs
    JOIN public.bets b ON b.id = bs.bet_id
   WHERE bs.match_id = NEW.match_id
     AND b.user_id = bet_user
     AND b.status = 'open'
     AND bs.bet_id <> NEW.bet_id;
  IF existing > 0 THEN
    RAISE EXCEPTION 'You already have an open ticket on this match';
  END IF;
  RETURN NEW;
END $$;

-- ============ Admin user list with kyc (discord fields) ============
DROP FUNCTION IF EXISTS public.admin_list_users_with_kyc();
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discord_username text,
  ADD COLUMN IF NOT EXISTS discord_full_name text;

CREATE OR REPLACE FUNCTION public.admin_list_users_with_kyc()
RETURNS TABLE(id uuid, full_name text, email text, phone text, discord_username text, discord_full_name text,
  avatar_url text, gang_name text, gang_type text, token_balance bigint, is_banned boolean, is_muted boolean,
  is_restricted boolean, vip_tier text, xp bigint, created_at timestamp with time zone, email_confirmed boolean, total_bets bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.email, p.phone, p.discord_username, p.discord_full_name, p.avatar_url,
    p.gang_name, p.gang_type::text, p.token_balance, p.is_banned, p.is_muted, p.is_restricted,
    p.vip_tier, p.xp, p.created_at,
    (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
    COALESCE((SELECT count(*) FROM public.bets b WHERE b.user_id = p.id), 0)::bigint AS total_bets
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  ORDER BY p.created_at DESC
  LIMIT 1000;
$$;

-- ============ Profiles RLS scoping + public_profiles helper ============
DROP POLICY IF EXISTS "profiles readable by all authed" ON public.profiles;
DROP POLICY IF EXISTS "profiles own or admin read" ON public.profiles;
CREATE POLICY "profiles own or admin read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()));

DROP VIEW IF EXISTS public.public_profiles;
CREATE OR REPLACE FUNCTION public.public_profiles(_ids uuid[] DEFAULT NULL)
RETURNS TABLE(id uuid, full_name text, ingame_name text, gang_name text, gang_type text, avatar_url text, vip_tier text, xp bigint, gang_emblem_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.ingame_name, p.gang_name, p.gang_type::text, p.avatar_url, p.vip_tier, p.xp, p.gang_emblem_url
  FROM public.profiles p
  WHERE _ids IS NULL OR p.id = ANY(_ids);
$$;
GRANT EXECUTE ON FUNCTION public.public_profiles(uuid[]) TO anon, authenticated;

-- ============ Friends / broadcasts: tighter RLS ============
DROP POLICY IF EXISTS "broadcasts read authed" ON public.broadcasts;
DROP POLICY IF EXISTS "friends read authed" ON public.friends;
DROP POLICY IF EXISTS "friends own read" ON public.friends;
CREATE POLICY "friends own read" ON public.friends FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR followee_id = auth.uid());

-- ============ Futures contender live-score sync (trigger) ============
CREATE OR REPLACE FUNCTION public.sync_future_contender_scores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  home_player_name text; away_player_name text;
  home_team_name text; away_team_name text;
  home_name text; away_name text;
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
    future_match_side = side_match.side,
    future_live_score = CASE WHEN side_match.side = 'away'
      THEN COALESCE(NEW.away_score,0) || '-' || COALESCE(NEW.home_score,0)
      ELSE COALESCE(NEW.home_score,0) || '-' || COALESCE(NEW.away_score,0) END,
    future_live_opponent = CASE WHEN side_match.side = 'away' THEN home_name ELSE away_name END,
    future_live_outcome = CASE
      WHEN NEW.status::text NOT IN ('ended','completed','settled') THEN 'pending'
      WHEN NEW.winner_team_id IS NOT NULL AND side_match.side = 'away' AND NEW.winner_team_id = NEW.away_team_id THEN 'won'
      WHEN NEW.winner_team_id IS NOT NULL AND side_match.side = 'home' AND NEW.winner_team_id = NEW.home_team_id THEN 'won'
      WHEN NEW.winner_team_id IS NOT NULL THEN 'lost'
      WHEN side_match.side = 'away' AND COALESCE(NEW.away_score,0) > COALESCE(NEW.home_score,0) THEN 'won'
      WHEN side_match.side = 'home' AND COALESCE(NEW.home_score,0) > COALESCE(NEW.away_score,0) THEN 'won'
      WHEN COALESCE(NEW.home_score,0) <> COALESCE(NEW.away_score,0) THEN 'lost'
      ELSE 'pending'
    END,
    updated_at = now()
  FROM public.markets mk
  JOIN public.matches fm ON fm.id = mk.match_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN lower(trim(o.label)) IN (lower(home_player_name), lower(home_team_name)) THEN 'home'
      WHEN lower(trim(o.label)) IN (lower(away_player_name), lower(away_team_name)) THEN 'away'
      ELSE NULL END AS side
  ) side_match
  WHERE o.market_id = mk.id
    AND fm.match_kind = 'future'
    AND fm.is_archived = false
    AND side_match.side IS NOT NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_future_contender_scores() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_future_contender_scores ON public.matches;
CREATE TRIGGER trg_sync_future_contender_scores
AFTER UPDATE OF home_score, away_score, status, winner_team_id ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.sync_future_contender_scores();