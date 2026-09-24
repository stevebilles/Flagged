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

**Stale-docs refresh (docs/, README, Spec Kit)**
- Audited every doc against the code and fixed the retired-model leftovers: the 10-free-scan
  trial → 7-day trial + hard Scan-tab lock (`01`, `03`, `05`, `06`, `07`, `10`, `13`), the
  3-second live scan / frame processor / ML Kit → manual-shutter guide-box capture with Apple
  Vision (`02`, `05`, `06`, `14` rewritten, `16`), `diffEngine.ts`/skimpflation → `recheckEngine.ts`
  (`13`), Home tiles/Pantry headings (`05`), Quick Packs removed from the profile editor and the
  scan-meter component (`09`), screen file paths and missing screens (`17`).
- `docs/04-onboarding.md` got a "pending redesign" banner only (onboarding is deliberately
  deferred); README's skeleton-era claims (camera "stub", `flagged_lifetime`, 13 tests, fonts TODO)
  corrected.
- Spec Kit: constitution amended to **v2.0.0** (Principle III now the 7-day trial + annual
  subscription, not a 10-scan gate + one-time purchase); contracts `purchases-gating`,
  `recheck-diff`, `ocr-pipeline` rewritten and `screens` updated to match the code;
  spec/plan/tasks/research/data-model/quickstart marked as a historical planning record.
- Found while auditing: the "Habit" review trigger's 50-scan path read the legacy `stats`
  singleton, which nothing updates, so it never fired — superseded by the review-schedule rewrite
  below. Also corrected `CLAUDE.md`: the JS code runs no camera frame processor.
- Not read in full (only searched for retired terms): `docs/11`, `12`, `15`, `data-schema.md`,
  `legal/`.

