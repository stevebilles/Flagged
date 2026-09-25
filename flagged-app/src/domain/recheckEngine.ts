import type { Match } from "../matching/matcher";
import type { ProfileSnapshot } from "./types";

/**
 * Pantry recheck engine (docs/07 §7.1). Renamed from diffEngine.ts
 * (2026-09-14) because it no longer diffs anything — real-device testing
 * found raw OCR ingredient text too inconsistent run-to-run to diff
 * reliably (the same physical label re-scanned would report phantom
 * changes from OCR noise as often as real ones). The app no longer stores
 * or compares ingredient text at all.
 *
 * Instead: a Pantry save only ever happens on a CLEAN result, so by
 * construction none of the then-active filter terms were present at save
 * time. A fresh rescan is then interpreted against what was being screened
 * for THEN (the saved ProfileSnapshot) vs. NOW (the live profile) — see
 * `attributeRecheckMatches`.
 */

export type MatchAttribution =
  | { kind: "reformulation" } // this term was already being watched for and didn't flag before — the recipe may have changed (or the earlier scan missed it)
  | {
      // The term wasn't being screened for when the item was saved — the user's filters changed,
      // not necessarily the product. `cause` says which kind of change; the UI layer (which has DB
      // access) looks up WHEN in the ProfileChangeLog.
      kind: "profile_change";
      cause: "category_added" | "ingredient_included" | "custom_added";
      /** For `ingredient_included`: the ingredient the user had excluded at save time (the change
       * log keys these entries by ingredient id). */
      ingredientId?: string;
    };

export type AttributedMatch = Match & { attribution: MatchAttribution };

export type RecheckOutcome =
  | { kind: "identical" } // still clean under the current profile — NOT a provable claim that nothing changed, just that nothing currently flags
  | { kind: "changed_flagged"; matches: AttributedMatch[] };

/**
 * Per match, decide whether it reads as a reformulation (this exact term was already being
 * screened for when the item was saved) or a profile change (it wasn't — and which kind of change).
 *
 * "Already being screened for" means all of: its category was active in the saved snapshot AND the
 * user hadn't excluded that ingredient AND (for a custom term) it was in the snapshot's custom list.
 * `ingredientTermById` (the dictionary's id → term map) is needed to tell whether a term matched
 * through a category was one the user had excluded at save time; without it that check is skipped.
 */
export function attributeRecheckMatches(
  matches: Match[],
  oldSnapshot: ProfileSnapshot,
  ingredientTermById: Map<string, string> = new Map()
): AttributedMatch[] {
  const oldCategories = new Set(oldSnapshot.activeCategoryIds);
  const oldCustom = new Set(oldSnapshot.customIngredients.map((c) => c.toLowerCase()));
  // term -> id of the ingredient the user had excluded when the item was saved
  const oldExcludedIdByTerm = new Map<string, string>();
  for (const id of oldSnapshot.excludedIngredientIds) {
    const term = ingredientTermById.get(id);
    if (term) oldExcludedIdByTerm.set(term.toLowerCase(), id);
  }

  return matches.map((m): AttributedMatch => {
    const term = m.term.toLowerCase();
    // A custom term the user already had at save time was being screened for, however it matched now.
    if (oldCustom.has(term)) return { ...m, attribution: { kind: "reformulation" } };
    if (m.categoryId == null) {
      return { ...m, attribution: { kind: "profile_change", cause: "custom_added" } };
    }
    if (!oldCategories.has(m.categoryId)) {
      return { ...m, attribution: { kind: "profile_change", cause: "category_added" } };
    }
    const excludedId = oldExcludedIdByTerm.get(term);
    if (excludedId) {
      return { ...m, attribution: { kind: "profile_change", cause: "ingredient_included", ingredientId: excludedId } };
    }
    return { ...m, attribution: { kind: "reformulation" } };
  });
}

/** Evaluate a completed recheck scan (docs/07 §7.1). `matches`/`isClean` come
 * from a fresh scan run against the item's own profile (see recheck-capture.tsx —
 * never the globally active profile). */
export function evaluateRecheck(
  isClean: boolean,
  matches: Match[],
  oldSnapshot: ProfileSnapshot,
  ingredientTermById?: Map<string, string>
): RecheckOutcome {
  if (isClean) return { kind: "identical" };
  return { kind: "changed_flagged", matches: attributeRecheckMatches(matches, oldSnapshot, ingredientTermById) };
}
