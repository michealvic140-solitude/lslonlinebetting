
-- 1. Attach sensitive-field protection triggers (functions exist but were never attached)
DROP TRIGGER IF EXISTS trg_protect_profile_sensitive ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

DROP TRIGGER IF EXISTS trg_protect_bet_sensitive ON public.bets;
CREATE TRIGGER trg_protect_bet_sensitive
  BEFORE UPDATE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.protect_bet_sensitive_fields();

-- Token balance change logger
DROP TRIGGER IF EXISTS trg_log_token_change ON public.profiles;
CREATE TRIGGER trg_log_token_change
  AFTER UPDATE OF token_balance ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_token_change();

-- 2. Audit logs: remove user forgery vector. Only SECURITY DEFINER functions can write.
DROP POLICY IF EXISTS "authed insert logs" ON public.audit_logs;

-- 3. Token transactions: ensure no user insert path. Replace admin-only with definer-only.
DROP POLICY IF EXISTS "admins insert tx" ON public.token_transactions;
-- (No INSERT policy = only SECURITY DEFINER functions can write, which is the intent.)

-- 4. Promo redemptions: remove direct user insert; redeem_promo_code RPC handles it atomically.
DROP POLICY IF EXISTS "users insert own redemptions" ON public.promo_redemptions;

-- 5. user_challenge_progress: ensure no permissive user write policies exist.
DROP POLICY IF EXISTS "ucp own insert" ON public.user_challenge_progress;
DROP POLICY IF EXISTS "ucp own update" ON public.user_challenge_progress;
DROP POLICY IF EXISTS "users insert own progress" ON public.user_challenge_progress;
DROP POLICY IF EXISTS "users update own progress" ON public.user_challenge_progress;

-- 6. Storage: lock private buckets to owner-scoped folder paths
DROP POLICY IF EXISTS "authed upload buckets" ON storage.objects;
DROP POLICY IF EXISTS "authed read private buckets" ON storage.objects;
DROP POLICY IF EXISTS "users upload own private files" ON storage.objects;
DROP POLICY IF EXISTS "users read own private files" ON storage.objects;
DROP POLICY IF EXISTS "users delete own private files" ON storage.objects;
DROP POLICY IF EXISTS "admins manage private files" ON storage.objects;

CREATE POLICY "users upload own private files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('ticket-uploads','token-proofs')
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "users read own private files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('ticket-uploads','token-proofs')
    AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid()))
  );

CREATE POLICY "users delete own private files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('ticket-uploads','token-proofs')
    AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid()))
  );

CREATE POLICY "admins manage private files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('ticket-uploads','token-proofs') AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id IN ('ticket-uploads','token-proofs') AND public.is_admin(auth.uid()));
