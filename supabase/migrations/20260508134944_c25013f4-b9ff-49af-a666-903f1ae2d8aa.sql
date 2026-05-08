-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.match_status AS ENUM ('open', 'live', 'closed', 'resolved', 'cancelled');
CREATE TYPE public.bet_status AS ENUM ('pending', 'won', 'lost', 'refunded');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  coins BIGINT NOT NULL DEFAULT 1000,
  total_won BIGINT NOT NULL DEFAULT 0,
  total_wagered BIGINT NOT NULL DEFAULT 0,
  bets_won INT NOT NULL DEFAULT 0,
  bets_lost INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.gangs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL, tag TEXT NOT NULL, description TEXT,
  color TEXT NOT NULL DEFAULT '#ef4444', logo_url TEXT,
  wins INT NOT NULL DEFAULT 0, losses INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gangs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, description TEXT,
  gang_a_id UUID NOT NULL REFERENCES public.gangs(id),
  gang_b_id UUID NOT NULL REFERENCES public.gangs(id),
  status match_status NOT NULL DEFAULT 'open',
  winner_gang_id UUID REFERENCES public.gangs(id),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  pool_a BIGINT NOT NULL DEFAULT 0, pool_b BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (gang_a_id <> gang_b_id)
);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  gang_id UUID NOT NULL REFERENCES public.gangs(id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  status bet_status NOT NULL DEFAULT 'pending',
  payout BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE INDEX bets_match_idx ON public.bets(match_id);
CREATE INDEX bets_user_idx ON public.bets(user_id);

CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX comments_match_idx ON public.comments(match_id);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL, kind TEXT NOT NULL, description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles readable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "gangs readable" ON public.gangs FOR SELECT USING (true);
CREATE POLICY "admins manage gangs" ON public.gangs FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "matches readable" ON public.matches FOR SELECT USING (true);
CREATE POLICY "admins manage matches" ON public.matches FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "bets readable" ON public.bets FOR SELECT USING (true);
CREATE POLICY "users insert own bets" ON public.bets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments readable" ON public.comments FOR SELECT USING (true);
CREATE POLICY "auth users comment" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users see own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '_' || substr(NEW.id::text, 1, 4);
  END IF;
  INSERT INTO public.profiles (id, username, coins) VALUES (NEW.id, uname, 1000);
  IF NEW.email = 'lomitashootersleague@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;
  INSERT INTO public.transactions (user_id, amount, kind, description) VALUES (NEW.id, 1000, 'signup_bonus', 'Welcome bonus');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.place_bet(_match_id UUID, _gang_id UUID, _amount BIGINT)
RETURNS public.bets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user UUID := auth.uid(); _match public.matches; _bet public.bets; _balance BIGINT;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  SELECT * INTO _match FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _match.status NOT IN ('open','live') THEN RAISE EXCEPTION 'Betting closed'; END IF;
  IF _gang_id NOT IN (_match.gang_a_id, _match.gang_b_id) THEN RAISE EXCEPTION 'Invalid gang'; END IF;
  SELECT coins INTO _balance FROM public.profiles WHERE id = _user FOR UPDATE;
  IF _balance < _amount THEN RAISE EXCEPTION 'Insufficient coins'; END IF;
  UPDATE public.profiles SET coins = coins - _amount, total_wagered = total_wagered + _amount WHERE id = _user;
  IF _gang_id = _match.gang_a_id THEN
    UPDATE public.matches SET pool_a = pool_a + _amount WHERE id = _match_id;
  ELSE
    UPDATE public.matches SET pool_b = pool_b + _amount WHERE id = _match_id;
  END IF;
  INSERT INTO public.bets (user_id, match_id, gang_id, amount) VALUES (_user, _match_id, _gang_id, _amount) RETURNING * INTO _bet;
  INSERT INTO public.transactions (user_id, amount, kind, description) VALUES (_user, -_amount, 'bet_placed', 'Bet on match ' || _match_id);
  RETURN _bet;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_match(_match_id UUID, _winner_gang_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _match public.matches; _total_pool BIGINT; _winning_pool BIGINT; _bet RECORD; _payout BIGINT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO _match FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _match.status = 'resolved' THEN RAISE EXCEPTION 'Already resolved'; END IF;
  IF _winner_gang_id NOT IN (_match.gang_a_id, _match.gang_b_id) THEN RAISE EXCEPTION 'Invalid winner'; END IF;
  _total_pool := _match.pool_a + _match.pool_b;
  _winning_pool := CASE WHEN _winner_gang_id = _match.gang_a_id THEN _match.pool_a ELSE _match.pool_b END;
  FOR _bet IN SELECT * FROM public.bets WHERE match_id = _match_id LOOP
    IF _bet.gang_id = _winner_gang_id AND _winning_pool > 0 THEN
      _payout := (_bet.amount::NUMERIC * _total_pool / _winning_pool)::BIGINT;
      UPDATE public.bets SET status = 'won', payout = _payout WHERE id = _bet.id;
      UPDATE public.profiles SET coins = coins + _payout, total_won = total_won + _payout, bets_won = bets_won + 1 WHERE id = _bet.user_id;
      INSERT INTO public.transactions (user_id, amount, kind, description) VALUES (_bet.user_id, _payout, 'bet_won', 'Won bet ' || _bet.id);
    ELSE
      UPDATE public.bets SET status = 'lost', payout = 0 WHERE id = _bet.id;
      UPDATE public.profiles SET bets_lost = bets_lost + 1 WHERE id = _bet.user_id;
    END IF;
  END LOOP;
  IF _winning_pool = 0 AND _total_pool > 0 THEN
    FOR _bet IN SELECT * FROM public.bets WHERE match_id = _match_id LOOP
      UPDATE public.bets SET status = 'refunded', payout = _bet.amount WHERE id = _bet.id;
      UPDATE public.profiles SET coins = coins + _bet.amount WHERE id = _bet.user_id;
      INSERT INTO public.transactions (user_id, amount, kind, description) VALUES (_bet.user_id, _bet.amount, 'bet_refunded', 'Refund bet ' || _bet.id);
    END LOOP;
  END IF;
  UPDATE public.matches SET status = 'resolved', winner_gang_id = _winner_gang_id, resolved_at = now() WHERE id = _match_id;
  UPDATE public.gangs SET wins = wins + 1 WHERE id = _winner_gang_id;
  UPDATE public.gangs SET losses = losses + 1 WHERE id = CASE WHEN _winner_gang_id = _match.gang_a_id THEN _match.gang_b_id ELSE _match.gang_a_id END;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.place_bet(UUID, UUID, BIGINT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_match(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bet(UUID, UUID, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_match(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;