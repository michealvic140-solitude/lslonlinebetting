
-- 1) Profiles: block users from modifying sensitive fields on their own profile
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
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
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- 2) Bets: block users from changing financial/status fields on their own open bets
CREATE OR REPLACE FUNCTION public.protect_bet_sensitive_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.stake := OLD.stake;
  NEW.total_odds := OLD.total_odds;
  NEW.potential_payout := OLD.potential_payout;
  NEW.status := OLD.status;
  NEW.cashout_amount := OLD.cashout_amount;
  NEW.cashed_out_at := OLD.cashed_out_at;
  NEW.settled_at := OLD.settled_at;
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_bet_sensitive ON public.bets;
CREATE TRIGGER trg_protect_bet_sensitive
  BEFORE UPDATE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.protect_bet_sensitive_fields();

-- 3) token_transactions: remove user-direct insert
DROP POLICY IF EXISTS "admins insert tx" ON public.token_transactions;
CREATE POLICY "admins insert tx" ON public.token_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- 4) audit_logs: actor_id must equal caller
DROP POLICY IF EXISTS "authed insert logs" ON public.audit_logs;
CREATE POLICY "authed insert logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- 5) user_challenge_progress: drop user write/update policies (server-only via SECURITY DEFINER)
DROP POLICY IF EXISTS "ucp own write" ON public.user_challenge_progress;
DROP POLICY IF EXISTS "ucp own update" ON public.user_challenge_progress;
DROP POLICY IF EXISTS "ucp own insert" ON public.user_challenge_progress;

-- 6) promo_codes: restrict select to codes targeted at the user (or untargeted active codes are still hidden — lookup goes via redemption RPC)
DROP POLICY IF EXISTS "promos read by authed" ON public.promo_codes;
CREATE POLICY "promos read by targeted user" ON public.promo_codes
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (target_user_ids IS NOT NULL AND auth.uid() = ANY(target_user_ids))
  );

-- 7) Storage: make sensitive buckets private and add owner/admin policies
UPDATE storage.buckets SET public = false WHERE id IN ('token-proofs','ticket-uploads');

DROP POLICY IF EXISTS "public read all buckets" ON storage.objects;

-- Re-create permissive public read for known public buckets only
CREATE POLICY "public read public buckets" ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('avatars','chat-images','team-logos','player-avatars','announcements','highlights','ads','gang-emblems','profile-banners','event-banners','season-banners','popup-ads'));

CREATE POLICY "private read token-proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'token-proofs'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid()))
  );

CREATE POLICY "private read ticket-uploads" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-uploads'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_mod_or_admin(auth.uid()))
  );
