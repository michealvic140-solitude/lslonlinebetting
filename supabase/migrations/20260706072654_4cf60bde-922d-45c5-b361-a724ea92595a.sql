CREATE INDEX IF NOT EXISTS idx_matches_virtual_active_batch_time
  ON public.matches (status, virtual_round_batch_id, virtual_round_id, lock_time, start_time)
  WHERE is_virtual = true AND status IN ('scheduled', 'live');

CREATE INDEX IF NOT EXISTS idx_markets_match_id
  ON public.markets (match_id);

CREATE INDEX IF NOT EXISTS idx_odds_market_id
  ON public.odds (market_id);

CREATE INDEX IF NOT EXISTS idx_bet_selections_match_id
  ON public.bet_selections (match_id);

CREATE INDEX IF NOT EXISTS idx_bets_status
  ON public.bets (status);