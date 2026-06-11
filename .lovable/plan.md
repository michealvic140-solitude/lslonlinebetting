## Scope

Three things in one turn:

1. **Fix participant list in Futures Match Creation** — all gangs/teams/shooters from the Clans admin should appear, not a short subset. Replace the current limited list with a unified, searchable, scrollable picker pulling from `teams` (gangs/factions) + `players` (shooters) + profile-derived gangs.

2. **Label the unlabeled numeric inputs** in the Futures Betting Control card. The three boxes at the top and the three at the bottom currently just show `1 / 100000000 / 1`. Add labels: **Display Order**, **Max Stake (tokens)**, **Min Stake (tokens)** (matching what these fields actually control — confirm by reading admin.tsx first).

3. **Knockout Bracket Tournament** — new feature:
   - DB: `tournaments`, `tournament_participants`, `tournament_matches` (round, slot, p1/p2, scores, winner, parent linkage for auto-advance), plus `background_image_url` on tournament.
   - Admin panel "Tournaments" tab: create tournament (name, opening round size configurable e.g. 26), add participants from Clans, upload background image, per-match Qualify/Lose with score input + confirmation, auto-advance winner to next round slot.
   - Public route `/tournaments/$id` + homepage card: full bracket UI matching the screenshot (Opening Round → R16 → QF → SF → Final + trophy/CHAMPION + format strip at bottom), gold/dark glassmorphism, fits viewport without inner scroll on desktop (horizontal scroll allowed on mobile only — true "no scroll" at 26 players on a phone is not physically possible, will scope to fit-to-width with zoom-out on mobile).
   - Realtime: subscribe to `tournament_matches` so the public bracket updates live.
   - Betting integration: tournament odds tie into existing `odds.future_status` flow — when a participant is marked winner of final, related "Tournament Champion" bets settle.

## Technical notes

- New migration creates the 3 tables with GRANTs + RLS (public read, admin write via `has_role`), enables realtime publication.
- Bracket generator: given N participants, build round 1 with `ceil(N/2)` matches (byes handled), then half each round.
- Auto-advance trigger (DB function) updates next-round match's p1 or p2 based on `slot % 2`.
- Admin upload: reuse existing storage bucket for background image (or accept URL field if no bucket).
- Bracket UI: CSS grid with 5 columns, connector lines via pseudo-elements; trophy SVG/emoji; format strip at bottom.
- Mobile: `transform: scale()` to fit-to-width — keeps "no scroll" requirement.

## Open question

The "no scroll at all" requirement for a 26-player bracket on a 647px-wide mobile viewport will require aggressive scale-down (≈0.25x) which makes text unreadable. I'll implement fit-to-width scaling on mobile with a pinch-zoom hint, and pixel-perfect no-scroll on desktop. If you'd prefer horizontal scroll on mobile instead of tiny text, say so and I'll switch.
