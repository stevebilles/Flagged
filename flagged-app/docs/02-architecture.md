# 02 — Tech Stack & Architecture

## Why React Native + Expo (not native Swift)

The original brief specified Swift/SwiftUI with Apple-native frameworks. That was chosen to
guarantee **on-device OCR, local persistence, and offline purchase entitlement**. Those
capabilities — **the actual moat** — are all achievable in React Native + Expo, which additionally
delivers the stated roadmap goal of **shipping to Android in the near future** from one codebase.

**Decision: build with React Native + Expo.** Preserve every product decision from the brief; only
the implementation technology changes.

### The one real tradeoff

On-device OCR engine quality. Apple's Vision framework is excellent; **Google ML Kit** (the standard
RN on-device text recognizer) is also excellent and runs **fully offline on both iOS and Android**.
For printed food labels this is not a meaningful difference. **No cloud OCR API is used, ever.**

## Native → React Native mapping

| Original (brief) | React Native + Expo equivalent | On-device / Offline |
|---|---|---|
| VisionKit `DataScannerViewController` (live OCR) | `react-native-vision-camera` **frame processors** + on-device OCR plugin (VisionCamera OCR / ML Kit) | ✅ |
| Vision item tracking (`RecognizedItem.id`) | Frame-processor dedup keyed on recognized-block geometry/text (worklet) | ✅ |
| Longest Common Substring / Levenshtein stitching | Pure TypeScript (identical algorithm) | ✅ |
| SwiftData persistence | **`expo-sqlite`** + **Drizzle ORM** (typed migrations) | ✅ |
| Foundation `JSONDecoder` seed load | Bundled `assets/data/ingredients.json` parsed on first launch | ✅ |
| StoreKit 2 + RevenueCat | **RevenueCat React Native SDK** (`react-native-purchases`) w/ local entitlement cache | ✅ |
| Atkinson Hyperlegible font | `expo-font` (same TTF files) | ✅ |
| `SKStoreReviewController` | `expo-store-review` (`StoreReview.requestReview()`) | ✅ |

## Core stack

- **Runtime/UI:** React Native (Expo SDK, latest stable) + TypeScript (strict).
- **Build/config:** Expo with **config plugins** + **development builds** (EAS). VisionCamera and
  RevenueCat require native modules, so **Expo Go is not sufficient** — use a **custom dev client**
  (`expo-dev-client`) and **EAS Build**.
- **Navigation:** `expo-router` (file-based) or React Navigation. Bottom tab navigator for the 4-tab
  hub, native stack for onboarding + results + modals.
- **Local database:** `expo-sqlite` with **Drizzle ORM**. All persistence is local. See `03`.
- **Camera + OCR:** `react-native-vision-camera` (camera + frame processors) with an on-device
  text-recognition frame processor (ML Kit / VisionCamera OCR). No network calls.
- **Purchases:** `react-native-purchases` (RevenueCat), configured for an **auto-renewing annual
  subscription**, with **offline entitlement caching** (grace window, not indefinite — see `08`).
- **State:** Lightweight — Zustand or React Context for the active profile + trial state; the DB is
  the source of truth. Keep global state minimal.
- **Fonts:** `expo-font` loading Atkinson Hyperlegible.
- **Reviews:** `expo-store-review`.
- **Images:** `expo-image-manipulator` (compress pantry thumbnails), `expo-file-system` (store
  local thumbnail paths, exclude from backup where supported).

## Minimum targets

- **iOS:** 17.0+ (per brief / audience). **Android:** minSdk 26+ (Android 8.0) for MVP-Android.
- Both are within range of all libraries above.

## Offline-first requirements (must-haves)

1. **No network dependency** for scanning, matching, saving, or reading the pantry.
2. **Seed on first launch:** parse bundled `ingredients.json` into SQLite once, then read from DB.
3. **Cached entitlement:** a paid user with zero connectivity must not be locked out — read the
   cached RevenueCat entitlement (see `08`).
4. **All user data stays local:** profiles, custom ingredients, pantry, stats, thumbnails.

## Suggested folder structure

```
flagged-app/
├── app/                      # expo-router routes
│   ├── onboarding/           # 7-screen flow (04)
│   ├── (tabs)/               # Home, Scan, Pantry, Settings (05)
│   │   ├── index.tsx         # Home
│   │   ├── scan.tsx
│   │   ├── pantry.tsx
│   │   └── settings.tsx
│   ├── results/              # results screens (07)
│   └── _layout.tsx
├── src/
│   ├── db/                   # Drizzle schema, migrations, seed loader (03)
│   ├── ocr/                  # frame processing, stitching, normalization, matching (06)
│   ├── matching/             # regex clean, exact + fuzzy (Levenshtein) matcher (06)
│   ├── domain/               # profile activation logic, diff/rescan engine (07)
│   ├── purchases/            # RevenueCat wrapper + entitlement cache (08)
│   ├── design/               # theme tokens, typography, components (09)
│   └── review/               # ASO review triggers (10)
├── assets/
│   ├── data/ingredients.json # bundled seed (data-schema.md)
│   └── fonts/                # Atkinson Hyperlegible
├── docs/                     # this doc set
└── app.config.ts             # Expo config + plugins
```

## What NOT to do

- ❌ No cloud OCR, no barcode lookups, no server, no analytics that require network to function.
- ❌ No health "scores." Flagged reports objective matches against the user's own filters only.
- ❌ Do not gate features during the free trial (see `08`).
