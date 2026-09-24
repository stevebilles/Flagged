# Flagged — Claude Code

Flagged is a personalized, 100% on-device food-label ingredient scanner: the user points the
camera at an ingredient list, the app reads it locally, checks it against their "Red Flag"
profile, and highlights what to avoid. React Native + Expo, iOS first.

**The code is the source of truth.** If a doc disagrees with the code, the code wins — and the
doc (or this file) needs fixing. See "Keeping this file current" at the bottom.

## Repo layout

- Git root is **`C:\Users\steve\Flagged`**; this app lives in its `flagged-app/` subfolder.
  `.github/workflows/ci.yml` (lint + typecheck + Jest on every push/PR) and `tools/build_seed.py`
  live at the git root, one level up.
- `app/` — Expo Router screens · `src/` — all non-screen code · `modules/vision-ocr/` — local
  native module · `assets/data/ingredients.json` — bundled ingredient dictionary ·
  `assets/fonts/` — bundled Atkinson Hyperlegible TTFs · `docs/` — specs · `specs/` and
  `.specify/` — Spec Kit · `CHANGELOG.md` — narrative log of substantive work, read it to see what
  changed recently and why.

## Stack (what is actually installed)

- **Expo SDK 51**, React Native 0.74.5, React 18.2, TypeScript 5.3, Node 20 (`.nvmrc`).
- **Expo Router ~3.5** (file-based, `typedRoutes` on). Not Expo Go — native modules require a
  **custom dev client / EAS build** (`expo-dev-client`, `eas.json`).
- **Camera:** `react-native-vision-camera` 4.5.1 — **manual-shutter still capture** (`takePhoto`)
  inside a dashed guide box. The JS code runs **no frame processor**: frame processors are still
  enabled in `app.config.ts` and `react-native-worklets-core` is still installed/configured, but
  nothing calls them. Not `expo-camera`.
