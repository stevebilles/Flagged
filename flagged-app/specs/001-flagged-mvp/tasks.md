---
description: "Task list for Flagged V1 MVP implementation"
---

# Tasks: Flagged V1 MVP

**Input**: Design documents from `specs/001-flagged-mvp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. The constitution (Principle II — Safety-Critical Accuracy; Principle V —
Test-First for Core Logic) requires unit tests for all pure logic, with named regression
cases. Test tasks for pure-logic modules are written/updated before or alongside the
implementation task they cover.

**Organization**: Grouped by user story (US1–US8 from spec.md) in priority order. Much of
this already exists in the codebase — `/speckit-converge` (next step) marks what is actually
done and appends any true gaps.

**Path root**: `C:\Users\steve\Flagged\flagged-app`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1–US8; Setup/Foundational/Polish carry no story label

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Verify Expo dev-client build config in `app.config.ts` and `eas.json` (VisionCamera + RevenueCat plugins, iOS 17 deployment target, Android minSdk 26).
- [ ] T002 [P] Confirm `package.json` scripts `typecheck`, `test`, `lint` run clean on a fresh `npm install`.
- [ ] T003 [P] Confirm Jest config (`jest.config.js`) picks up `src/__tests__/**` and supports the pure-logic modules without native mocks.
- [ ] T004 [P] Confirm ESLint (`eslint-config-expo`) passes; add `src/domain`, `src/matching`, `src/ocr` to coverage collection.
- [ ] T005 Document required EAS secrets in `docs/12-build-and-release.md`: `EXPO_PUBLIC_RC_IOS_KEY` (and Android key), plus the RevenueCat product/entitlement ids.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: no user-story work proceeds until this phase is complete.

- [ ] T006 Finalize local SQLite schema in `src/db/schema.ts` for all six entities per `data-model.md` (dictionary tables, `profiles`, `pantry_items`, `stats`, `app_meta`).
- [ ] T007 Add the two new `stats` columns in `src/db/schema.ts`: `total_skimpflation_caught` INTEGER NOT NULL DEFAULT 0 and `total_reformulations_caught` INTEGER NOT NULL DEFAULT 0.
- [ ] T008 Add an additive, non-destructive DB migration (bump `app_meta.dbMigration`) in `src/db/client.ts` / `src/bootstrap/init.ts` that adds T007's columns to existing installs with default 0.
- [ ] T009 [P] Update `Stats` interface in `src/domain/types.ts` with `totalSkimpflationCaught` and `totalReformulationsCaught`.
- [ ] T010 [P] Update `src/db/repositories.ts` (`getStats`/`saveStats`) to read/write the two new counters.
- [ ] T011 Verify first-launch seed in `src/bootstrap/init.ts` + `src/db/seed.ts`: idempotent upsert of `assets/data/ingredients.json` by id; creates the singleton `stats` row and a default `profile`; re-seed on higher `schemaVersion` never touches user tables (per `data-model.md`).
- [ ] T012 [P] Verify `src/db/appMeta.ts` covers all keys in `data-model.md` (schemaVersion, dbMigration, hasOnboarded, activeProfileId, firstName, cachedPremium, premiumSince, flaggedIngredientsSeen, reviewAhaFired, reviewHabitFired).
- [ ] T013 [P] Confirm theme tokens in `src/design/theme.ts` provide complete separate dark + light palettes (no shared hex) incl. `warning` orange (dark `#F59E0B`, light `#B45309`) per `docs/09`.
- [ ] T014 [P] Confirm Atkinson Hyperlegible loads via `src/design/useAppFonts.ts` from `assets/fonts/` with no system-font fallback for primary content.
- [ ] T015 [P] Confirm `src/state/appStore.ts` holds only `activeProfileId`, `isPremium`, `hasOnboarded`, `lastScan` and hydrates from the DB / entitlement cache.
- [ ] T016 Add a shared elapsed-time helper (clamp negative elapsed to 0) in `src/domain/time.ts` for the 30-day recheck and 24-hour undo windows (research R8); unit-test it.

**Checkpoint**: schema, seed, stats model, theme, fonts, and state are ready.

---

## Phase 3: User Story 1 — Scan a label and get a clear answer (Priority: P1) 🎯 MVP

**Goal**: point camera (or Paste / Choose Photo) at an ingredients list → correct clean/flagged result with highlights and a breakdown.

**Independent Test**: paste a known list with and without a targeted ingredient → result screen shows the right outcome, highlights the right words, explains each flag; an illegible capture aborts and consumes no scan.

### Tests for User Story 1

- [ ] T017 [P] [US1] Unit tests for `src/matching/normalize.ts` in `src/__tests__/matching.test.ts`: lowercase, hyphen-linebreak rejoin, comma/paren tokenization, idempotency; `looksLikeIngredientList` positives/negatives.
- [ ] T018 [P] [US1] Unit tests for `src/matching/matcher.ts`: exact whole-word/phrase presence (`milk` ≠ `buttermilk`); digit-bearing terms (`red 40`, `yellow 5`, `blue 1`) never regex-cleaned; **regression**: `0→o` cleanup does not corrupt a digit-bearing term; fuzzy fires at ≥0.85 for realistic typos and not below; longer phrase suppresses contained shorter match; `isClean` correctness.
- [ ] T019 [P] [US1] Unit tests for `src/matching/levenshtein.ts` similarity ratio edge cases.
- [ ] T020 [P] [US1] Unit tests for `src/ocr/stitch.ts`: overlapping frames merge on the seam with no duplication; deduped block ids not re-added; spatial sort rebuilds reading order.
- [ ] T021 [P] [US1] Unit tests for `evaluateScan` in `src/__tests__/domain.test.ts`: match present → `result`; no match + not ingredient-like → `aborted:"illegible"`; no match + ingredient-like → `result` (clean).

### Implementation for User Story 1

- [ ] T022 [P] [US1] Implement/verify `src/matching/normalize.ts` per `contracts/matching.md`.
- [ ] T023 [P] [US1] Implement/verify `src/matching/levenshtein.ts` (`similarity`).
- [ ] T024 [US1] Implement/verify `src/matching/matcher.ts` (`matchParagraph`, `FUZZY_THRESHOLD = 0.85`) per `contracts/matching.md` (depends on T022, T023).
- [ ] T025 [P] [US1] Implement/verify `src/domain/activation.ts` `effectiveRedFlagTerms` used by the scan path (full activation contract covered in US2).
- [ ] T026 [US1] Implement/verify `evaluateScan` + `commitScanStats` (clean/flagged/labels only) in `src/domain/scanService.ts` per `contracts/purchases-gating.md` (depends on T024, T025).
- [ ] T027 [P] [US1] Implement/verify on-device recognizer wrapper in `src/ocr/recognition.ts` (no network) and frame assembly in `src/ocr/stitch.ts` per `contracts/ocr-pipeline.md`.
- [ ] T028 [US1] Implement/verify live capture UI in `src/ocr/CameraScanner.tsx`: 3-second countdown, cyan (`#22D3EE`) bounding boxes, no shutter, camera-permission-denied path routes to Paste / Choose Photo.
- [ ] T029 [US1] Implement/verify Scan tab State 1 + State 3 in `app/(tabs)/scan.tsx`: `Start Camera Scanner` / `Paste` / `Choose Photo`; on result set `appStore.lastScan` and navigate to `results` (State 2 lockout is US5).
- [ ] T030 [US1] Implement Paste input (`expo-clipboard`) and Choose Photo input (`expo-image-picker` → single-image OCR) in `app/(tabs)/scan.tsx`, both routing through normalize → match.
- [ ] T031 [US1] Implement/verify `app/results.tsx`: Clean (cyan header, full paragraph) and Flagged (red header, highlighted tokens, charcoal breakdown card with ingredient · category · profile filter); commits stats once on mount; `Return to Home` / `Scan Another Item`.
- [ ] T032 [US1] Wire the "illegible" abort in `app/(tabs)/scan.tsx` → error message, no navigation to results, no stat change.

**Checkpoint**: a user can scan/paste/photo a label and get a correct, explained result. MVP-viable.

---

## Phase 4: User Story 2 — Personalise what gets flagged (Priority: P1)

**Goal**: choose Quick Packs, fine-tune categories/ingredients, add custom terms, keep multiple family profiles; the active profile drives matching.

**Independent Test**: two profiles with different packs → same label yields different results; deselecting one of two packs that share a category keeps the shared category active.

### Tests for User Story 2

- [ ] T033 [P] [US2] Unit tests for `src/domain/activation.ts` in `src/__tests__/domain.test.ts`: select composite pack activates all member categories; **regression**: deselect one of two packs sharing *Synthetic preservatives* keeps it active; toggle single ingredient off; add/remove custom term (trim/lowercase/dedupe); `effectiveRedFlagTerms` set math.
- [ ] T034 [P] [US2] Integration test (jest-expo + in-memory SQLite) in `src/__tests__/profileEditor.test.tsx`: editor toggles write through to the DB and reflect on reload; onboarding pack selection persists to the default profile.

### Implementation for User Story 2

- [ ] T035 [P] [US2] Implement/verify all activation functions in `src/domain/activation.ts` per `contracts/activation.md`.
- [ ] T036 [P] [US2] Implement/verify profile repository ops in `src/db/repositories.ts`: create/list/update profile, JSON-array (de)serialization for `activeCategoryIds` / `excludedIngredientIds` / `customIngredients`.
- [ ] T037 [US2] Implement/verify Home profile chips row in `app/(tabs)/index.tsx`: select (sets `appStore.activeProfileId` + `app_meta.activeProfileId`), `Edit` opens `profile-edit`, `Add Profile +` creates a new profile.
- [ ] T038 [US2] Implement/verify `app/profile-edit.tsx` bottom sheet: 11 Quick Pack pills (selected = cyan fill); expandable category rows (name, "N names · tap for details", classification badge, on/off switch); per-ingredient toggles; custom-ingredient field + `Add`; all writes go through `src/domain/activation.ts`.
- [ ] T039 [P] [US2] Implement/verify classification badge component (regulated / advisory / preference) in `src/design/components.tsx` per `docs/09`, contrast-checked in both themes.
- [ ] T040 [US2] Ensure the Scan path reads the **active** profile's effective set at scan time (`app/(tabs)/scan.tsx` → `evaluateScan`).

**Checkpoint**: profiles fully manageable; scanning respects the active profile.

---

## Phase 5: User Story 5 — Trial, then a one-time unlock (Priority: P1)

**Goal**: 10 fully-unlocked free scans; 11th attempt locked behind one $24.99 non-consumable purchase; paid state persists offline.

**Independent Test**: 10 successful scans → 11th blocked with unlock screen; simulate purchase → scanning restored, meter/lock gone; relaunch offline → still premium.

### Tests for User Story 5

- [ ] T041 [P] [US5] Unit tests for the gate + stats math in `src/__tests__/domain.test.ts`: `canScan` = `isPremium || freeScansUsed < 10`; `commitScanStats` increments `freeScansUsed` only when not premium and caps at 10; **regression**: illegible abort never increments; premium never increments; `scansRemaining` math.
- [ ] T042 [P] [US5] Unit tests for entitlement cache in `src/__tests__/purchases.test.ts` (mock `react-native-purchases`): `isPremiumCached` synchronous read; `refreshEntitlement` falls back to cache on network failure; `purchaseLifetime`/`restorePurchases` update the cache and set `premiumSince`.
- [ ] T043 [P] [US5] Screen test for `app/(tabs)/scan.tsx` lockout state: renders State 2 when `freeScansUsed >= 10` and not premium; hidden for premium.

### Implementation for User Story 5

- [ ] T044 [P] [US5] Implement/verify `src/purchases/purchases.ts` per `contracts/purchases-gating.md` (non-consumable, `premium` entitlement, offline cache in `app_meta`, skeleton mode when no key).
- [ ] T045 [US5] Implement/verify `canScan` / `scansRemaining` / `commitScanStats` gate in `src/domain/scanService.ts`.
- [ ] T046 [US5] Implement/verify Scan tab State 2 (Hard Paywall Lockout) in `app/(tabs)/scan.tsx`: lock icon + single `Unlock Unlimited Scans - $24.99` button, `$39.99` struck through; camera/paste/photo all disabled.
- [ ] T047 [US5] Implement/verify meter pill (`Scans Remaining: N / 10`) shown only when not premium, on `app/(tabs)/scan.tsx`.
- [ ] T048 [US5] Implement/verify `app/paywall.tsx`: $24.99 card, $39.99 struck through, pitch copy from `docs/08`, buy → `purchaseLifetime` → on success dismiss + `appStore.setPremium(true)`.
- [ ] T049 [US5] Implement Results secondary button flip to `Unlock Unlimited Scans` when the 10th scan was just consumed, in `app/results.tsx`.
- [ ] T050 [US5] Implement/verify `Restore Purchases` + Trial/Premium status indicator in `app/(tabs)/settings.tsx`.
- [ ] T051 [US5] Ensure entitlement refresh on app foreground in `app/_layout.tsx` / `src/bootstrap/init.ts` (best-effort, never blocks render).

**Checkpoint**: P1 set complete — the shippable core (scan + personalise + trial/unlock).

---

## Phase 6: User Story 3 — Build and trust a Safe Foods list (Priority: P2)

**Goal**: save a clean-scanned product (photo + brand + product) to the Pantry grid.

**Independent Test**: complete a clean scan → Save to Pantry → item shows in the grid with photo, brand, product.

### Tests for User Story 3

- [ ] T052 [P] [US3] Integration test in `src/__tests__/pantry.test.tsx`: saving writes a `pantry_items` row with `originalIngredients` = scanned list, `dateAdded`/`lastVerifiedDate` = now; grid lists up-to-date items; empty state shows when grid and undo log are both empty.

### Implementation for User Story 3

- [ ] T053 [P] [US3] Implement/verify pantry repository ops in `src/db/repositories.ts` (create/list/soft-delete/restore/purge).
- [ ] T054 [P] [US3] Implement thumbnail capture + compression in `src/domain/pantryImage.ts` using `expo-image-manipulator` + `expo-file-system`; store local URI; exclude the directory from backup (research R6).
- [ ] T055 [US3] Implement/verify `app/save-to-pantry.tsx`: "Snap a photo of the front of the packaging" viewfinder → compress → modal for Brand + Product → write `pantryItem`.
- [ ] T056 [US3] Implement/verify Pantry grid (Section 2) in `app/(tabs)/pantry.tsx`: scrollable grid of up-to-date items (thumbnail, brand, product).
- [ ] T057 [US3] Implement/verify Pantry empty state in `app/(tabs)/pantry.tsx` with verbatim copy from `docs/05`.
- [ ] T058 [US3] Wire `Save to Pantry` primary action on the Clean result in `app/results.tsx` → `app/save-to-pantry.tsx`.

**Checkpoint**: users can save and see safe foods.

---

## Phase 7: User Story 4 — Re-check a product for recipe changes (Priority: P2)

**Goal**: items unverified >30 days surface in a Recheck list; re-scanning a new box yields one of three outcomes with correct stats and Keep/Delete behaviour.

**Independent Test**: age an item past 30 days → moves to Recheck → run identical / changed-safe / changed-flagged rechecks → three distinct screens; Keep updates baseline + resets timer; Delete → 24h undo → purge.

### Tests for User Story 4

- [ ] T059 [P] [US4] Unit tests for `src/domain/diffEngine.ts` in `src/__tests__/domain.test.ts`: identical → `identical`; add/remove → reformulation; survivor order shift → `orderShifted`; both at once; `changed_flagged` vs `changed_safe`; order-shift ignores pure add/remove.
- [ ] T060 [P] [US4] Unit tests for recheck stats in `src/__tests__/domain.test.ts`: `totalReformulationsCaught +1` on add/remove; `totalSkimpflationCaught +1` on order shift; both +1 together; neither on identical; `totalRedFlagsCaught += matches.length` on `changed_flagged`.
- [ ] T061 [P] [US4] Unit tests for the elapsed-time helper (`src/domain/time.ts`): item exactly 30 days old, backwards-clock does not make an item due early or purge early.
- [ ] T062 [P] [US4] Integration test in `src/__tests__/pantry.test.tsx`: item aged >30d appears in the Recheck section; 24h undo restores; after 24h purge removes row + thumbnail.

### Implementation for User Story 4

- [ ] T063 [US4] Implement/verify `diffIngredients` + `evaluateRecheck` in `src/domain/diffEngine.ts` per `contracts/recheck-diff.md`.
- [ ] T064 [US4] Implement `commitRecheckStats(outcome)` in `src/domain/scanService.ts` (labels +1; reformulation/skimpflation/red-flag counters; free-scan rule same as a normal scan).
- [ ] T065 [US4] Implement Recheck section (Section 1) in `app/(tabs)/pantry.tsx`: items with `now − lastVerifiedDate > 30d` (via `src/domain/time.ts`), verbatim header/subtitle, checklist UI.
- [ ] T066 [US4] Implement the intercept modal ("Only scan a NEWLY PURCHASED box…") in `app/(tabs)/pantry.tsx` → `Yes, open camera` (recheck scan) / `Remind me later`.
- [ ] T067 [US4] Create `app/recheck-result.tsx`: Outcome 1 green toast + reset; Outcome 2 orange "Recipe Change Detected" + breakdown + "No Active Red Flags Detected" badge + Keep/Delete; Outcome 3 Alert Red + added-ingredient(s) + which filter + Delete(primary)/Keep(muted).
- [ ] T068 [US4] Implement Keep/Delete repository effects: Keep → `originalIngredients = new`, `lastVerifiedDate = now`; Delete → `deletedAt = now`.
- [ ] T069 [US4] Implement Recent Changes log (Section 3) + `Undo` in `app/(tabs)/pantry.tsx`; purge after 24h (via `src/domain/time.ts`), run on app open and Pantry focus.
- [ ] T070 [US4] Route the recheck scan from the intercept modal through the OCR/normalize path into `evaluateRecheck` and `app/recheck-result.tsx`.

**Checkpoint**: full pantry recheck / diff flow works.

---

## Phase 8: User Story 6 — Onboarding and first-run setup (Priority: P2)

**Goal**: 7-screen onboarding ending on Home with a working profile and (optionally) a name.

**Independent Test**: fresh install → 7 screens in order → chosen Quick Pack active on default profile, entered name on Home header, onboarding never reappears; blank name still completes.

### Tests for User Story 6

- [ ] T071 [P] [US6] Integration test in `src/__tests__/onboarding.test.tsx`: completing the flow sets `hasOnboarded`; selected pack persists to the default profile; entered name → `app_meta.firstName` + default profile name; skipped name → completes, Home greeting fallback; no scan consumed.

### Implementation for User Story 6

- [ ] T072 [US6] Update `app/onboarding.tsx` to 7 screens per `docs/04` (verbatim copy): insert **Screen 4 — "What should we call you?"** (first-name field, "why we ask" subtext, `Continue` / `Skip`) between Personalize and the 4-Tab Hub; renumber the rest.
- [ ] T073 [US6] On finish, persist: `hasOnboarded`, selected packs → default profile via `selectPack`, and the name (if any) → `app_meta.firstName` and default profile `name`.
- [ ] T074 [P] [US6] Implement/verify `app/index.tsx` redirect: `hasOnboarded` → `(tabs)`, else `onboarding`.
- [ ] T075 [P] [US6] Verify the 4-tab bottom bar in `app/(tabs)/_layout.tsx` (Home · Scan · Pantry · Settings, equal width, no FAB).

**Checkpoint**: onboarding is complete and matches the updated spec.

---

## Phase 9: User Story 7 — Home dashboard shows protection so far (Priority: P3)

**Goal**: Home greets by name and shows five lifetime totals.

**Independent Test**: totals reflect lifetime counts and update after each scan; a recheck bumps Skimpflation / Reformulations correctly.

### Tests for User Story 7

- [ ] T076 [P] [US7] Screen test in `src/__tests__/home.test.tsx`: header uses `firstName` with graceful fallback; five stat tiles render values from a seeded `stats` row; values refresh on focus.

### Implementation for User Story 7

- [ ] T077 [US7] Implement/verify personalized header in `app/(tabs)/index.tsx` ("Good Morning, {firstName}" + fallback).
- [ ] T078 [US7] Implement the Protection Summary in `app/(tabs)/index.tsx`: five tiles — Labels Read, Red Flags Caught, Clean Scans, Skimpflation Caught, Reformulations Caught (last two may be a secondary row / reveal when non-zero, per `docs/05`); read from `stats`, refresh on focus.
- [ ] T079 [P] [US7] Stat tile component in `src/design/components.tsx` (label + value), legible at max Dynamic Type.

**Checkpoint**: dashboard complete.

---

## Phase 10: User Story 8 — App Store review prompt (Priority: P3)

**Goal**: native review prompt at the two defined moments only, never gamed.

**Independent Test**: 5th flagged ingredient then leave results → prompt requested once (OS may suppress); premium 30-day / 50-scan trigger fires once.

### Tests for User Story 8

- [ ] T080 [P] [US8] Unit tests for `src/review/reviewTriggers.ts` in `src/__tests__/review.test.ts`: Aha fires after the 5th cumulative flagged ingredient and only after leaving results; Habit fires at 30 days premium OR 50 `totalLabelsRead`, whichever first; each fires at most once (`reviewAhaFired` / `reviewHabitFired`); never conditioned on sentiment.

### Implementation for User Story 8

- [ ] T081 [US8] Implement/verify `src/review/reviewTriggers.ts` per `docs/10` + research R7: track `flaggedIngredientsSeen`, `premiumSince`; use `expo-store-review` guarded by `isAvailableAsync()`.
- [ ] T082 [US8] Call the Aha check on navigation away from `app/results.tsx`; call the Habit check on app foreground in `app/_layout.tsx`.

**Checkpoint**: all user stories functional.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T083 [P] Accessibility pass: every screen respects Dynamic Type and reflows at max font size; flagged/clean/warning states pair colour with icon + text (FR-033); WCAG AA contrast audit of both palettes.
- [ ] T084 [P] Verify no network call exists on any core path (scan, match, save, pantry read, gating) — grep for `fetch`/`XMLHttpRequest`/`axios`; add an ESLint rule or test guard.
- [ ] T085 [P] Coverage: ensure `src/matching`, `src/domain`, `src/ocr` are near-fully covered; wire `npm run typecheck && npm test` into CI per `docs/12`.
- [ ] T086 [P] Update `docs/` for any behaviour finalized during implementation (keep `docs/` as the source of truth; note the 7-screen flow and 5 stat pillars are already updated).
- [ ] T087 Thin E2E (Maestro) for the critical paths in `e2e/`: onboarding → Home; paste → flagged result; clean → Save to Pantry → grid; exhaust 10 scans → lockout; recheck → each of 3 outcomes; restore purchases (sandbox).
- [ ] T088 Run `specs/001-flagged-mvp/quickstart.md` — all automated checks green; complete the device-only acceptance runs (camera accuracy, airplane-mode, offline entitlement, IAP sandbox, Dynamic Type).
- [ ] T089 Release prep per `docs/12` + `docs/15`: EAS production build, store listing + screenshots + IAP review screenshot, Privacy Policy + Terms of Service published and linked in Settings, RevenueCat product live.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** blocks everything.
- **P1 stories**: US1 (Phase 3) → US2 (Phase 4) → US5 (Phase 5). US2 and US5 build on US1's scan path; do them in order for a coherent MVP, though US2's activation logic and US5's purchase wrapper are independently testable.
- **P2 stories**: US3 (Phase 6) before US4 (Phase 7) — recheck needs saved items. US6 (Phase 8) is independent of US3/US4.
- **P3 stories**: US7 (Phase 9) needs the stats model (T007–T010) done; US8 (Phase 10) is independent.
- **Phase 11 (Polish)** after all targeted stories.

### Within each story

- Pure-logic tests before/with the module they cover (constitution).
- Models/repositories → domain services → screens.

### Parallel opportunities

- All `[P]` tasks in Phase 1 and Phase 2.
- T017–T021 (US1 tests) in parallel; T033–T034 (US2 tests) in parallel; likewise each story's test block.
- Once Phase 2 is done, different people could take US1 / (US2 activation) / (US5 purchases wrapper) concurrently.

---

## Implementation Strategy

### MVP (P1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 (US1) → **validate scan/paste/photo → result** → 4. Phase 4 (US2) → 5. Phase 5 (US5) → **validate trial/lockout/unlock**. Ship or demo the P1 MVP.

### Incremental delivery

Add US3 → US4 → US6 (P2), each independently testable, then US7 → US8 (P3), then Polish.

---

## Notes

- `[P]` = different files, no incomplete dependency.
- Many tasks say "implement/verify" because a working skeleton exists — `/speckit-converge`
  (next) assesses the real code against `spec.md` / `plan.md` / this file and appends a
  `## Phase 12: Convergence` section listing the true remaining work for `/speckit-implement`.
- Treat any missed-flag / false-clean defect as P0: add a failing regression test, then fix.
- Commit after each task or logical group.

---

## Phase 12: Convergence

**Generated by `/speckit-converge` on 2026-09-08.** Assessment of the current codebase against
`spec.md`, `plan.md`, the contracts, and the constitution. Each task traces to a finding
(`<source-ref>` + `<gap-type>`). Ordered severity-first (HIGH → LOW). No existing task was
modified. After completing these, re-run `/speckit-converge` to confirm fewer/no remaining
items.

### HIGH

- [X] T090 Thread category + Quick-Pack attribution through matching so a flagged result names the ingredient, its category, and the profile filter that caught it: extend `Match` in `src/matching/matcher.ts` (or return a lookup) with `categoryId`/`categoryName`/`packName`, populate it in `src/domain/scanService.ts` from the active profile + dictionary, and render it in the `app/results.tsx` breakdown card per US1/AC1 (partial)
- [X] T091 Create `app/recheck-result.tsx` with the three outcomes from `contracts/recheck-diff.md` / `docs/07` §7.1: Outcome 1 identical (green toast, reset timer, back to grid), Outcome 2 `changed_safe` (orange "Recipe Change Detected", skimpflation/reformulation breakdown, "No Active Red Flags Detected" badge, Keep/Delete), Outcome 3 `changed_flagged` (Alert Red, names added ingredient(s) + which filter, Delete primary / Keep muted) per FR-018 (missing)
- [X] T092 Wire the Pantry Recheck flow in `app/(tabs)/pantry.tsx`: replace the `onPress={() => {/* TODO */}}` on the Recheck card with the intercept modal ("Only scan a NEWLY PURCHASED box to check for changes. Do you have a new box ready?" → `Yes, open camera` / `Remind me later`), then run the capture through the OCR/normalize path into `evaluateRecheck` and navigate to `app/recheck-result.tsx` per FR-017 (missing)
- [X] T093 Add the two new stat counters end to end per FR-036/FR-036a and `data-model.md`: `total_skimpflation_caught` and `total_reformulations_caught` INTEGER NOT NULL DEFAULT 0 in `src/db/schema.ts`; an additive migration in `src/db/client.ts`/`src/bootstrap/init.ts` that adds them to existing installs (default 0, bump an `app_meta` migration marker); the fields on `Stats` in `src/domain/types.ts`; read/write in `getStats`/`saveStats` in `src/db/repositories.ts`; and `ensureStatsSingleton` in `src/db/seed.ts` (missing)
- [X] T094 Add `commitRecheckStats(outcome)` in `src/domain/scanService.ts` per `contracts/recheck-diff.md`: `totalLabelsRead += 1`; `totalReformulationsCaught += 1` when `added` or `removed` non-empty; `totalSkimpflationCaught += 1` when `orderShifted`; `totalRedFlagsCaught += matches.length` on `changed_flagged`; free-scan increment same rule as a normal scan; nothing on `identical` — and call it from `app/recheck-result.tsx` per FR-036a (missing)
- [X] T095 Update `app/onboarding.tsx` to the 7-screen flow per `docs/04` (verbatim copy): insert Screen 4 "What should we call you?" (first-name `TextInput`, the "why we ask / stays on device" subtext, `Continue` / `Skip`) between Personalize and the 4-Tab Hub; renumber the remaining screens; on finish persist the name (if any) to `app_meta.firstName` and the default profile `name`, alongside the existing pack-selection + `hasOnboarded` writes per FR-026/FR-026a (contradicts)
- [X] T096 Add unit tests for the trial gate + scan stats in `src/__tests__/domain.test.ts` (or a new `scanService.test.ts`): `canScan` = `isPremium || freeScansUsed < 10`; `commitScanStats` increments `freeScansUsed` only when not premium and caps at 10; illegible `evaluateScan` abort never increments; premium never increments; clean vs flagged counters; `scansRemaining` math — per Constitution II & V and US5 (missing)

### MEDIUM

- [X] T097 Implement the front-of-pack photo in `app/save-to-pantry.tsx` per FR-015 / `contracts/screens.md`: open a camera viewfinder ("Snap a photo of the front of the packaging"), compress to a small JPEG in a new `src/domain/pantryImage.ts` (`expo-image-manipulator` + `expo-file-system`), store the local URI in `pantryItem.imageFilePath`, and exclude the thumbnails directory from device backup (research R6) (partial)
- [X] T098 Add the two recheck stat tiles to the Home Protection Summary in `app/(tabs)/index.tsx` — "Skimpflation Caught" and "Reformulations Caught" reading `totalSkimpflationCaught` / `totalReformulationsCaught` (secondary row / reveal-when-non-zero is acceptable per `docs/05`) — per FR-027 / US7 (missing)
- [X] T099 Add `src/domain/time.ts` with a clamped elapsed-time helper (negative elapsed → 0, research R8) plus unit tests, and use it for the 30-day recheck-due check in `app/(tabs)/pantry.tsx` and the 24-hour purge in `purgeExpiredDeletions` so a backwards device clock never makes an item due or purgeable early — per the spec Edge Cases (missing)
- [X] T100 Wire the "Habit" review trigger: call `onAppForeground(isPremium)` from `src/review/reviewTriggers.ts` on app foreground (e.g. an `AppState` listener in `app/_layout.tsx` or `src/bootstrap/init.ts`) so the 30-day-premium / 50-scan prompt can fire — per FR-030 / US8 (partial)
- [X] T101 Refresh the purchase entitlement on app foreground (not only in `bootstrap`): best-effort `refreshEntitlement()` on resume in `app/_layout.tsx`, never blocking render, falling back to the cached value — per FR-024 / plan T051 (partial)
- [X] T102 Add a matcher regression test in `src/__tests__/domain.test.ts`: `matchParagraph` with a dye filter active flags "Red 40" in the text AND `regexClean` never turns a digit-bearing term into a corrupted form (`red 40` ↛ `red 4o`), locking in the `hasDigit` guard — per Constitution II (missing)
- [ ] T103 Add jest-expo integration test setup (in-memory / temp SQLite, native-module mocks for camera + purchases) and the screen↔DB tests from `plan.md` Phase 1: profile-editor persistence, onboarding pack + name persistence, Pantry recheck surfacing + 24h undo, Scan lockout rendering by `freeScansUsed`/premium — per `plan.md` / `quickstart.md` (missing)
  - DEFERRED: needs `@testing-library/react-native` added and the jest-expo runtime iterated against the reanimated/worklets babel plugins + native mocks — best done in a session that can run the RN test runtime, not blind. The pure-logic suite (`jest.config.js`, ts-jest/node, 63 tests) is untouched and remains the merge gate.

### Follow-ups surfaced during T090–T102

- [ ] T110 Add a minimal Expo config plugin to set `NSURLIsExcludedFromBackupKey` on the pantry thumbnails directory (`src/domain/pantryImage.ts` stores under `documentDirectory/pantry/`; the classic `expo-file-system` API doesn't expose the flag). Fully satisfies FR-015's backup-exclusion clause (T097 covers capture/compress/store/cleanup) (partial)

### LOW

- [ ] T104 Make the flagged-paragraph highlight word-level in `app/results.tsx` (use each `Match` position/length instead of splitting on `,()` and highlighting the whole segment) per US1/AC1 (partial)
- [ ] T105 Limit the "Aha" review trigger in `src/review/reviewTriggers.ts` to non-premium (trial) users per FR-030 wording ("during their 10 free scans") (partial)
- [ ] T106 Accessibility pass per FR-033 / Constitution IV: verify every screen reflows at the maximum OS text size, confirm flagged/clean/warning states pair colour with icon + text, and audit both palettes for WCAG AA contrast (partial)
- [ ] T107 Add a thin Maestro E2E suite in `e2e/` for the critical paths (onboarding→Home, paste→flagged result, clean→Save to Pantry→grid, exhaust 10 scans→lockout, recheck→each of 3 outcomes, restore purchases sandbox) per `plan.md` T087 (missing)
- [ ] T108 Configure the RevenueCat non-consumable product + entitlement in App Store Connect and RevenueCat, replace the placeholder `LIFETIME_PRODUCT_ID` / offering in `src/purchases/purchases.ts` as needed, and supply real `EXPO_PUBLIC_RC_IOS_KEY` (and Android) via EAS secrets — release blocker per `quickstart.md` / `docs/12` (missing)
- [ ] T109 Confirm the `__DEV__` developer panel in `app/(tabs)/settings.tsx` and `diagnosePurchases` in `src/purchases/purchases.ts` are fully excluded from production builds (they are `__DEV__`-gated / unused today — verify and document) (unrequested)
