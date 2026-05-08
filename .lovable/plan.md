# LSL Platform — 2nd Update Rollout Plan

The request covers ~18 feature areas. Shipping in 5 verified phases keeps each batch testable and avoids regressions in the betting/ token flow.

## Phase 1 — Foundation (DB + shared UI)
**Database migration**
- New `app_role` value: `sponsor`
- New table `promo_code_requests` (user_id, amount, usage_limit, reason, status, generated_code, admin_note) — already exists, verify
- New table `user_tasks` + `user_achievements` (placeholder, "coming soon" friendly)
- New columns on `profiles`: `ingame_name`, `discord_full_name` (Discord username already there)
- RPC `kick_banned_user(uid)` — invalidates session via `auth.sessions` delete (admin-only)

**Shared UI**
- Replace remaining `window.confirm` calls with the existing `useConfirm` glass modal (audit admin.tsx, dashboard, withdraw flows)
- Add `<GlassModal>` premium variant with reason textarea support

## Phase 2 — Bet Slip + Betting UX
- Redesign `BetSlip.tsx`: luxury glass card, gradient header, animated total odds counter, per-selection cards with team logos, sticky payout bar, "max payout cap" badge
- Bet Slip already supports edit/reorder/stake — polish visuals only
- Cash-out gating already correct (winning + ended only) — verify and add "cash out unavailable" hint state

## Phase 3 — User Dashboard Overhaul
- Premium grid of panels: **Bet Slips · Edit Profile · Withdrawal · Deposit (Coming Soon) · Request Tokens · Request Promo Code (sponsor only) · Tasks (Coming Soon) · Achievements (Coming Soon)**
- Each panel = glass card with icon, gradient border, hover lift
- "My Withdrawals" already added — restyle to match new grid
- Sponsor-only promo request form: amount, usage_limit, reason → inserts into `promo_code_requests`

## Phase 4 — Admin Panel Premium Rebuild
- **Analytics tab**: real-time recharts (revenue area chart, bets/day bar chart, active users line) using `token_transactions` + `bets` aggregations; Supabase realtime subscription for live updates
- **Users management**: click row → side drawer with sub-tabs (Profile · Tokens · Roles · Actions · Bet Slips · Transactions · Audit)
- **Ticket Tracker** (new tab): all bets table with filter (open/won/lost/suspended), click → full ticket detail, admin actions: Suspend, Unsuspend, Delete (refund optional), already wired via `admin_suspend_bet`/`admin_delete_bet` RPCs — surface them here
- **Support Tickets** tab: chat-style thread viewer with image preview, status controls (existing table `support_tickets` + `ticket_messages`)
- **Settings**: luxury card layout — sections for Stakes/Payout, Maintenance, Pop-up Ad, Hero, Contact, Terms
- **Live match controls**: edit `home_score`/`away_score` while status=`live`, edit odds (only updates `odds.value`, locked_odds on existing `bet_selections` unchanged), delete featured/main matches
- **Featured matches slider**: admin marks multiple matches `is_featured=true`; home page renders embla carousel auto-sliding every 5s with arrows
- **Categories on home**: bug — verify query joins matches→categories and renders sections; fix filter
- **Admin AI tab**: placeholder "Coming Soon" with elegant locked card

## Phase 5 — Auth + Account
- **Registration**: add fields `ingame_name`, `server` (input), `discord_full_name`; make `discord_username` required; gang/faction conditional input already in place
- **Banned-user kick-out**: add realtime listener on `profiles.is_banned` in `AuthContext`; on flip → `signOut()` + redirect to `/login` with `?banned=1`
- Login page: when `?banned=1`, show glass appeal card with "Submit Appeal" CTA → `/support` ban appeal form (table already exists)

---

## Technical notes
- All client-side route additions go through `src/routes/`, no `routeTree.gen.ts` edits
- Use existing `useConfirm` for confirmations; extend to accept `reason` field
- Realtime: already enabled on key tables; analytics uses postgres_changes channel
- Carousel: use existing `src/components/ui/carousel.tsx` (embla)
- Charts: use existing `src/components/ui/chart.tsx` + recharts (already in deps)

## Out of scope / clarifications needed
- "Deposit (Coming Soon)" — placeholder card only, no payment integration
- Tasks/Achievements — schema + placeholder UI only, no quest engine yet
- Admin AI — placeholder card only

---

## Recommended starting point
Begin with **Phase 1 (DB migration)** so all subsequent phases have the schema they need. After approval I'll run the migration, then ship Phases 2 and 3 together (bet slip + dashboard), then Phase 4 (the largest), then Phase 5.

This is roughly 4–6 large message turns of work. Confirm the plan or tell me which phase to prioritize first if you want to reorder.