- **OCR:** on-device only, via the local native module **`modules/vision-ocr`** (Swift/ObjC,
  Apple's Vision `VNRecognizeTextRequest`). **iOS only — Android is not built** and would need its
  own engine. No cloud/LLM OCR and no backend, ever.
- **Persistence:** `expo-sqlite` + **Drizzle ORM** (`src/db/`). The dictionary is seeded from
  `assets/data/ingredients.json` on first launch.
- **State:** **Zustand** (`src/state/appStore.ts`).
- **Purchases:** **RevenueCat** via `react-native-purchases` (`src/purchases/purchases.ts`);
  entitlement `premium`, offering `default`, product `Flagged_Pro_Annual`, with an offline entitlement
  cache (3-day grace past expiry).
- **Other Expo modules in use:** `expo-image-picker` (Choose Photo), `expo-clipboard` (Paste),
  `expo-image` / `expo-image-manipulator`, `expo-store-review`, `expo-font`, `expo-file-system`,
  `expo-crypto`, `@expo/vector-icons` (Ionicons for tab icons).
- **Lists:** plain `ScrollView` — `@shopify/flash-list` is *not* used.
- **Gradients:** none — `expo-linear-gradient` is *not* installed.
- **Font:** Atkinson Hyperlegible, used exclusively, loaded with `expo-font` from bundled TTFs in
  `assets/fonts/` (`src/design/useAppFonts.ts`). Not `@expo-google-fonts`.

## Commands

`npm start` (dev client) · `npm run ios` / `npm run android` · `npm run typecheck` ·
`npm run lint` · `npm test` · `npm run seed:build` (runs `../tools/build_seed.py`).
Jest runs pure-TypeScript tests only (`src/__tests__/*.test.ts`, ts-jest, node environment) — no
component tests; native modules must not be imported by anything under test.

## Screens (`app/`)

- **Tabs** (`app/(tabs)/`): Home `index.tsx` · Scan `scan.tsx` · Pantry `pantry.tsx` ·
  Settings `settings.tsx`. No floating action button.
- **Stack:** `onboarding.tsx` (7 screens) · `results.tsx` (clean + flagged states) ·
  `save-to-pantry.tsx` · `profile-edit.tsx` (create with `?new=1`, edit with `?id=`) ·
  `recheck-capture.tsx` → `recheck-result.tsx` · `paywall.tsx` (a thin wrapper; the Scan tab renders
the paywall itself) · `subscription-details.tsx` (long-form subscription wording, opened from the
paywall's "Subscription details" link). `app/index.tsx` redirects to
  onboarding or the tabs. There is no separate pantry-detail screen (Pantry uses a `Modal`).
- **Scan input:** camera capture (guide box + `Capture` button, optional `Scan More`), **Paste
  Text**, or **Choose Photo** — all feed the same pipeline (`src/ocr/`, `src/matching/`,
  `src/domain/scanService.ts`). Details: `docs/14`.

## Code map (`src/`)

`bootstrap/` startup · `db/` schema, client, repositories, seed · `domain/` types, scan service,
recheck engine, activation, time · `matching/` normalize, Levenshtein, matcher · `ocr/` camera
capture, guide box, recognition, stitching · `purchases/` · `review/` in-app review triggers ·
`state/` Zustand store · `design/` theme, fonts, shared components.

## Monetization (current)

$24.99/yr auto-renewing subscription with a **7-day free trial** (the old 10-free-scan gate is
retired; the `freeScansUsed` DB column remains but nothing reads or writes it). Gating is purely
`isPremium`: the **Scan tab hard-locks** when not premium — it shows the paywall inline
(`src/purchases/PaywallView.tsx`, also wrapped by the unused `app/paywall.tsx` route and meant for
the future onboarding soft paywall); every other tab stays usable.
Details: `docs/08-monetization.md`. **Reminders are in-app only — no push/local notifications, by
design:** a trial-ending banner on Home (`src/purchases/TrialEndingBanner.tsx`, logic in
`trialBanner.ts`) and a red dot on the Pantry tab for items due a recheck (`src/domain/pantryDue.ts`).
Apple sends no pre-charge reminder, so the paywall promises an "in-app reminder" — don't reword it
to promise notifications unless they're actually built.

**Review requests** (`docs/10`): three, each at most once, each right after a completed scan once
the user has left Results — (1) inside the 7-day trial, (2) after the trial ends, (3) 30+ days after
the trial was activated (store original-purchase date). Schedule logic is the pure, tested
`src/review/reviewSchedule.ts`; `onScanCompleted()` in `src/review/reviewTriggers.ts` is called from
`app/results.tsx`. There is no app-foreground review trigger.

## Documentation

`docs/` holds the specs; read the ones relevant to your task before writing code:

- `01-overview` · `02-architecture` · `03-data-models` · `04-onboarding` ·
  `05-navigation-and-tabs` · `06-ocr-engine` · `07-results-and-rescan` · `08-monetization` ·
  `09-design-system` · `10-aso-review` · `11-setup-and-run` · `12-build-and-release` ·
  `13-testing-strategy` · `14-camera-ocr-integration` · `15-store-listing` ·
  `16-first-build-on-windows` · `17-mockup-screens` · `data-schema` (bundled
  `ingredients.json` shape) · `00-master-brief.pdf`.
- `docs/screenshots/` — Figma mockup screenshots; `docs/17-mockup-screens.md` indexes them
  (numbered `_2`, `_3` variants are scroll continuations of one screen).
- **Spec Kit:** `.specify/memory/constitution.md` (v2.0.0, amended 2026-09-23) and
  `specs/001-flagged-mvp/`. The `contracts/` (activation, matching, OCR pipeline, purchases
  gating, recheck, screens) were brought in line with the code; the spec/plan/tasks/research/
  data-model/quickstart files are a **historical planning record** (banner on each) — don't build
  from them. `speckit-*` skills are in `.claude/skills/`.

**Docs status (updated 2026-09-23):** `docs/` (except `04`), the README, the constitution and the
`contracts/` were brought in line with the code. Still out of step — fix these, or tell the user,
when you touch these areas, and remove items once corrected:

- `docs/04-onboarding.md` screens 6–7 — deliberately deferred (see below).
- `docs/11`, `12`, `15`, `data-schema.md`, `legal/` — only searched for the retired terms
  (10-scan model, skimpflation, 3-second scan, one-time purchase); not read in full.

**Onboarding is deliberately deferred:** work so far has focused on the app's functionality, not
onboarding. `app/onboarding.tsx` is still the original flow — its copy references the retired
"10 free scans" model and it has no soft-paywall step yet (Figma redesign in progress). This is
expected, not a bug; leave it alone unless asked to work on onboarding. Other open items are
listed under "Known follow-ups" in `CHANGELOG.md`.

## Hard rules

- No HTML elements (`div`, `span`, `button`, `img`, `p`) — use `View`, `Text`, `Pressable`, `Image`.
- No `className`, no CSS strings, no Tailwind, no web APIs (`localStorage`, `document`, `window`).
- **Styling:** React Native styles only, driven by design tokens — colors, spacing, radius, font
  family and font sizes come from `useTheme()` / `src/design/theme.ts`, never hard-coded. Reuse
  the shared components in `src/design/components.tsx` (`Screen`, `Card`, `Button`, `Text`, `Pill`,
  `Badge`, `SettingsRow`, …) before creating new ones. The theme is currently **forced to dark**
  (`ThemeProvider`); a light palette exists but there's no in-app appearance toggle yet.
- Font sizes use the Apple Dynamic Type scale defined in `theme.ts` (`caption` 13, `subheadline`
  15, `body` 17, `title` 20, `heading` 28, `display` 34) — don't add ad-hoc sizes.
- Always check `docs/09-design-system.md` and `docs/screenshots/` before writing UI.
- Always check `docs/03-data-models.md` and `src/domain/types.ts` before defining types.
- Nothing may require a network to scan, match, save, or read the Pantry, and no user data leaves
  the device.

## Settled decisions (not bugs — don't re-raise)

- **`eas.json` submit block** holds the App Store Connect key *path*, key ID and issuer ID. This is
  intentional and accepted: those IDs can't authenticate without the private `.p8`, which is
  gitignored and has never been committed. The keys live in `C:\Users\steve\Apps\API Keys\` (a
  local, non-synced folder outside any repo — **not** OneDrive); the path in `eas.json` points
  there and only matters when submitting from another machine. Only rule: **never commit the
  `.p8` (or any private key/secret).**
- **Nothing for Flagged lives in OneDrive.** The repo is `C:\Users\steve\Flagged`; design/reference
  assets (design bundle, Red Flag Ingredients source docs, mascot, master brief) are in
  `C:\Users\steve\Apps\`. Don't reference or recreate OneDrive paths.
- **`stats.total_skimpflation_caught`** is a retired, unused column that intentionally remains in
  the `CREATE TABLE` in `src/db/client.ts` (existing and fresh installs keep the same shape).
  Nothing reads or writes it; the seed insert no longer names it.

## Keeping this file current

This file must describe the app **as it is**, not as it was planned. **Whenever a change you make
(or notice) departs from anything written here — a dependency added or removed, a screen or route
added/renamed/removed, the OCR/persistence/state/purchases approach changing, the pricing or
gating model changing, a hard rule broken or relaxed — update the affected part of this file in
the same change.** If a doc under `docs/` is now wrong because of it, fix the doc too, or add it
to "Docs known to lag the code" above. Add a matching entry to `CHANGELOG.md` for substantive
work. Remove "Known gap" / "lag" items as soon as they're resolved.
