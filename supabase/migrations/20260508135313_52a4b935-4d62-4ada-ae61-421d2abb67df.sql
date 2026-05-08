DROP TABLE IF EXISTS public.bets CASCADE;
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.gangs CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.place_bet(uuid, uuid, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.resolve_match(uuid, uuid) CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.match_status CASCADE;
DROP TYPE IF EXISTS public.bet_status CASCADE;

CREATE TYPE public.app_role AS ENUM ('viewer','shooter','gang_leader','registered','moderator','admin');
CREATE TYPE public.gang_type AS ENUM ('G','F');
CREATE TYPE public.match_status AS ENUM ('scheduled','live','ended','cancelled');
CREATE TYPE public.bet_status AS ENUM ('open','won','lost','cashed_out','void');
CREATE TYPE public.chat_room AS ENUM ('general','gang','moderator');
CREATE TYPE public.ticket_status AS ENUM ('open','pending','resolved','closed');
CREATE TYPE public.token_request_status AS ENUM ('pending','approved','denied');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, discord_username TEXT,
  country TEXT, server TEXT DEFAULT 'LOMITA AFR', gang_name TEXT, gang_type public.gang_type,
  avatar_url TEXT, token_balance BIGINT NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT false, ban_reason TEXT,
  is_muted BOOLEAN NOT NULL DEFAULT false, mute_reason TEXT,
  is_restricted BOOLEAN NOT NULL DEFAULT false, restrict_reason TEXT,
  accepted_terms BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;
CREATE OR REPLACE FUNCTION public.is_mod_or_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('moderator','admin'))
$$;
CREATE OR REPLACE FUNCTION public.can_use_gang_chat(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('gang_leader','moderator','admin'))
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, discord_username, country, server, gang_name, gang_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'discord_username',
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'server','LOMITA AFR'),
    NEW.raw_user_meta_data->>'gang_name',
    NULLIF(NEW.raw_user_meta_data->>'gang_type','')::public.gang_type
  );
  IF NEW.email = 'lomitashootersleague@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles readable by all authed" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "admins update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "roles readable by all authed" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.categories (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, icon TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.teams (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, logo_url TEXT, gang_type public.gang_type, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams public read" ON public.teams FOR SELECT USING (true);
CREATE POLICY "admins manage teams" ON public.teams FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.players (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE, name TEXT NOT NULL, avatar_url TEXT, is_substitute BOOLEAN NOT NULL DEFAULT false, position TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players public read" ON public.players FOR SELECT USING (true);
CREATE POLICY "admins manage players" ON public.players FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id),
  home_team_id UUID NOT NULL REFERENCES public.teams(id),
  away_team_id UUID NOT NULL REFERENCES public.teams(id),
  location TEXT, start_time TIMESTAMPTZ NOT NULL,
  status public.match_status NOT NULL DEFAULT 'scheduled',
  home_score INT NOT NULL DEFAULT 0, away_score INT NOT NULL DEFAULT 0,
  winner_team_id UUID REFERENCES public.teams(id),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches public read" ON public.matches FOR SELECT USING (true);
CREATE POLICY "admins manage matches" ON public.matches FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.markets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE, name TEXT NOT NULL, is_open BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "markets public read" ON public.markets FOR SELECT USING (true);
CREATE POLICY "admins manage markets" ON public.markets FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.odds (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE, label TEXT NOT NULL, value NUMERIC(8,2) NOT NULL, is_winner BOOLEAN, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.odds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "odds public read" ON public.odds FOR SELECT USING (true);
CREATE POLICY "admins manage odds" ON public.odds FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tracking_id TEXT NOT NULL UNIQUE DEFAULT ('LSL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  booking_code TEXT NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  stake BIGINT NOT NULL CHECK (stake > 0),
  total_odds NUMERIC(10,2) NOT NULL,
  potential_payout BIGINT NOT NULL CHECK (potential_payout <= 60000000),
  status public.bet_status NOT NULL DEFAULT 'open',
  cashout_amount BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  cashed_out_at TIMESTAMPTZ
);
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own bets" ON public.bets FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "users insert own bets" ON public.bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own open bets" ON public.bets FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status = 'open');
CREATE POLICY "admins manage bets" ON public.bets FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.bet_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id UUID NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  market_id UUID NOT NULL REFERENCES public.markets(id),
  odd_id UUID NOT NULL REFERENCES public.odds(id),
  locked_odds NUMERIC(8,2) NOT NULL,
  selection_label TEXT NOT NULL,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bet_id, match_id)
);
ALTER TABLE public.bet_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "selections via bet ownership" ON public.bet_selections FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bets b WHERE b.id = bet_id AND (b.user_id = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY "users insert selections" ON public.bet_selections FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.bets b WHERE b.id = bet_id AND b.user_id = auth.uid()));
CREATE POLICY "admins manage selections" ON public.bet_selections FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room public.chat_room NOT NULL,
  content TEXT, image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat readable" ON public.chat_messages FOR SELECT TO authenticated USING (
  room = 'general' OR (room = 'gang' AND public.can_use_gang_chat(auth.uid())) OR (room = 'moderator' AND public.is_mod_or_admin(auth.uid()))
);
CREATE POLICY "users post if not muted" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.is_muted OR p.is_banned))
  AND (room = 'general' OR (room = 'gang' AND public.can_use_gang_chat(auth.uid())) OR (room = 'moderator' AND public.is_mod_or_admin(auth.uid())))
);
CREATE POLICY "mods delete chat" ON public.chat_messages FOR DELETE TO authenticated USING (public.is_mod_or_admin(auth.uid()));

