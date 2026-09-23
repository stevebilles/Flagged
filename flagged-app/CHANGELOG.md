# Changelog

Session-by-session log of substantive work on Flagged, kept so a new session (human or Claude)
can quickly see what happened and why without digging through commit-by-commit history. Full
detail lives in git history and commit messages; this is the narrative summary.

## 2026-09-23

**CLAUDE.md rewritten to match the code**
- The old `CLAUDE.md` described a stack the app never used (`expo-camera`, Claude vision OCR,
  FlashList, `expo-linear-gradient`, `@expo-google-fonts`). Rewrote it from the actual code:
  Expo SDK 51, `react-native-vision-camera`, on-device Apple Vision OCR (`modules/vision-ocr`,
  iOS only), `expo-sqlite` + Drizzle, Zustand, RevenueCat, real screen list, current 7-day-trial
  model, repo layout (git root is one level above `flagged-app/`), and a "Keeping this file
  current" rule: any change that departs from `CLAUDE.md` must update it in the same change.
- Code was deliberately not changed to match the old file — the code is the source of truth.
- Onboarding (`app/onboarding.tsx`) is intentionally still the original flow (stale "10 free
  scans" copy, no soft paywall) until onboarding work starts.
- Stale docs still to refresh: `docs/17` screen paths, 10-scan mentions in `docs/01`/`06`/`13`
  and the Spec Kit constitution/contracts (tracked in `CLAUDE.md`).

**Seed cleanup**
- `src/db/seed.ts`: the first-launch `stats` insert no longer names the retired
  `total_skimpflation_caught` column (it falls back to its `DEFAULT 0`). This was never a crash
  — `client.ts` still creates the column — just a leftover; `client.ts`'s `CREATE TABLE` is
  intentionally unchanged so existing and fresh installs keep the same table shape. Typecheck
  and all 106 Jest tests pass; not yet verified on a fresh device install.

**`eas.json` submit block — reviewed, closed (no change)**
- Contains the App Store Connect key path, key ID and issuer ID only. The private `.p8` is
  gitignored and never committed, so nothing sensitive is exposed; the IDs can't authenticate
  alone. Accepted as-is. Recorded under "Settled decisions" in `CLAUDE.md` so it isn't re-raised.

**Moved everything Flagged-related out of OneDrive**
- API keys, design bundle, Red Flag Ingredients source docs, mascot folder, workspace file and
  master brief moved from `OneDrive\Desktop\...` to `C:\Users\steve\Apps\` (local, non-synced).
- `eas.json` `ascApiKeyPath` updated to `C:\Users\steve\Apps\API Keys\Flagged_AuthKey_M69U92KZ2K.p8`
  (the old OneDrive path no longer existed). Not yet re-tested with a real `eas submit`.

## 2026-09-21

**Tooling & CI**
- Installed and configured ESLint (`.eslintrc.js` extending `expo`), fixed all findings —
  including a real bug: Settings' subscription renewal date was memoized on `isPremium`, which
  doesn't change on a `true→true` renewal, leaving the displayed date stale.
- Added `.github/workflows/ci.yml` — lint, typecheck, and Jest run automatically on every
  push/PR.

**Apple business-account migration (resolved)**
- Root-caused a week-old blocker: the app's iOS bundle ID/App ID/provisioning profile had been
  silently registered under the old *personal* Apple team (`HYQMQAMA7Q`) instead of the new
  *business* team (`TX2LUQ529P`) back on 2026-09-14, because EAS defaulted to whichever Apple
  session was already cached.
- Fixed via `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` /
  `EXPO_APPLE_TEAM_ID` / `EXPO_APPLE_TEAM_TYPE` environment variables, forcing EAS to
  authenticate against the correct team; registered a device and produced a working iOS
  development build under the business team.

**Dev workflow**
- Diagnosed and fixed OneDrive Camera Upload (OneDrive had silently stopped syncing) so iPhone
  screenshots sync to this PC automatically instead of an email round-trip.
- Discovered the project existed as **two independent local git clones** of the same GitHub
  repo (`C:\Users\steve\Flagged` and a OneDrive copy) that had silently diverged — the OneDrive
  one fell 3 commits behind. Decision: retire the OneDrive copy; `C:\Users\steve\Flagged` is the
  one true local copy going forward. Run `eas build` / `expo start` from here from now on.

**Design system**
- Added a `subheadline` token (15pt, Apple's "Subheadline" text style) filling the gap between
  `caption` (13pt) and `body` (17pt) — used for genuinely-informational secondary text (privacy
  explanation, trial counts, Pro feature subtitles) that was previously stuck at the smallest,
  least-legible size.

**UI fixes**
- Home: stat tiles now 2-per-row instead of 4 squeezed into one row; relabeled
  `Scans`/`Saved`/`Flags`/`Reformulated` → `Total Scans`/`Pantry Items Saved`/`Red Flags
  Found`/`Reformulations Found` — self-explanatory instead of generic.
- Settings/paywall: added a monthly price breakdown ($2.08/mo) alongside the daily one, paired
  with "less than a pack of gum."

**Business model pivot: 10-free-scans → 7-day free trial**
- Removed the scan-count gate entirely (`canScan`/`scansRemaining`/`bumpTrialCounter`/
  `FREE_SCAN_LIMIT`) — gating is now purely `isPremium`-based.
- Scan tab: the hard-lock screen (already built for this shape) now triggers on trial/subscription
  status, not scan count; copy updated to match.
- Settings: removed the "Free Trial"/"Flagged Pro" upsell card entirely for non-premium users —
  the paywall now lives in onboarding (soft, skippable — **not yet built**) and the Scan tab's
  hard lock.
- Confirmed via RevenueCat's `rc` CLI: no dashboard restructuring needed — entitlement/offering/
  product were already correctly wired, and RevenueCat already marks `premium` active from trial
  start, not delayed until the first real charge. The 7-day trial itself needs to be configured
  on the App Store Connect side (Steve's task).
- Documented in `docs/08-monetization.md`.

**Known follow-ups, not yet done**
- Onboarding soft-paywall screen — not built yet (Figma redesign in progress).
- ~~`src/db/seed.ts`'s `ensureStatsSingleton()` inserts a retired `total_skimpflation_caught`
  column~~ — resolved 2026-09-23 (see above).
- The OneDrive copy of the repo still exists on disk — safe to delete once tonight's work is
  pushed (see "Dev workflow" above).
