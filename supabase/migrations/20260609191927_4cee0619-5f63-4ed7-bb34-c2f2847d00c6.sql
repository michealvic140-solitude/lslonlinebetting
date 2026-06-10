DO $$
BEGIN
  RAISE NOTICE 'current_user=%, session_user=%', current_user, session_user;
END $$;