CREATE TABLE public.announcements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, body TEXT, image_url TEXT, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements public read" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "admins manage announcements" ON public.announcements FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.highlights (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, media_url TEXT NOT NULL, media_type TEXT NOT NULL DEFAULT 'image', is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "highlights public read" ON public.highlights FOR SELECT USING (true);
CREATE POLICY "admins manage highlights" ON public.highlights FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.advertisements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, image_url TEXT, link_url TEXT, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ads public read" ON public.advertisements FOR SELECT USING (true);
CREATE POLICY "admins manage ads" ON public.advertisements FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT, link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins manage notifications" ON public.notifications FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, amount BIGINT NOT NULL,
  usage_limit INT NOT NULL DEFAULT 1, used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promos read by authed" ON public.promo_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage promos" ON public.promo_codes FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(promo_id, user_id)
);
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own redemptions" ON public.promo_redemptions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "users insert own redemptions" ON public.promo_redemptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_mod_or_admin(auth.uid()));
CREATE POLICY "users create tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mods update tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (public.is_mod_or_admin(auth.uid()) OR auth.uid() = user_id);
CREATE POLICY "mods delete tickets" ON public.support_tickets FOR DELETE TO authenticated USING (public.is_mod_or_admin(auth.uid()));

CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT, image_url TEXT,
  is_ai BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket msgs via ownership" ON public.ticket_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.is_mod_or_admin(auth.uid()))));
CREATE POLICY "ticket msgs insert" ON public.ticket_messages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.is_mod_or_admin(auth.uid()))));
CREATE POLICY "mods delete ticket messages" ON public.ticket_messages FOR DELETE TO authenticated USING (public.is_mod_or_admin(auth.uid()));

CREATE TABLE public.token_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  proof_image_url TEXT, note TEXT,
  status public.token_request_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id), review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ
);
ALTER TABLE public.token_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own requests" ON public.token_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "users create requests" ON public.token_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins update requests" ON public.token_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, target_type TEXT, target_id TEXT,
  metadata JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "authed insert logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  maintenance_message TEXT DEFAULT 'We are currently performing maintenance. Please check back soon.',
  terms_content TEXT DEFAULT '',
  contact_email TEXT DEFAULT 'lomitashootersleague@gmail.com',
  contact_phone TEXT, contact_whatsapp TEXT,
  about_us TEXT, why_trust_us TEXT,
  hero_tagline TEXT DEFAULT 'Season 4 · Live',
  popup_ad_active BOOLEAN NOT NULL DEFAULT false,
  popup_ad_image TEXT, popup_ad_text TEXT, popup_ad_link TEXT,
  popup_ad_size TEXT NOT NULL DEFAULT 'large',
  min_stake BIGINT NOT NULL DEFAULT 2000000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "admins update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins insert settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.app_settings (id) VALUES (1);

