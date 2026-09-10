# Phase 0 Research — Flagged V1 MVP

All decisions below are constrained by the constitution (offline-first, zero backend,
safety-critical accuracy) and by `docs/02-architecture.md`. Nothing here introduces a
network dependency on a core path.

## R1 — On-device OCR engine

**Decision**: Use `react-native-vision-camera` frame processors with
`react-native-vision-camera-text-recognition` (Google ML Kit text recognition under the
hood), running entirely on-device on both iOS and Android. Still-image OCR (the "Choose
Photo" path) uses the same recognizer on a single frame.

**Rationale**: ML Kit text recognition is bundled/on-device, needs no API key and no
network, and is accurate for printed Latin-script food labels. It is the standard RN
analogue of Apple's Vision framework and keeps one code path for iOS and Android, matching
the Android-readiness goal. Already wired in the repo (`src/ocr/recognition.ts`,
`CameraScanner.tsx`; commit "Make live camera OCR work on device").

**Alternatives considered**:
- *Apple Vision via a custom native module* — best iOS accuracy but iOS-only, more native
  code to maintain, defeats the single-codebase goal. Rejected.
- *Any cloud OCR (Google Cloud Vision, AWS Textract, etc.)* — forbidden by Constitution
  Principle I. Rejected outright.
- *Tesseract (`tesseract.js` / native)* — slower, worse on real-world label photography,
  heavier bundle. Rejected.

**Risk & mitigation**: OCR quality on curved/reflective packaging is the one real tradeoff
(`docs/02`). Mitigations: the 3-second multi-frame capture + stitching (R2), conservative
regex cleanup (R3), the Paste and Choose-Photo fallbacks, and an explicit "illegible → abort,
no scan consumed" path (FR-007). Real-device accuracy is a manual acceptance item
(`quickstart.md`).

## R2 — Frame-to-frame stitching

**Decision**: Keep the current pure-TypeScript approach in `src/ocr/stitch.ts`: per frame,
extract recognized text blocks, dedupe on block identity (geometry + text signature), sort
by Y then X to rebuild reading order, and merge the trailing text of frame *N* with the
leading text of frame *N+1* using a longest-common-substring / overlap search. Stitching
stops at the 0-second mark and the assembled paragraph goes to normalization.

**Rationale**: Pure TS = deterministic, unit-testable in the sandbox (Constitution V), and
identical across platforms. The worklet only needs to hand recognized blocks out; all
assembly logic is testable off-device.

**Alternatives considered**: doing assembly inside the frame-processor worklet (harder to
test, JSI constraints); relying on a single best frame (fails for lists longer than the
viewport — a stated edge case).

**Open sub-item for tasks**: confirm the dedupe key is stable enough while panning; add
stitch tests for the "overlapping frames merge on the seam without duplication" and "deduped
block ids aren't re-added" cases (`docs/13`).

## R3 — OCR error correction (regex cleaning)

**Decision**: Apply a conservative digit→letter / punctuation cleanup **only as a fallback**
after an exact match on the raw normalized text fails, and **never** for red-flag terms that
contain a digit (e.g. "red 40", "yellow 5", "blue 1"). This is already implemented in
`src/matching/matcher.ts` (`regexClean`, guarded by `hasDigit`).

**Rationale**: Regression protection for the earlier `0→o` bug that corrupted dye codes
(`docs/13`). The cost of a corrupted valid term is a missed flag = P0.

**Alternatives considered**: aggressive normalization of all tokens (caused the original
bug); a full spell-corrector dictionary pass (slower, opaque, risk of new false positives).

## R4 — Fuzzy matching threshold

**Decision**: Levenshtein-ratio similarity, flag at **≥ 0.85**, single-word terms only
(length ≥ 4), compared against individual label words with a length-delta prefilter. Matches
as currently implemented. Threshold is a named constant (`FUZZY_THRESHOLD`) so it can be
tuned with test evidence.

**Rationale**: `docs/06` baseline. Keeps typo tolerance without firing on unrelated short
words. Longer phrase terms are matched by exact whole-phrase presence instead.

**Open sub-item for tasks**: build a small fixture of realistic OCR typos vs. true negatives
and assert the threshold behaviour (`docs/13`).

## R5 — Offline purchase entitlement

**Decision**: RevenueCat (`react-native-purchases`) configured for one **non-consumable**
product mapped to a `premium` entitlement. On every successful `getCustomerInfo` / purchase
/ restore, write a boolean to the local `app_meta` cache (`cachedPremium`). The gate reads
the cache synchronously; network refresh is best-effort and never blocks. A failed network
call falls back to the cached value — a paid user is never locked out (FR-024, SC-004).
Implemented in `src/purchases/purchases.ts`.

**Rationale**: RevenueCat already caches `CustomerInfo`, but an explicit `app_meta` boolean
gives a synchronous, dependency-free read for the gate and survives SDK-not-configured
("skeleton") mode during development.

**Alternatives considered**: StoreKit 2 / Play Billing directly (more native surface, we'd
re-implement receipt caching); a subscription product (forbidden by Principle III); trusting
only RevenueCat's in-memory cache (not guaranteed synchronous at first render).

**Dependency for release**: the non-consumable product must be created in App Store Connect
and mapped in RevenueCat, and real public SDK keys supplied via EAS secrets
(`EXPO_PUBLIC_RC_IOS_KEY`). Tracked in `quickstart.md` and `docs/12`.

## R6 — Pantry thumbnail storage & backup exclusion

**Decision**: Compress the front-of-pack photo with `expo-image-manipulator` to a small
JPEG, store it under the app's document directory via `expo-file-system`, and keep only the
local URI in `pantryItem.imageFilePath`. Exclude the thumbnails directory from iCloud/backup
where the platform allows (iOS resource value / `NSURLIsExcludedFromBackupKey` via the
file-system API or a tiny config plugin).

**Rationale**: Thumbnails are regenerable and shouldn't bloat device backups (`docs/03`).
All local, no upload.

**Open sub-item for tasks**: verify the exclusion mechanism actually available in the
installed `expo-file-system` version; if not exposed, add a minimal config plugin. Manual
check on a real device.

## R7 — Review-prompt trigger tracking

**Decision**: Use `expo-store-review` (`StoreReview.requestReview()`), gated by
`StoreReview.isAvailableAsync()`. Track locally in `app_meta`: cumulative flagged-ingredient
count (for the "5th flagged ingredient" Aha trigger), a `premiumSince` timestamp (for the
30-day Habit trigger), and read `totalLabelsRead` from `stats` (for the 50-scan trigger).
Fire the Aha prompt only after the user leaves the results screen; never condition any
prompt on prior positive sentiment. Implemented in `src/review/reviewTriggers.ts`.

**Rationale**: `docs/10`. The OS rate-limits and may show nothing — the app must not retry
or build a custom star dialog.

## R8 — Clock-tampering / backwards time for the 30-day and 24-hour windows

**Decision**: Compare stored epoch timestamps against `Date.now()` and treat only positive
elapsed time as elapsed. If `now < storedTimestamp` (clock moved back), treat elapsed time
as 0 rather than negative — a recheck is simply not yet due, and a soft-deleted item is not
yet purged. Purge of soft-deleted items happens on app open and on Pantry view.

**Rationale**: Spec edge case ("device date changed backwards … must not behave
destructively"). Cheap, no dependency, testable as pure logic.

**Alternatives considered**: a trusted-time network call (violates offline principle);
persisting a monotonic counter (overkill for MVP).

## R9 — Two new stat counters (skimpflation / reformulations caught)

**Decision**: Add `totalSkimpflationCaught` and `totalReformulationsCaught` to the `stats`
singleton. On a recheck whose `DiffResult.changed` is true: `+1` reformulations when
`added.length > 0 || removed.length > 0`; `+1` skimpflation when `orderShifted`. Both can
increment on one recheck; neither increments on an "identical" recheck. Independent of the
red-flag check outcome. Surface all five totals on Home (`docs/05` — design may present the
two recheck totals as a secondary/reveal row).

**Rationale**: User-requested (2026-09-08). The diff engine already computes `added`,
`removed`, `orderShifted`; this is a small, pure addition wired into `commitRecheckStats`.

**Migration note**: existing installs need the two columns added with default 0
(`data-model.md` covers the additive migration).

## Summary of decisions

| # | Decision | Status |
|---|----------|--------|
| R1 | ML Kit on-device OCR via VisionCamera | Chosen; in repo |
| R2 | Pure-TS frame stitching | Chosen; in repo, needs more tests |
| R3 | Conservative regex cleanup, digit-guarded | Chosen; in repo (regression-covered) |
| R4 | Levenshtein ≥ 0.85, single-word | Chosen; threshold tunable |
| R5 | RevenueCat non-consumable + local cache gate | Chosen; needs store product + keys |
| R6 | Local compressed thumbnails, backup-excluded | Chosen; verify exclusion API |
| R7 | `expo-store-review` + local trigger counters | Chosen |
| R8 | Clamp negative elapsed time to 0 | Chosen; pure logic |
| R9 | Two new recheck stat counters | Chosen; additive migration |

No NEEDS CLARIFICATION items remain.
