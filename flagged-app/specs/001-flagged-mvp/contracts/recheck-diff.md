# Contract — Pantry Recheck Engine (`src/domain/recheckEngine.ts`)

Pure TypeScript. Product reference: `docs/07-results-and-rescan.md` §7.1.

> **Rewritten 2026-09-23 to match the code.** The original contract described `diffEngine.ts`, an
> ingredient-text diff (`diffIngredients`, `orderShifted`, `changed_safe`, skimpflation). That was
> retired 2026-09-14: raw OCR ingredient text was too inconsistent run-to-run to diff (the same
> label re-scanned reported phantom changes). The app no longer stores or compares ingredient
> text at all.

## Model
A Pantry save only happens on a **clean** result, so none of the then-active filter terms were
present at save time. A recheck rescans the new box and interprets any match against what was
being screened for **then** (the saved `ProfileSnapshot`) vs. **now** (the live profile).

## `evaluateRecheck(isClean, matches, oldSnapshot): RecheckOutcome`
- `isClean` → `{ kind: "identical" }` — still clean under the current profile. (Not a provable
  claim that nothing changed, only that nothing currently flags.)
- otherwise → `{ kind: "changed_flagged", matches: AttributedMatch[] }`.

## `attributeRecheckMatches(matches, oldSnapshot): AttributedMatch[]`
Each match gets an `attribution`:
- `reformulation` — the category/term was **already in the snapshot** (already being screened
  for), so the ingredient itself is presumably new.
- `profile_change` — the category/term was **not** in the snapshot: a filter added since saving,
  not necessarily a product change. The UI enriches it with a date from `ProfileChangeLog`
  (`docs/03` §3.2a) when one exists.
- Custom ingredients (no `categoryId`) compare the term directly against the snapshot's custom
  list.

## Stats side-effects (`commitRecheckStats(outcome, profile)`, not the pure functions)
Called once on mount of `recheck-result`, with the **item's own** profile (never the globally
active one):
- Always `totalLabelsRead += 1`.
- On `changed_flagged`: `totalRedFlagsCaught += matches.length`; and
  `totalReformulationsCaught += 1` only if at least one match is `reformulation`-attributed
  (`profile_change` alone does not count).
- No skimpflation counter and no free-scan counter exist any more.

## Post-choice behaviour (UI → repository)
- **identical**: reset the 30-day timer (`lastVerifiedDate = now`); item returns to the list.
- **changed_flagged**: `Keep Item` accepts today's flagged state as the new normal; `Delete Item`
  soft-deletes (`softDeletePantryItem`) into the 24-hour undo log, purged after 24h (negative
  elapsed time clamped to 0). See `app/recheck-result.tsx`.

**Acceptance checks** (→ tests)
- Clean rescan → `identical`; only `totalLabelsRead` moves.
- A match on a category already in the snapshot → `reformulation`; on one newly added to the
  profile → `profile_change`.
- `totalReformulationsCaught` moves once per recheck with ≥1 reformulation-attributed match.
- The recheck uses the item's own profile even if a different profile is active.
- Backwards clock: a soft-deleted item is not purged early.