CREATE TABLE public.token_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  kind text NOT NULL, description text, metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_user ON public.token_transactions(user_id, created_at DESC);
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own tx" ON public.token_transactions FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "admins insert tx" ON public.token_transactions FOR INSERT WITH CHECK (public.is_admin(auth.uid()) OR auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.log_token_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE diff bigint;
BEGIN
  diff := COALESCE(NEW.token_balance,0) - COALESCE(OLD.token_balance,0);
  IF diff <> 0 THEN
    INSERT INTO public.token_transactions(user_id, amount, balance_after, kind, description)
    VALUES (NEW.id, diff, NEW.token_balance, 'balance_change', CASE WHEN diff > 0 THEN 'Credit' ELSE 'Debit' END);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_log_token AFTER UPDATE OF token_balance ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.log_token_change();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_matches_updated BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_tickets_updated BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars','avatars',true),('chat-images','chat-images',true),('team-logos','team-logos',true),
  ('player-avatars','player-avatars',true),('announcements','announcements',true),
  ('highlights','highlights',true),('ads','ads',true),
  ('ticket-uploads','ticket-uploads',true),('token-proofs','token-proofs',true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read all buckets" ON storage.objects;
CREATE POLICY "public read all buckets" ON storage.objects FOR SELECT USING (true);
DROP POLICY IF EXISTS "authed upload buckets" ON storage.objects;
CREATE POLICY "authed upload buckets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('avatars','chat-images','team-logos','player-avatars','announcements','highlights','ads','ticket-uploads','token-proofs'));
DROP POLICY IF EXISTS "users update own files" ON storage.objects;
CREATE POLICY "users update own files" ON storage.objects FOR UPDATE TO authenticated USING (auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "users delete own files" ON storage.objects;
CREATE POLICY "users delete own files" ON storage.objects FOR DELETE TO authenticated USING (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.wipe_all_tokens()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only admins can wipe all tokens'; END IF;
  UPDATE public.profiles SET token_balance = 0 WHERE token_balance > 0;
  INSERT INTO public.audit_logs(actor_id, action, target_type, metadata)
  VALUES (auth.uid(), 'emergency_wipe_all_tokens', 'system', '{}'::jsonb);
END $$;

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, description text, banner_url text,
  starts_at timestamptz, ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events readable" ON public.events FOR SELECT USING (true);
CREATE POLICY "events admin write" ON public.events FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.ban_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE public.ban_appeals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appeals own select" ON public.ban_appeals FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "appeals own insert" ON public.ban_appeals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "appeals admin update" ON public.ban_appeals FOR UPDATE USING (public.is_admin(auth.uid()));

CREATE TYPE public.withdrawal_status AS ENUM ('pending','approved','declined');

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ingame_name text NOT NULL, gang_name text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  ticket_ref text,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  admin_note text, reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own withdrawals" ON public.withdrawal_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users view own withdrawals" ON public.withdrawal_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "admins update withdrawals" ON public.withdrawal_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins delete withdrawals" ON public.withdrawal_requests FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.leaderboard_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('gang','shooter')),
  name text NOT NULL, top_player text,
  wins int NOT NULL DEFAULT 0, losses int NOT NULL DEFAULT 0,
  draws int NOT NULL DEFAULT 0, played int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0, manual_rank int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leaderboard_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaderboard public read" ON public.leaderboard_overrides FOR SELECT USING (true);
CREATE POLICY "leaderboard admin write" ON public.leaderboard_overrides FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.create_withdrawal_request(
  _amount bigint, _ingame text, _gang text, _ticket text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); bal bigint; req_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  SELECT token_balance INTO bal FROM profiles WHERE id = uid FOR UPDATE;
  IF bal IS NULL OR bal < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE profiles SET token_balance = token_balance - _amount WHERE id = uid;
  INSERT INTO withdrawal_requests(user_id, ingame_name, gang_name, amount, ticket_ref)
    VALUES (uid, _ingame, _gang, _amount, _ticket) RETURNING id INTO req_id;
  INSERT INTO notifications(user_id, title, body)
    VALUES (uid, 'Withdrawal requested', 'Your request for '||_amount||' tokens has been submitted.');
  RETURN req_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_withdrawal_request(
  _id uuid, _approve boolean, _note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO r FROM withdrawal_requests WHERE id = _id FOR UPDATE;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  IF _approve THEN
    UPDATE withdrawal_requests SET status='approved', admin_note=_note, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=_id;
    INSERT INTO notifications(user_id, title, body)
      VALUES (r.user_id, 'Withdrawal approved', COALESCE(_note,'Your withdrawal of '||r.amount||' tokens has been approved. You will receive payout instructions shortly.'));
  ELSE
    UPDATE profiles SET token_balance = token_balance + r.amount WHERE id = r.user_id;
    UPDATE withdrawal_requests SET status='declined', admin_note=_note, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=_id;
    INSERT INTO notifications(user_id, title, body)
      VALUES (r.user_id, 'Withdrawal declined', COALESCE(_note,'Your withdrawal was declined. Tokens have been refunded.'));
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'matches','odds','markets','chat_messages','ticket_messages','notifications',
    'support_tickets','bets','bet_selections','profiles','advertisements','highlights',
    'announcements','events','token_requests','token_transactions','app_settings',
    'ban_appeals','withdrawal_requests'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sponsor';
ALTER TYPE public.bet_status ADD VALUE IF NOT EXISTS 'suspended';

CREATE OR REPLACE FUNCTION public.enforce_one_open_bet_per_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; existing_count int;
BEGIN
  IF NEW.match_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO uid FROM public.bets WHERE id = NEW.bet_id;
  IF uid IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO existing_count
  FROM public.bet_selections bs
  JOIN public.bets b ON b.id = bs.bet_id
  WHERE bs.match_id = NEW.match_id
    AND b.user_id = uid
    AND b.status IN ('open','suspended')
    AND bs.bet_id <> NEW.bet_id;
  IF existing_count > 0 THEN
    RAISE EXCEPTION 'You already have an active ticket on this match. Each match can only be staked once until it settles.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_one_open_bet_per_match ON public.bet_selections;
CREATE TRIGGER trg_one_open_bet_per_match AFTER INSERT ON public.bet_selections FOR EACH ROW EXECUTE FUNCTION public.enforce_one_open_bet_per_match();

CREATE TABLE IF NOT EXISTS public.promo_code_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  usage_limit integer NOT NULL DEFAULT 1 CHECK (usage_limit > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  generated_code text, promo_id uuid, admin_note text,
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.promo_code_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sponsors create own requests" ON public.promo_code_requests;
CREATE POLICY "sponsors create own requests" ON public.promo_code_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'sponsor'));
DROP POLICY IF EXISTS "users see own promo requests" ON public.promo_code_requests;
CREATE POLICY "users see own promo requests" ON public.promo_code_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins update promo requests" ON public.promo_code_requests;
CREATE POLICY "admins update promo requests" ON public.promo_code_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins delete promo requests" ON public.promo_code_requests;
CREATE POLICY "admins delete promo requests" ON public.promo_code_requests FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.approve_promo_request(_id uuid, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; new_code text; new_promo uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO r FROM public.promo_code_requests WHERE id = _id FOR UPDATE;
  IF r IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  new_code := 'LSL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.promo_codes(code, amount, usage_limit, used_count, is_active, created_by)
    VALUES (new_code, r.amount, r.usage_limit, 0, true, auth.uid()) RETURNING id INTO new_promo;
  UPDATE public.promo_code_requests SET status='approved', generated_code=new_code, promo_id=new_promo, admin_note=_note, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=_id;
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (r.user_id, 'Promo code approved', 'Your promo code request was approved. Code: '||new_code||' · '||r.amount||' tokens · '||r.usage_limit||' uses.', '/dashboard');
  RETURN new_promo;
END $$;

CREATE OR REPLACE FUNCTION public.decline_promo_request(_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO r FROM public.promo_code_requests WHERE id = _id FOR UPDATE;
  IF r IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  UPDATE public.promo_code_requests SET status='declined', admin_note=_note, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=_id;
  INSERT INTO public.notifications(user_id, title, body)
    VALUES (r.user_id, 'Promo code request declined', COALESCE(_note,'Your promo code request was declined.'));
END $$;

CREATE OR REPLACE FUNCTION public.admin_suspend_bet(_bet_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO b FROM public.bets WHERE id=_bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Bet not found'; END IF;
  UPDATE public.bets SET status='suspended' WHERE id=_bet_id;
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (b.user_id, 'Ticket suspended', COALESCE(_reason,'Your bet ticket has been suspended by an admin.'), '/ticket/'||_bet_id);
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'suspend_bet', 'bet', _bet_id::text, jsonb_build_object('reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_bet(_bet_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.bets SET status='open' WHERE id=_bet_id AND status='suspended';
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id)
    VALUES (auth.uid(), 'unsuspend_bet', 'bet', _bet_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_bet(_bet_id uuid, _refund boolean DEFAULT false, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO b FROM public.bets WHERE id=_bet_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF _refund THEN
    UPDATE public.profiles SET token_balance = token_balance + b.stake WHERE id = b.user_id;
  END IF;
  DELETE FROM public.bet_selections WHERE bet_id = _bet_id;
  DELETE FROM public.bets WHERE id = _bet_id;
  INSERT INTO public.notifications(user_id, title, body)
    VALUES (b.user_id, 'Ticket removed', COALESCE(_reason,'Your bet ticket has been removed by an admin.') || CASE WHEN _refund THEN ' Stake refunded.' ELSE '' END);
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'delete_bet', 'bet', _bet_id::text, jsonb_build_object('reason', _reason, 'refunded', _refund, 'stake', b.stake));
END $$;