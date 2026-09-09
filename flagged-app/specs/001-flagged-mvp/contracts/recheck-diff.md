# Contract — Pantry Recheck / Diff Engine (`src/domain/diffEngine.ts`)

Pure TypeScript. Product reference: `docs/07-results-and-rescan.md`.

## `diffIngredients(oldList: string[], newList: string[]): DiffResult`
Returns `{ added, removed, orderShifted, changed }`.
- `added` = items in `newList` not in `oldList` (normalized compare).
- `removed` = items in `oldList` not in `newList`.
- `orderShifted` = the sequence of **surviving** items (present in both) differs between old
  and new. Pure additions/removals alone do **not** set `orderShifted`.
- `changed` = `added.length || removed.length || orderShifted`.

## `evaluateRecheck(oldList, newList, redFlagTerms): RecheckOutcome`
- `!changed` → `{ kind: "identical" }`.
- `changed` and new list matches a red-flag term → `{ kind: "changed_flagged", diff, matches }`.
- `changed` and no match → `{ kind: "changed_safe", diff }`.

## Stats side-effects (in `scanService` / a `commitRecheckStats`, not the pure fn)
On any non-identical outcome:
- `totalLabelsRead += 1`
- `totalReformulationsCaught += 1` if `added.length || removed.length`
- `totalSkimpflationCaught += 1` if `orderShifted`
- `totalRedFlagsCaught += matches.length` if `changed_flagged`
- free-scan count: rechecks are successful scans → same rule as a normal scan (counts only
  when not premium).

## Post-choice behaviour (UI → repository)
- **Keep** (on `changed_safe` or `changed_flagged`): set `originalIngredients = newList`,
  `lastVerifiedDate = now`.
- **Delete**: set `deletedAt = now`; item enters the 24-hour undo log; purge after 24h
  (clamp negative elapsed to 0).
- **identical**: `lastVerifiedDate = now`; item returns to the grid.

**Acceptance checks** (→ tests)
- Identical lists → `identical`, no stat counters move.
- Add an ingredient → `reformulations += 1`; order-only shuffle of survivors →
  `skimpflation += 1`; both at once → both += 1.
- `changed_flagged` when a newly added ingredient is on the active filter; breakdown names
  the ingredient and the filter.
- Keep updates the baseline and resets the 30-day timer; Delete enters the 24h window.
- Backwards clock: a soft-deleted item is not purged early.
