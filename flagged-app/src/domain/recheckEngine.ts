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
  | { kind: "reformulation" } // this category/term was already being watched for and still wasn't there before — the ingredient itself is presumably new
  | { kind: "profile_change" }; // this category/term wasn't in the old snapshot — a filter change, not necessarily a product change. Date enrichment (ProfileChangeLog lookup) happens at the UI layer, which has DB access.

export type AttributedMatch = Match & { attribution: MatchAttribution };

export type RecheckOutcome =
  | { kind: "identical" } // still clean under the current profile — NOT a provable claim that nothing changed, just that nothing currently flags
  | { kind: "changed_flagged"; matches: AttributedMatch[] };

/**
 * Per match, decide whether it reads as a reformulation (the category/term
 * was already being screened for, so the ingredient itself is presumably
 * new) or a profile change (the filter itself is what's new). For a custom
 * ingredient (categoryId null), compare the term directly against the
 * snapshot's custom list instead.
 */
export function attributeRecheckMatches(matches: Match[], oldSnapshot: ProfileSnapshot): AttributedMatch[] {
  const oldCategories = new Set(oldSnapshot.activeCategoryIds);
  const oldCustom = new Set(oldSnapshot.customIngredients.map((c) => c.toLowerCase()));
  return matches.map((m) => {
    const wasWatchedFor = m.categoryId != null ? oldCategories.has(m.categoryId) : oldCustom.has(m.term.toLowerCase());
    return { ...m, attribution: { kind: wasWatchedFor ? "reformulation" : "profile_change" } };
  });
}

/** Evaluate a completed recheck scan (docs/07 §7.1). `matches`/`isClean` come
 * from a fresh scan run against the item's own profile (see recheck-capture.tsx —
 * never the globally active profile). */
export function evaluateRecheck(isClean: boolean, matches: Match[], oldSnapshot: ProfileSnapshot): RecheckOutcome {
  if (isClean) return { kind: "identical" };
  return { kind: "changed_flagged", matches: attributeRecheckMatches(matches, oldSnapshot) };
}
