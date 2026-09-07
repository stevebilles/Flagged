# Flagged — Build Documentation & Seed Data

**Flagged** is a personalized, **100% offline** food-label ingredient scanner. Point the camera at
an ingredient list; the app reads the raw text on-device and highlights ingredients that match the
user's personal "Red Flag" filters. No barcodes, no health scores, no backend.

This folder is the **AI build handoff**: a complete spec for building the app, plus the bundled
ingredient dictionary the app ships with.

## Platform decision: React Native + Expo

The original brief targeted native Swift/SwiftUI. We build with **React Native + Expo** instead so
the app can ship to **iOS now and Android in the near future** from one codebase — while preserving
the moat (on-device OCR, local storage, offline purchase entitlement). See
[`docs/02-architecture.md`](docs/02-architecture.md) for the full native→RN mapping.

## Read the docs in order

| # | Doc | What it covers |
|---|---|---|
| 01 | [`docs/01-overview.md`](docs/01-overview.md) | Strategy, moat, target user, principles |
| 02 | [`docs/02-architecture.md`](docs/02-architecture.md) | RN/Expo stack, native→RN mapping, folders |
| 03 | [`docs/03-data-models.md`](docs/03-data-models.md) | Local DB schemas + seed loading |
| 04 | [`docs/04-onboarding.md`](docs/04-onboarding.md) | 6-screen onboarding (exact copy) |
| 05 | [`docs/05-navigation-and-tabs.md`](docs/05-navigation-and-tabs.md) | The 4-tab hub, all states |
| 06 | [`docs/06-ocr-engine.md`](docs/06-ocr-engine.md) | Capture, stitching, normalization, matching |
| 07 | [`docs/07-results-and-rescan.md`](docs/07-results-and-rescan.md) | Results + Pantry diff engine |
| 08 | [`docs/08-monetization.md`](docs/08-monetization.md) | 10-scan trial, paywall, offline entitlement |
| 09 | [`docs/09-design-system.md`](docs/09-design-system.md) | Colors, typography, components |
| 10 | [`docs/10-aso-review.md`](docs/10-aso-review.md) | In-app review triggers |
| — | [`docs/data-schema.md`](docs/data-schema.md) | Seed file shape + **activation rules** |

## The bundled dictionary

- **File:** [`assets/data/ingredients.json`](assets/data/ingredients.json)
- **Contents:** 11 Quick Packs, 20 canonical categories, **283** unique ingredients.
- **How it's used:** parsed into local SQLite on first launch; every install has identical data;
  selecting a Quick Pack activates its categories/ingredients for the active profile.
- **Regenerate:** run [`tools/build_seed.py`](../tools/build_seed.py) from the repo root (it holds
  the verbatim term lists sourced from the 11 `*/… Quick Pack.md` files, de-duplicates, applies
  classifications, and prints a per-category count verification).

```bash
python3 tools/build_seed.py     # writes flagged-app/assets/data/ingredients.json
```

## Source of truth for the dictionary

The 11 top-level folders in this repo (`Artificial Dyes/`, `Big-9 Allergens/`, …) hold the original
`.md`/`.docx` term lists and the UI reference screenshots. `ingredients.json` is the consolidated,
app-ready form of that data.


---

# Running the app skeleton

This folder now also contains a **working Expo (React Native + TypeScript) skeleton** wired to the
spec above and the bundled `ingredients.json` seed. It boots, seeds the local database on first
launch, runs onboarding, renders the 4-tab hub, and performs offline ingredient matching against a
profile's Quick Packs.

## Prerequisites
- **Node 18+** and npm
- A **custom dev client** — the app uses native modules (`react-native-vision-camera`,
  `react-native-purchases`), so **Expo Go will not work**. Use **EAS Build** or a local prebuild.
- Xcode 15+ (iOS 17 target) and/or Android Studio for device/simulator builds.

## Install & validate
```bash
cd flagged-app
npm install
npm run typecheck   # tsc --noEmit  → passes with 0 errors
npm test            # jest          → 13/13 pure-logic tests pass
```

## Run on a device/simulator (dev client)
```bash
# build & install the dev client once (per platform), then start Metro:
npx expo run:ios        # or: npx expo run:android
npm start               # expo start --dev-client
```

> A plain `npm start` in Expo Go will fail to load the native camera/purchases modules — that's
> expected. Build the dev client first.

## What works today (no native setup needed)
- First-launch **DB seed** from `assets/data/ingredients.json` → SQLite (`src/db`)
- **Onboarding** (6 screens, verbatim copy) incl. starting Quick Pack selection
- **Home**: profile chips, protection-summary pillars
- **Profile editor**: Quick Pack pills, categories grouped by parent with classification badges,
  category + individual-ingredient toggles, custom ingredients — full activation rules
- **Scan** standby / paywall-lockout states, and the **matching pipeline**
  (normalize → regex-clean → exact → fuzzy Levenshtein) via stubbed sample text
- **Results** (clean/flagged) with highlighted tokens + breakdown, stats accounting
- **Pantry** (recheck section, safe grid, 24h undo), **Settings**, **Paywall**

## The one stubbed piece: the live camera OCR
`app/(tabs)/scan.tsx` → `startCameraScanner()` currently feeds **sample text** into the real
matching pipeline so the flow is testable without hardware. Replace it with the VisionCamera live
capture that calls into the on-device OCR plugin, feeds recognized blocks through
`src/ocr/stitch.ts` (`sortBlocks` → `assembleParagraph`), and passes the assembled paragraph to
`runScan()`. See [`docs/06-ocr-engine.md`](docs/06-ocr-engine.md). All stubs are marked
`TODO(camera)`.

## Other integration TODOs (marked in code)
- **Fonts**: add Atkinson Hyperlegible TTFs under `assets/fonts/` and enable the requires in
  `src/design/useAppFonts.ts` (`TODO(assets)`).
- **RevenueCat**: set `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY` and configure the
  `flagged_lifetime` non-consumable + `premium` entitlement. Offline caching is already wired
  (`src/purchases/purchases.ts`).
- **Pantry recheck**: wire the intercept modal → camera → `evaluateRecheck()` diff engine
  (`src/domain/diffEngine.ts`), which is implemented and tested.

## Project layout
```
flagged-app/
├── app/                    # expo-router routes (screens)
│   ├── _layout.tsx         # bootstrap: seed DB, load fonts, theme
│   ├── index.tsx           # onboarding vs tabs redirect
│   ├── onboarding.tsx
│   ├── (tabs)/             # Home · Scan · Pantry · Settings
│   ├── results.tsx  paywall.tsx  save-to-pantry.tsx  profile-edit.tsx
├── src/
│   ├── design/             # theme tokens (dark/light), components, fonts
│   ├── db/                 # Drizzle schema, client, seed loader, repositories
│   ├── domain/             # types, activation rules, scan service, diff engine
│   ├── matching/           # levenshtein, normalize, hybrid matcher
│   ├── ocr/                # frame stitching + spatial sort (pure TS)
│   ├── purchases/          # RevenueCat wrapper + offline entitlement cache
│   ├── review/             # ASO in-app review triggers
│   ├── state/              # zustand app store
│   └── __tests__/          # jest tests for the pure domain logic
└── assets/data/ingredients.json
```
