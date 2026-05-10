DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'users read own audit logs'
  ) THEN
    CREATE POLICY "users read own audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (actor_id = auth.uid() OR target_id = auth.uid()::text);
  END IF;
END $$;