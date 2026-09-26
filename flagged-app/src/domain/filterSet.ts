import type { Category, ProfileSnapshot } from "./types";

/**
 * The "red flags a profile was scanning for" as a comparable, displayable set — used by the clean
 * recheck screen's "Profile at time of each scan" card (docs/07 §7.1): the filters recorded when the
 * item was saved (its `ProfileSnapshot`) next to the profile's filters today.
 */

const sortedUnique = (xs: string[], lower = false): string[] =>
  [...new Set(xs.map((x) => (lower ? x.toLowerCase() : x)))].sort();

const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** True when both snapshots screen for exactly the same things: the same categories switched on, the
 * same individual ingredients switched off, and the same custom red flags (case-insensitive). The
 * order things were added in doesn't matter. */
export function sameFilterSet(a: ProfileSnapshot, b: ProfileSnapshot): boolean {
  return (
    sameList(sortedUnique(a.activeCategoryIds), sortedUnique(b.activeCategoryIds)) &&
    sameList(sortedUnique(a.excludedIngredientIds), sortedUnique(b.excludedIngredientIds)) &&
    sameList(sortedUnique(a.customIngredients, true), sortedUnique(b.customIngredients, true))
  );
}

/**
 * What a scan checked for — the "What we checked for" card on the scan result (owner's mockup,
 * 2026-09-25). One snapshot for a single-profile scan; several when the scan was run for "all" profiles
 * (everyone's red flags are checked in one pass), in which case it's the union: each category switched
 * on for any of them (dictionary order), then each distinct custom red flag. The "N ingredients turned
 * off" line is only given for a single profile — with several, an ingredient one profile turned off may
 * still have been checked for another, so a count would mislead. Empty when nothing was switched on
 * (unlike `filterSetLines`, which returns a placeholder line) so the screen can say so in its own words.
 */
export function checkedForLines(snapshots: ProfileSnapshot[], categories: Category[]): string[] {
  const active = new Set(snapshots.flatMap((s) => s.activeCategoryIds));
  const lines = categories.filter((c) => active.has(c.id)).map((c) => c.name);
  const seen = new Set<string>();
  for (const term of snapshots.flatMap((s) => s.customIngredients)) {
    if (seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    lines.push(`Custom: ${term}`);
  }
  if (snapshots.length === 1) {
    const off = new Set(snapshots[0].excludedIngredientIds).size;
    if (off > 0 && lines.length > 0) lines.push(`${off} ingredient${off === 1 ? "" : "s"} turned off`);
  }
  return lines;
}

/** The lines shown under "SCANNING FOR": each active category's name (dictionary order), then each
 * custom red flag, then — only when there are any — how many individual ingredients were turned off
 * (so two sets that differ only in exclusions don't look identical). Never empty. */
export function filterSetLines(snapshot: ProfileSnapshot, categories: Category[]): string[] {
  const active = new Set(snapshot.activeCategoryIds);
  const lines = categories.filter((c) => active.has(c.id)).map((c) => c.name);
  for (const term of snapshot.customIngredients) lines.push(`Custom: ${term}`);
  const off = new Set(snapshot.excludedIngredientIds).size;
  if (off > 0) lines.push(`${off} ingredient${off === 1 ? "" : "s"} turned off`);
  return lines.length > 0 ? lines : ["No red flags selected"];
}
