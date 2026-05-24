-- Make sure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any previous schedule with the same name (re-runnable migration)
DO $$
BEGIN
  PERFORM cron.unschedule('virtual-tick-every-minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Tick the virtual engine once per minute
SELECT cron.schedule(
  'virtual-tick-every-minute',
  '* * * * *',
  $$ SELECT public.virtual_tick(); $$
);