# Implementation Plan: Flagged V1 MVP

**Branch**: `001-flagged-mvp` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-flagged-mvp/spec.md`

## Summary

Flagged is an offline-only mobile app that reads a food label's ingredient paragraph with
on-device OCR, matches it against the active profile's personal "Red Flag" list, and shows a
plain-language clean/flagged result. It supports multiple family profiles, a saved Pantry
with a 30-day recipe-change recheck, a fully unlocked 10-scan trial gated by a single $24.99
one-time purchase, a 7-screen onboarding flow, and a Home dashboard of lifetime protection
stats.

**Technical approach**: React Native + Expo (TypeScript, strict) with `expo-router`
navigation. All correctness-critical logic (normalization, matching, activation, diff,
stats) is pure TypeScript in `src/`, unit-tested with Jest and independent of native
modules. Native capability comes from `react-native-vision-camera` + an on-device text
recognizer for capture, `expo-sqlite` + Drizzle for local persistence, and
`react-native-purchases` (RevenueCat) for the one-time purchase with a locally cached
entitlement. No network is on any core path. The codebase already contains a working
skeleton of most of this; this plan describes the target design so `/speckit-tasks` and
`/speckit-converge` can drive it to a shippable MVP.

## Technical Context

**Language/Version**: TypeScript ~5.3 (strict), React 18.2, React Native 0.74 (Expo SDK 51)

**Primary Dependencies**: expo-router, expo-sqlite + drizzle-orm, react-native-vision-camera
+ react-native-vision-camera-text-recognition (on-device OCR), react-native-purchases
(RevenueCat), expo-font (Atkinson Hyperlegible), expo-image-manipulator + expo-file-system
(pantry thumbnails), expo-image-picker + expo-clipboard (alternate scan inputs),
expo-store-review (ASO), zustand (minimal global state)

**Storage**: On-device SQLite only (`expo-sqlite`), accessed through Drizzle. Small
key/value flags in an `app_meta` table. Pantry thumbnails on the local filesystem, excluded
from backup. No remote storage of any kind.

**Testing**: Jest + jest-expo for unit tests of pure logic (the priority — see constitution
Principle II & V); `@testing-library/react-native` for screen/DB integration tests with an
in-memory SQLite DB and mocked native modules; Maestro (or Detox) for a thin set of
critical-path E2E flows on a dev build. `npm run typecheck && npm test` is the merge gate.

**Target Platform**: iOS 17.0+ for the MVP release. Android (minSdk 26+) must remain
buildable from the same codebase but is not part of this release.

**Project Type**: Mobile app (single React Native + Expo project, no backend).

**Performance Goals**: Result screen within 10 seconds of opening the Scan tab for a clearly
printed label (SC-001). Live capture keeps the camera preview responsive (target ~60 fps
preview; OCR frame processing throttled to a sustainable rate). App cold start to
interactive under ~3 seconds on a mid-range device.

**Constraints**: 100% offline for every core flow (SC-003). No cloud OCR, no server, no
network-dependent feature. A paid user offline is never locked out (SC-004). An illegible
scan never decrements the free-scan count (SC-005). WCAG AA contrast in both themes; full
Dynamic Type support (SC-008).

**Scale/Scope**: Single-user-per-device. Bundled dictionary: 11 Quick Packs, 20 categories,
283 ingredients. ~12 screens (7 onboarding + 4 tabs + results/modals). Data volumes tiny
(tens of profiles/pantry items at most). No concurrency concerns.

## Constitution Check

*GATE: must pass before Phase 0 and be re-checked after Phase 1 design.*

| Principle | How this plan complies |
|---|---|
| **I. Offline-First, Zero Backend** | No network client in the codebase for any core path. OCR is on-device (`react-native-vision-camera-text-recognition`). Persistence is local SQLite. RevenueCat entitlement is read from its local cache / `app_meta` when offline. `research.md` R1 confirms the offline OCR choice; `quickstart.md` includes an airplane-mode acceptance run. |
| **II. Safety-Critical Accuracy** | Matching, activation, diff, stitching, and stats math live in pure `src/` modules with Jest tests and named regression cases (digit-bearing dye codes; shared-category deselection; illegible-abort not counting). Any missed-flag/false-clean defect is P0 and lands with a failing-first test. |
| **III. Full-Featured Trial, Hard Usage Gate** | Single gate function (`canScan`) keyed on `isPremium OR freeScansUsed < 10`. No feature is gated during the trial — only the scan inputs after 10. One non-consumable product; no subscription APIs used. |
| **IV. Accessibility-First, Objective Reporting** | Atkinson Hyperlegible loaded via `expo-font`, no system-font fallback for primary content. Two complete theme token sets (no shared hex) in `src/design/theme.ts`. Results state always pairs colour with icon + text. No score/grade is ever computed or shown. |
| **V. Test-First for Core Logic; Keep It Simple** | DB is the single source of truth; global state (zustand) holds only active profile + premium + onboarding + last-scan hand-off. New pure logic is added test-first. No new architectural layers introduced by this plan. |

**Technology & Architecture Constraints**: satisfied — stack matches `docs/02-architecture.md`
exactly (Expo dev client + EAS Build, `expo-sqlite`+Drizzle, VisionCamera OCR, RevenueCat
non-consumable). No cloud services. `docs/` remains the detailed product source of truth.

**Result: PASS** (no violations; Complexity Tracking not required).

## Project Structure

### Documentation (this feature)

```text
specs/001-flagged-mvp/
├── plan.md              # this file
├── research.md          # Phase 0 — technology decisions & open questions resolved
├── data-model.md        # Phase 1 — entities, fields, rules, state transitions
├── quickstart.md        # Phase 1 — how to run and validate the MVP end to end
├── contracts/           # Phase 1 — module & screen contracts (this app has no HTTP API)
│   ├── ocr-pipeline.md
│   ├── matching.md
│   ├── activation.md
│   ├── recheck-diff.md
│   ├── purchases-gating.md
│   └── screens.md
├── checklists/
│   └── requirements.md  # created by /speckit-specify
└── tasks.md             # created by /speckit-tasks (next step)
```

### Source Code (repository root: `C:\Users\steve\Flagged\flagged-app`)

The existing layout already matches `docs/02-architecture.md` and is kept:

```text
flagged-app/
├── app/                       # expo-router routes
│   ├── _layout.tsx            # root stack + ThemeProvider + bootstrap gate
│   ├── index.tsx              # entry redirect (onboarding vs tabs)
│   ├── onboarding.tsx         # → becomes the 7-screen flow (adds name screen)
│   ├── (tabs)/
│   │   ├── _layout.tsx        # 4-tab bottom bar
│   │   ├── index.tsx          # Home (greeting + 5 stat pillars)
│   │   ├── scan.tsx           # Scan (standby / lockout / active)
│   │   ├── pantry.tsx         # Pantry (recheck list / grid / undo log / empty)
│   │   └── settings.tsx       # Settings (name, restore, support, legal)
│   ├── results.tsx            # clean / flagged result
│   ├── paywall.tsx            # $24.99 unlock
│   ├── profile-edit.tsx       # profile editor bottom sheet
│   ├── save-to-pantry.tsx     # photo + brand/product capture
│   └── recheck-result.tsx     # NEW — identical / changed-safe / changed-flagged
├── src/
│   ├── bootstrap/init.ts      # first-launch seed + singletons
│   ├── db/                    # schema.ts, client.ts, repositories.ts, seed.ts, appMeta.ts
│   ├── ocr/                   # CameraScanner.tsx, recognition.ts, stitch.ts
│   ├── matching/              # normalize.ts, levenshtein.ts, matcher.ts
│   ├── domain/                # types.ts, activation.ts, diffEngine.ts, scanService.ts
│   ├── purchases/purchases.ts # RevenueCat wrapper + offline cache
│   ├── review/reviewTriggers.ts
│   ├── design/                # theme.ts, ThemeProvider.tsx, components.tsx, useAppFonts.ts
│   └── state/appStore.ts      # zustand: activeProfile, isPremium, hasOnboarded, lastScan
├── src/__tests__/             # domain.test.ts, recognition.test.ts, stitch.test.ts (+ new)
├── assets/
│   ├── data/ingredients.json  # bundled dictionary (built by tools/build_seed.py)
│   └── fonts/                 # Atkinson Hyperlegible TTFs
├── docs/                      # 00–16 product source of truth
└── app.config.ts             # Expo config + native module plugins
```

**Structure Decision**: Single Expo project, no backend. Routes in `app/`, all testable
logic in `src/` split by concern (db, ocr, matching, domain, purchases, design, state). This
is the layout already in the repo and in `docs/02`; the plan adds two route files
(`recheck-result.tsx`, and the name step inside `onboarding.tsx`) and extends the `stats`
model with two counters — no restructuring.

## Phase 0 — Research

See [research.md](./research.md). Open questions from the spec/brief are resolved there:
on-device OCR library choice and accuracy, frame-to-frame stitching approach, offline
entitlement mechanics, thumbnail backup exclusion on Expo, review-prompt trigger tracking,
and the backwards-clock handling for the 30-day / 24-hour windows.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — all six entities with fields, validation rules, and the
  state transitions for Pantry items (active → recheck-due → changed → kept/deleted → purged)
  and the trial (trial → locked → premium).
- [contracts/](./contracts/) — because this app exposes no HTTP API, contracts are the
  stable interfaces of the core modules (OCR pipeline, matcher, activation, recheck diff,
  purchases/gating) and the screen behaviour contracts, each with the acceptance checks that
  `/speckit-tasks` turns into work and tests.
- [quickstart.md](./quickstart.md) — prerequisites (Node, EAS, a dev build, a device), how
  to run unit tests in the sandbox, how to run the app on a device, and the manual
  acceptance runs that need real hardware (camera OCR, IAP sandbox, offline entitlement,
  Dynamic Type).

**Post-design constitution re-check**: still PASS. The design adds no network dependency, no
new persistence location, and no feature gating; the two new stat counters and the name
screen are additive and covered by pure-logic tests.

## Complexity Tracking

No constitution violations — this section intentionally left empty.
