CREATE OR REPLACE FUNCTION public._lsl_bootstrap_exec(_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE _sql;
END $$;
REVOKE ALL ON FUNCTION public._lsl_bootstrap_exec(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._lsl_bootstrap_exec(text) TO sandbox_exec;