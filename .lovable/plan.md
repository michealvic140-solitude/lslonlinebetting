## Scope

Rebuild the Super Admin Console (`src/routes/admin.tsx`) layout to match the reference mockup, plus rebuild the Users admin panel, add a brand-new Clans panel (Gangs / Teams / Players CRUD), add a Top Bets leaderboard, generate a themed header background image, and reduce transparency across console surfaces.

---

## 1. Themed header image

- Generate `src/assets/console-header-bg.jpg` (premium tier, 1920×512, dark green Lomita "command center" with masked shooter silhouette) via imagegen.
- Upload via `lovable-assets create` → write `console-header-bg.jpg.asset.json`, remove the raw jpg.
- Use as `background-image` of the existing "Super Admin Console" header card with a dark gradient overlay so the title row stays readable.

## 2. Console overview layout pass

Edit `src/routes/admin.tsx` overview tab only (tabs/routes untouched):

```
[ header card with bg image ]
[ stat row 1: Online / Game Worlds / Pending Requests / Total Volume / Open Reports ]
[ stat row 2: Tickets Today / Total Requests / Withdrawals / Player Requests / Ban Appeals ]
[ Volume chart (14d) | New users per day chart ]
[ small stat tiles row: Total Users / Banned / Tokens Circ / Today Bets / Won Bets ]
[ Recent Activity | Live Gang Wars / Event Countdown | Highlights Hub ]
[ Broadcast Center | Quick Actions | TOP BETS (new) ]
[ tile grid: Virtual / Battle / Challenges / Alliances / Leaderboards / CLANS (new) ]
```

All wrapper cards switch from `bg-card/40 backdrop-blur` style to `bg-card/85` (or solid `bg-card`) with subtle border — "thicker, less transparent" per request.

## 3. Users panel rebuild

Edit existing Users admin section (component inside `admin.tsx` or extracted file):

- Top summary bar: Total / Active / KYC / Suspended / Frozen / Joined (date range).
- Filters row: search input, role select, status select, sort select, Export CSV button.
- View toggle: grid (3 columns @ desktop, 2 @ md, 1 @ sm) / list. Vertical scroll container `max-h-[80vh] overflow-y-auto`.
- User card: avatar tag (U1, U2…), name + status badge, email, phone, badges row (Verified / KYC / VIP / Frozen / Suspended), stats row (Balance, Total bets, Joined), gold "Manage Profile" button.
- **KYC rule**: Verified iff `auth.users.email_confirmed_at IS NOT NULL`. Implemented as a new SECURITY DEFINER RPC `admin_list_users_with_kyc()` returning each profile joined to `email_confirmed_at`. RLS-gated by `has_role(auth.uid(),'admin')`.
- Manage Profile dialog: tabs Profile / Tokens / Roles / Actions / History matching mockup — reuse existing user-edit logic where possible.

## 4. Clans panel (NEW)

New file `src/components/admin/ClansAdminPanel.tsx`, rendered when sidebar `clans` tab is active. Add `clans` entry to `AdminSidebar` (icon: Shield).

- Tabs: Gangs | Teams | Players.
- Each tab: list + "Create" button + edit/delete actions. Uses existing tables (`teams`, `players`, `profiles.gang_name`).
- Gangs tab manages distinct `gang_name` + `gang_type` values across `profiles` (or new lightweight `gangs` table if needed — check schema first; prefer no new table).
- Teams tab: full CRUD on `public.teams`.
- Players tab: full CRUD on `public.players` (link to team).
- Seed a tile image `tile-clans.jpg` via imagegen + `lovable-assets`, add a Clans tile in the bottom tile grid replacing nothing (added as 6th tile).

No changes to match-creation flow — it already selects from `teams`/`players`.

## 5. Top Bets panel (NEW)

New component `src/components/admin/TopBetsPanel.tsx`. Replaces the spot where "Top Players" sits in the mockup, but the existing **Users** panel/section stays. Combined score = `SUM(won) + SUM(stake)` per user across `bets`. Scrollable `max-h-[420px]`. Realtime-refresh on `bets` changes (same pattern as `GrandPrizeWinners`).

## 6. Migration

One migration:
- `CREATE OR REPLACE FUNCTION public.admin_list_users_with_kyc()` returning profile rows + `email_confirmed boolean` + aggregate `total_bets`, `balance`. SECURITY DEFINER, search_path = public, guarded by `has_role(auth.uid(),'admin')`.
- `GRANT EXECUTE ... TO authenticated`.

No table schema changes expected (reusing existing `profiles`, `teams`, `players`, `bets`).

---

## Out of scope / explicit non-goals

- Sidebar nav reorganization (already implemented, untouched).
- Match creation flow.
- Mobile-specific redesign beyond responsive grid collapse.
- Replacing the existing Hall of Fame / Grand Prize Winners card.

## Risks

- `admin.tsx` is large; layout changes will be surgical to the Overview tab + Users tab only.
- If a `gangs` table doesn't exist, Gangs tab will manage them via existing `profiles.gang_name` distinct list rather than introducing schema.
