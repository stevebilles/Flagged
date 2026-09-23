# 13 — Testing Strategy

Flagged's correctness lives mostly in **pure functions** (matching, activation, diff), which are
cheap to test and where bugs are most costly (a missed red flag is a safety issue). The strategy
prioritizes those, then component behavior, then a thin layer of E2E for the critical flows.

## Test pyramid

```
        ▲  few    E2E (Detox / Maestro): scan → result, trial → paywall, pantry recheck
        │         Integration (jest + RN Testing Library): screens wired to the DB
   many │         Unit (jest): matching, activation, diff, stitching, stats math
        ▼
```

## Unit tests (highest priority)

Already present in `src/__tests__/domain.test.ts` (run `npm test`). These cover pure logic with no
native deps and run in the sandbox. Extend them as the source of truth.

**Must-cover cases:**

- **Matching (`src/matching`)**
  - Exact match hits (incl. dye names with digits: `red 40`, `yellow 5`, `blue 1`).
  - Regex-clean is a **fallback only** — must NOT corrupt valid digit-bearing terms
    (regression test for the earlier `0→o` bug).
  - Fuzzy match crosses the 85% threshold for realistic OCR typos; does NOT fire below it.
  - Clean paragraph → `isClean === true`.
  - Normalization: lowercase, hyphenated line-break rejoin, comma/paren tokenization.
- **Activation (`src/domain/activation.ts`)**
  - Selecting a pack activates all its categories.
  - Deselecting a pack keeps a **shared category** still needed by another active pack
    (regression test for the earlier `deselectPack` bug — e.g. Synthetic preservatives shared by
    Focus & ADHD and Preservatives).
  - Individual-ingredient exclusion removes only that term from the effective set.
  - Effective set = active-category ingredients − excluded + custom.
- **Recheck engine (`src/domain/recheckEngine.ts`)** — renamed from `diffEngine.ts` on
  2026-09-14; it no longer diffs ingredient text (`07` §7.1).
  - Still clean under the current profile → `identical`.
  - Any match on a rescan → `changed_flagged`.
  - A match on a category/term already in the saved profile snapshot → attributed
    `reformulation`; a match on one that is new to the snapshot → `profile_change`.
- **Stitching (`src/ocr/stitch.ts`)**
  - Overlapping frames merge on the seam without duplication.
  - Spatial sort rebuilds reading order; deduped block ids aren't re-added.
- **Stats math (`src/domain/scanService.ts`)**
  - Per-profile counters commit only on a successful result (`commitScanStats` /
    `commitScanStatsForAll`); illegible aborts commit nothing.
  - "All profiles" mode: each profile's counters move based on whether *its own* filters matched.
  - Recheck stats (`commitRecheckStats`): `totalLabelsRead` +1 always; on `changed_flagged`,
    `totalRedFlagsCaught` += matches, and `totalReformulationsCaught` +1 only if at least one match
    is reformulation-attributed. Skimpflation was retired 2026-09-14.
  - There is no trial counter or `canScan` gate any more; gating is `isPremium` (`08`).

## Integration tests

Use `jest-expo` + `@testing-library/react-native`. Seed an **in-memory / temp SQLite** DB, render a
screen, assert behavior.

- Onboarding S3 pack selection persists to the default profile.
- Profile editor toggles write through to the DB and reflect on reload.
- Scan standby vs. hard-paywall lockout renders based on `isPremium`.
- Results highlights the correct tokens and writes stats once.
- Pantry surfaces items older than 30 days into the recheck section; 24h undo restores.

> Native modules (camera, purchases) must be **mocked** at this layer. Provide fakes for
> `react-native-vision-camera` and `react-native-purchases`.

## End-to-end tests (thin, critical paths only)

Use **Maestro** (simplest for Expo) or **Detox**. Run against a dev/preview build on a
simulator/emulator. OCR camera input is mocked or driven via the Paste/Photo path so E2E is
deterministic.

Critical flows to cover:
1. Fresh install → onboarding → Home.
2. Scan (paste path) → flagged result → breakdown shown.
3. Scan clean → Save to Pantry → appears in grid.
4. Not premium → Scan tab shows the hard-lock screen ("Start Your 7-Day Free Trial"); every other
   tab still works.
5. Pantry recheck → both outcomes (identical / changed_flagged, including a reformulation-
   attributed and a profile-change-attributed match).
6. Restore Purchases path (sandbox) → premium unlocks, the lock screen disappears.

## Manual / device-only checks

Some things can't be automated cheaply and must be verified on a real device:
- Live camera OCR accuracy on real printed labels (docs/14).
- IAP purchase + restore with a Sandbox/license tester (docs/08/12).
- Offline entitlement: airplane mode, premium user not locked out.
- Dynamic Type scaling and dark/light palette correctness (docs/09).

## Coverage & CI

- Aim for high coverage on `src/matching`, `src/domain`, `src/ocr` (the pure logic).
- Wire `npm run typecheck && npm test` into CI on every PR (docs/12).
- Treat any missed-flag or false-clean bug as **P0** and add a regression test with the fix.
