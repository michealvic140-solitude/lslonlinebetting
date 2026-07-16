
-- ================================================================
-- Upstream sync (July 16) — essential schema only.
-- Function bodies (championship_start/tick, place_championship_bet,
-- start_user_virtual_round, prune_dead_push_subscriptions, etc.)
-- will be applied in a follow-up migration.
-- ================================================================

-- ---------- Enum: add super_admin if missing ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'app_role' AND e.enumlabel = 'super_admin'
    ) THEN
      ALTER TYPE public.app_role ADD VALUE 'super_admin';
    END IF;
  END IF;
END $$;

-- ---------- matches / teams: sport + featured image ----------
ALTER TABLE public.teams   ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'generic';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'generic';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS featured_image_url TEXT;
CREATE INDEX IF NOT EXISTS idx_teams_sport   ON public.teams(sport);
CREATE INDEX IF NOT EXISTS idx_matches_sport ON public.matches(sport);

-- Recreate matches FKs with cascade / set null so team deletion works
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_home_team_id_fkey') THEN
    ALTER TABLE public.matches DROP CONSTRAINT matches_home_team_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_away_team_id_fkey') THEN
    ALTER TABLE public.matches DROP CONSTRAINT matches_away_team_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_winner_team_id_fkey') THEN
    ALTER TABLE public.matches DROP CONSTRAINT matches_winner_team_id_fkey;
  END IF;
END $$;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_home_team_id_fkey   FOREIGN KEY (home_team_id)   REFERENCES public.teams(id) ON DELETE CASCADE,
  ADD CONSTRAINT matches_away_team_id_fkey   FOREIGN KEY (away_team_id)   REFERENCES public.teams(id) ON DELETE CASCADE,
  ADD CONSTRAINT matches_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

-- ---------- tournaments: championship fields ----------
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS current_stage TEXT,
  ADD COLUMN IF NOT EXISTS next_stage_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stage_gap_seconds INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS team_ids UUID[],
  ADD COLUMN IF NOT EXISTS champion_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS runner_up_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_kind_status ON public.tournaments(kind, status);

-- ---------- tournament_matches ----------
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS round_name TEXT,
  ADD COLUMN IF NOT EXISTS slot INT;

-- ---------- championship_bets ----------
CREATE TABLE IF NOT EXISTS public.championship_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- outright | reach_final | reach_semi | reach_quarter | eliminated_at
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stage TEXT,
  tournament_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  stake BIGINT NOT NULL CHECK (stake > 0),
  odds NUMERIC(6,2) NOT NULL DEFAULT 2.00,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost')),
  payout BIGINT NOT NULL DEFAULT 0,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.championship_bets TO authenticated;
GRANT ALL ON public.championship_bets TO service_role;
ALTER TABLE public.championship_bets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own championship bets"   ON public.championship_bets;
DROP POLICY IF EXISTS "Users insert own championship bets" ON public.championship_bets;
CREATE POLICY "Users view own championship bets"
  ON public.championship_bets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own championship bets"
  ON public.championship_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_champ_bets_tournament ON public.championship_bets(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_champ_bets_user       ON public.championship_bets(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_champ_bet_user_tournament
  ON public.championship_bets(user_id, tournament_id, kind, team_id, COALESCE(stage,''), COALESCE(tournament_match_id::text,''));

-- ---------- user_virtual_rounds ----------
CREATE TABLE IF NOT EXISTS public.user_virtual_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_label TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('home','away')),
  stake BIGINT NOT NULL CHECK (stake > 0),
  odds NUMERIC(6,2) NOT NULL DEFAULT 1.90,
  home_kicks BOOLEAN[] NOT NULL,
  away_kicks BOOLEAN[] NOT NULL,
  home_score INT NOT NULL,
  away_score INT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('won','lost')),
  payout BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_virtual_rounds TO authenticated;
GRANT ALL ON public.user_virtual_rounds TO service_role;
ALTER TABLE public.user_virtual_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own virtual rounds" ON public.user_virtual_rounds;
CREATE POLICY "Users view own virtual rounds"
  ON public.user_virtual_rounds FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_vr ON public.user_virtual_rounds(user_id, created_at DESC);

-- ---------- analytics_events ----------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users insert own analytics"  ON public.analytics_events;
DROP POLICY IF EXISTS "Admins read analytics"       ON public.analytics_events;
CREATE POLICY "Users insert own analytics"
  ON public.analytics_events FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Admins read analytics"
  ON public.analytics_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_analytics_events_time ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON public.analytics_events(event_name, created_at DESC);

-- ---------- motivational_content ----------
CREATE TABLE IF NOT EXISTS public.motivational_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'quote',
  title TEXT,
  body TEXT NOT NULL,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.motivational_content TO anon, authenticated;
GRANT ALL   ON public.motivational_content TO service_role;
ALTER TABLE public.motivational_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active motivational"  ON public.motivational_content;
DROP POLICY IF EXISTS "Admins manage motivational"       ON public.motivational_content;
CREATE POLICY "Public read active motivational"
  ON public.motivational_content FOR SELECT USING (active = true);
CREATE POLICY "Admins manage motivational"
  ON public.motivational_content FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- ---------- app_settings: branding + championship + homepage ----------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS platform_name TEXT DEFAULT 'LSL',
  ADD COLUMN IF NOT EXISTS platform_tagline TEXT DEFAULT 'Luxury Sports League',
  ADD COLUMN IF NOT EXISTS platform_description TEXT DEFAULT 'Premium online betting experience.',
  ADD COLUMN IF NOT EXISTS platform_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS platform_logo_auth_url TEXT,
  ADD COLUMN IF NOT EXISTS platform_logo_voucher_url TEXT,
  ADD COLUMN IF NOT EXISTS platform_logo_corner_url TEXT,
  ADD COLUMN IF NOT EXISTS platform_og_image_url TEXT,
  ADD COLUMN IF NOT EXISTS auth_hero_image_url TEXT,
  ADD COLUMN IF NOT EXISTS virtual_championship_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS virtual_championship_football_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS virtual_football_instant_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS virtual_championship_auto_restart BOOLEAN NOT NULL DEFAULT true;

-- ---------- push_subscriptions: unique endpoint (dedupe first) ----------
DELETE FROM public.push_subscriptions a
 USING public.push_subscriptions b
 WHERE a.ctid < b.ctid AND a.endpoint = b.endpoint;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_unique') THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);
  END IF;
END $$;
