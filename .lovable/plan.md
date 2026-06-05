## Scope

Seven user-facing changes, grouped so each commit is verifiable on its own.

### 1. Tile images (DONE — verify only)
- Re-pointed `tile-virtual / tile-vip / tile-challenges / tile-referrals / tile-housewallet` `.asset.json` files to the new uploads (VR headset, sapphire crown, runed shield + swords, chrome link, vault). No code changes — imports are unchanged.
- Add a subtle LSL skull-logo overlay (~12% opacity, blend-mode screen, centered) on each Manage tile so the logo "slightly shows" through, matching the reference screenshot.

### 2. Mobile navbar → vertical left rail
- Current state: desktop already has a top horizontal nav; the screenshot you sent is the **mobile** bottom bar.
- Replace `Layout`'s `lg:hidden fixed bottom-0` mobile nav with a `lg:hidden fixed left-0 top-16 bottom-0 w-14` vertical rail, anchored under the logo and ending at the footer.
- Background: `linear-gradient(180deg, dark-green 0%, dark-gold 100%)` (no transparency).
- Add `lg:hidden pl-14` to `<main>` so content shifts right and never sits under the rail.
- Remove the `h-20` bottom spacer.
- Desktop top nav stays as-is.

### 3. Compact tiles: Event Countdown / Broadcast Center / Quick Actions
- Constrain `PanelBlock` for these 3 to `aspect-square max-w-[260px]` with `overflow-hidden` and a "View all →" chevron — same square footprint as the stat tiles above.
- Quick Actions: collapse 6 buttons into a 3×2 icon grid (no labels, tooltip on hover).

### 4. Leaderboard admin: 3 wipe buttons
- In `LeaderboardAdminPanel`, add a destructive action row with 3 buttons:
  - **Wipe Leaderboard** → `delete from leaderboard_overrides` + reset aggregated points (no-op since aggregation reads from matches; this just clears manual overrides).
  - **Wipe Shooters** → clear player-scoped overrides only (`where kind = 'player'`).
  - **Wipe Hall of Fame** → `delete from hall_of_fame` (table exists per types).
- Each button gated by `useConfirm` dialog.

### 5. Countdown `/` → `:`
- Audit shows `Countdown.tsx` already uses `h … m … s` separators, no `/`. The `/` likely refers to the **date** rendering in EventBanner / event cards (`MM/DD/YYYY`). Switch those to `MM:DD:YYYY` per request, or — more likely intent — switch any HH/MM/SS displays to use `:`.
- I'll grep and convert any `/` separator in date/time display strings under `Event*` and `Countdown*` components.

### 6. Glassmorphism: thicker, less transparent
- In `src/styles.css`, raise opacity on:
  - `--glass-bg` from `0.06 / 0.02` → `0.22 / 0.14`
  - `--glass-border` from `0.12` → `0.28`
  - `.glass-strong` alphas from `0.92` (already strong, keep)
- Increase blur from `14px` → `20px` on `.glass` for thicker frost.

### 7. Image-URL inputs → file uploads
- Create one private bucket `admin-uploads` (RLS: admins/mods upload + read, public read on objects).
- Replace text URL `<Input>` for: Events banner, Announcements image, Advertisements image, Seasons banner, Spotlights image.
- Each becomes an `<input type="file" accept="image/*">` that uploads via `supabase.storage.from('admin-uploads').upload()` and stores the resulting public URL.
- Keep a small "or paste URL" link as fallback so admins can still use external CDN URLs if they prefer.

---

## Order of operations

1. Commit 1: Items **1, 3, 5, 6** (pure presentation — tiles + glass + countdown + compact panels). Safest, no DB.
2. Commit 2: Item **2** (left rail). Mobile-only layout change.
3. Commit 3: Item **4** (leaderboard wipes) — needs `useConfirm` wiring.
4. Commit 4: Item **7** (storage bucket migration + form rewrites). Biggest blast radius — last.

Reply "go" and I'll execute commit 1 immediately, then proceed through the rest. Or tell me to reorder/skip any item.