**New paywall in the Scan tab**
- Rebuilt the Figma paywall mockup as `src/purchases/PaywallView.tsx` — "FLAGGED PRO" header,
  $24.99/year card with a 7-day-trial pill, four feature rows, a CTA, a short summary sentence
  under it ("7-day free trial, then $24.99 per year, renewing automatically. No charge today. You'll see
  an in-app reminder before billing, and you can cancel anytime."), and the
  required subscription disclosure — in the app's design system (Atkinson Hyperlegible, brand
  cyan instead of the mockup's green, theme tokens, Dynamic Type sizes only).
- The Scan tab now shows it inline for non-subscribers instead of the old lock icon + button;
  `app/paywall.tsx` now just wraps the same component (kept for the future onboarding soft
  paywall). `withAlpha` is now exported from `src/design/components.tsx`. Mockup saved as
  `docs/screenshots/paywall.png`. Docs/contracts updated. Typecheck, lint, 120 tests pass.
- Paywall legal text trimmed: removed the Terms/Privacy links (they stay in Settings — Apple
  requires them in the app and App Store metadata, not on the purchase screen) and cut the
  disclosure to one line + a "Subscription details" link to a new in-app screen
  (`app/subscription-details.tsx`) holding the longer wording, with a Back button. Restore
  Purchase stays in Settings only (add to the paywall if App Review asks). The details wording is
  standard auto-renewal boilerplate and hasn't been reviewed by a lawyer.
- RevenueCat wiring check: the paywall is shown exactly when `isPremium` is false (cache at launch →
  confirmed by RevenueCat in bootstrap → refreshed on foreground / purchase / restore). Added a live
  RevenueCat listener (`subscribeToEntitlement`, activation-only) so an Ask-to-Buy approval or
  redeemed code unlocks the app without a restart. Dashboard (project "Flagged-Food Label
  Scanner"): entitlement `premium` ← Flagged Annual products, offering `default` with an Annual
  package — all present.
- Verified on a device (2026-09-23, sandbox): paywall → Apple purchase sheet
  ([Environment: Sandbox]) → RevenueCat records `flagged_annual` and the `premium` entitlement →
  the Scan tab unlocks by itself. Getting there needed a fix on the user's side: the RevenueCat iOS
  key in `.env` matched neither Flagged RevenueCat project (401 "Invalid API Key"); it now matches
  the "Flagged iOS" app in project "Flagged-Food Label Scanner".
- **Trial mismatch found and fixed (RevenueCat side):** the sandbox purchase was NOT a free trial
  (Apple's sheet showed "$24.99 per year" / "Subscribe"; the period ended about an hour later).
  Cause: the free-week introductory offer (Sep 21, 2026, no end date; US/CA/UK/AU/NZ) is on the App
  Store Connect subscription whose Product ID is **`Flagged_Pro_Annual`** — the only subscription in
  the "Flagged Pro" group — but the app/RevenueCat were still using a leftover `flagged_annual`
  product from an earlier setup, which has no trial. Fix: created RevenueCat product
  `Flagged_Pro_Annual` (id `proddda71ffb3d`) on the Flagged iOS app, attached it to the `premium`
  entitlement and the `default` offering's Annual package, detached the old iOS product from that
  package (left on the entitlement, not deleted), and set `ANNUAL_PRODUCT_ID` and the docs to
  `Flagged_Pro_Annual`. **Still to verify:** a fresh sandbox tester (or cleared purchase history +
  reinstall) should now see "7 days free" on Apple's sheet.
- Product note: some real users won't be eligible for the trial (already used it, returning
  subscribers); the paywall currently always says "7-day free trial / No charge today". Planned:
  check eligibility via RevenueCat and show the trial wording only to eligible users.

**Trial eligibility: only promise the trial to people who get it**
- Apple allows one introductory offer per Apple account per subscription group, so returning
  subscribers, reinstalls and anyone who already used the trial pay right away — but the paywall
  always said "7-day free trial / No charge today". Now `PaywallView` asks RevenueCat
  (`getTrialEligibility`, using `checkTrialOrIntroductoryPriceEligibility`) and shows the trial
  wording only to eligible users; everyone else gets "Subscribe for $24.99/year" with a plain
  price-and-renewal summary. "Unknown" (e.g. offline) does not promise a trial. Copy rules are the
  pure, tested `trialEligibility.ts` (10 tests, written test-first). The Subscription details
  screen now words the trial as "if you're eligible". All 147 tests, typecheck and lint pass.
  **Not yet verified on a device** (an account that already used the trial should see the plain
  "Subscribe" wording; a fresh sandbox tester should see the trial wording).

**In-app reminders: trial-ending banner + Pantry red dot**
- Apple sends no reminder before a trial converts to a charge (owner-verified), so the paywall now
  promises an "in-app reminder" and the app delivers it — no push notifications, by design:
  - Home banner during the last 3 days of a trial that hasn't been cancelled: "Your free trial ends
    Tue 5:42 PM — Cancel by Mon 5:42 PM if you don't want to be charged $24.99" + Manage
    subscription. Shows the cancel-by time (Apple needs 24h notice), not a countdown; in the final
    24 hours it says the cancel window has passed. Logic is the pure, tested `trialBanner.ts`
    (11 tests, written test-first); UI is `TrialEndingBanner.tsx`.
  - Red dot on the Pantry tab icon while any item is >30 days since last verified
    (`src/domain/pantryDue.ts`, 6 tests) — the Pantry already lists those at the top.
  - `purchases.ts` now caches the entitlement's `periodType` and `willRenew` (needed to know a trial
    is active and not already cancelled) and notifies the app store when they change.
  - Settings' dev-only buttons "Simulate trial ending in 48h / 20h" show the banner without waiting.
- Paywall wording updated to match ("You'll see an in-app reminder before your trial ends, so you can
  cancel before your card is charged"; bullet 4 now describes the Pantry recheck instead of a
  reminder). Typecheck, lint, and all 137 tests pass. **Not yet checked on a device.**

**Review requests redesigned for the 7-day trial**
- Replaced the old "Aha" (5th flagged ingredient) and "Habit" (30 days premium / 50 scans)
  triggers with three requests, each at most once, each right after a completed scan once the user
  has left Results: (1) inside the 7-day trial, (2) after the trial ends, (3) 30+ days after the
  trial was activated. At most one per scan, in that order.
- New pure, unit-tested `src/review/reviewSchedule.ts` (14 tests, written test-first);
  `onScanCompleted()` replaces `onFlaggedResultDismissed`/`onAppForeground` and is called from
  `app/results.tsx` for clean and flagged scans; the foreground trigger was removed from
  `app/_layout.tsx`. `purchases.ts` now caches the store's original purchase date
  (`cachedPremiumSince`) as the trial-start anchor.
- Typecheck, lint, and all 120 tests (9 suites) pass. **Not yet verified on a device** — the native
  prompt and RevenueCat dates can only be checked in a TestFlight/sandbox build. Because scanning
  requires premium, requests 2–3 only reach people who kept their subscription; iOS caps the system
  prompt at about three per year, so this schedule uses that whole allowance in the first month.
  Docs updated (`docs/10`, `03`, `14`, README).

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
