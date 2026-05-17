# Full platform update from `betting-bliss` reference repo

After a deep diff against `michealvic140-solitude/betting-bliss`, only its 5th migration (watchlist + profile customization) is brand-new SQL — but its **app code references a much larger backend** (referrals, VIP/XP, push notifications, live activity, broadcasts, gang emblems, risk/P&L dashboards, AI copilot, daily-spin and token-gift rules, friend system, watchlist). To "make sure everything is up to date" I need to port both the missing schema *and* the matching app surfaces.

## What's new in the reference (currently missing here)

**Routes**
- `src/routes/settings.tsx` — push notification & account hub
- `src/routes/watchlist.tsx` — saved matches / teams / players

**Components**
- `src/components/UserHubSections.tsx` (~740 lines): `ReferralCard`, `VipCard`, `PushNotifSettings`, `UserAnalyticsDashboard`, `BetHistoryAdvanced`, `GangEmblemUpload`
- `src/components/WatchlistStar.tsx` — toggleable ★ widget for any match/team/player
- `src/components/admin/AdminExtensions.tsx` (~880 lines): `StreakAndPushPanel`, `RiskPanel`, `PnLPanel`, `TokenRulesPanel`, `BroadcastPanel`, `ActivityPanel`, `ReportsPanel`, `AdminAILivePanel`, `ReferralsAdminPanel`, `EmblemModerationPanel`, `VipAdminPanel`

**Server**
- `src/routes/api/public/hooks/send-push.ts` — Web Push delivery (uses `web-push`)
- `src/lib/admin-ai.functions.ts` — server fn calling Lovable AI gateway, grounded with live platform snapshot

**Static**
- `public/sw.js` — service worker for push notifications

**Admin tabs added**: tokenrules, broadcast, activity, reports, adminai, risk, pnl, streakpush, referrals, emblems, vip

## Database changes required

Single new migration that adds everything the reference code expects:

### New tables
- `watchlist` (already specified in ref migration 5)
- `referrals` (referrer_id, referee_id, referrer_bonus, referee_bonus, created_at)
- `notification_prefs` (user_id PK, push_enabled + per-channel booleans for match_starting, bet_results, rewards, daily_streak, referrals, vip_tier_up, withdrawals, promotions, chat_mentions, ticket_replies)
- `push_subscriptions` (user_id, endpoint UNIQUE, p256dh, auth_key, user_agent, enabled)
- `user_sessions` (user_id, last_seen, route, user_agent) — for live activity
- `broadcasts` (title, body, link, segment, sent_count, created_by, created_at)
- `gang_emblems` (user_id, image_url, status pending/approved/declined, reviewed_by, reviewed_at)
- `friends` / follow edges (follower_id, followee_id, created_at)
- `spins` (user_id, amount, created_at) and `gifts` (sender_id, recipient_id, amount, fee, created_at) for cooldown/limit tracking

### `profiles` column additions
`referral_code` (text UNIQUE, auto-gen on insert), `referred_by` uuid, `xp` bigint, `vip_tier` text, `gang_emblem_url`, `emblem_status`, `chat_color`, `profile_banner_url`, `profile_title`, `showcase_achievement_ids uuid[]`.

### `app_settings` column additions
VAPID: `vapid_public_key`, `vapid_subject`, `push_endpoint_url`.
Daily login: `daily_login_enabled`, `daily_login_base_reward`, `daily_login_bonus_per_day`, `daily_login_max_streak`.
XP rules: `xp_per_bet`, `xp_per_win`, `xp_per_login`, `xp_per_referral`.
Referrals: `referral_bonus_referrer`, `referral_bonus_referee`.
VIP: `vip_token_multipliers jsonb`, `challenge_reward_multiplier numeric`.
Spin: `spin_enabled`, `spin_min_reward`, `spin_max_reward`, `spin_cooldown_hours`.
Gifts: `gift_enabled`, `gift_daily_limit`, `gift_min_amount`, `gift_max_per_tx`, `gift_fee_pct`.
Friends/AI/limits: `friends_enabled`, `admin_ai_enabled`, `admin_ai_model`, `exposure_warn_pct`, `house_low_balance`, `min_selections_per_ticket`, `max_selections_per_ticket`.

### New RPCs (SECURITY DEFINER)
`apply_referral_code(_code)`, `verify_xp_consistency(_user_id)`, `admin_risk_summary()`, `admin_exposure_per_match()`, `admin_pnl_summary(_days)`, `admin_broadcast(_title,_body,_link,_segment)`. All admin RPCs gated by `is_admin(auth.uid())`.

### Triggers
- Auto-generate `profiles.referral_code` on insert.
- On bet placed/won → add XP, recompute `vip_tier`.
- On `notifications` insert → optional HTTP post to `app_settings.push_endpoint_url` (best-effort, ignore failure).

RLS on every new table — user-owned where applicable, admin-managed for broadcasts/emblems/sessions.

## Dependencies
- `bun add web-push` (used only inside `/api/public/hooks/send-push.ts`).

## Wiring
- Extend `Profile` type in `src/contexts/AuthContext.tsx` with the new optional fields.
- Mount `WatchlistStar` on match cards, team rows, and player avatars.
- Add `/settings` and `/watchlist` to the side/bottom nav in `Layout.tsx`.
- Register service worker once from `Layout` (or root) if `'serviceWorker' in navigator`.
- Slot the new admin panels into `src/routes/admin.tsx` as additional tabs.
- Add a tiny ping helper that POSTs to `user_sessions` upsert on route change so `ActivityPanel` has data.

## Implementation order

1. Migration (tables + columns + RPCs + triggers + RLS) → wait for approval.
2. `bun add web-push`; copy `public/sw.js`.
3. Drop in the new component/route files verbatim from the reference, then adjust imports if any local path differs.
4. Update `AuthContext` profile type + nav links + service-worker registration.
5. Wire the new admin tabs.
6. Manual smoke test: open /settings, /watchlist, each new admin tab; check console for RPC/column 404s and patch any gaps.
7. Run the security linter and fix any new warnings introduced by the migration.

## Out of scope (call out explicitly)
- I will NOT add real VAPID keys — admin must paste them in the new Streak/Push panel, and set `VAPID_PRIVATE_KEY` as a secret.
- I will NOT enable the AI copilot button until `LOVABLE_API_KEY` is confirmed present (it already is in this project's secret list).
- Existing features (ticket UI, promo codes, hot bets, seasons, challenges) stay untouched — this is purely additive.
