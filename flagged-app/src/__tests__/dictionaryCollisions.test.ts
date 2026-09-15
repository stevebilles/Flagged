import ingredientsData from "../../assets/data/ingredients.json";
import { levenshtein } from "../matching/levenshtein";

/**
 * Proactive audit (docs, 2026-09-14): checks every single-word term in the
 * bundled dictionary against every other single-word term for exactly the
 * kind of close-spelling collision that caused real false positives on
 * actual scans — "malt" fuzzy-matching "salt", "sunflower" fuzzy-matching
 * "safflower". Those were both found reactively, one at a time, by a user
 * hitting them on a real label. This test finds them ahead of time instead,
 * any time the dictionary changes (a new category, a new synonym added),
 * so a new collision fails CI/local test runs rather than shipping quietly.
 *
 * Deliberately mirrors matcher.ts's real fuzzy-eligibility rules exactly
 * (digit-bearing terms and terms under 5 letters never enter fuzzy matching
 * at all — see matchParagraph) — checking pure edit-distance without those
 * rules produces a flood of false alarms (e.g. every E-number is 1 edit
 * from several others, but E-numbers are exact-match-only and can never
 * actually collide).
 *
 * Scope: single-word terms only, matching matcher.ts's single-word fuzzy
 * path. Multi-word phrase collisions ("sunflower oil" / "safflower oil")
 * go through different matching logic (a same-length window over
 * consecutive label words) and aren't covered by this particular audit —
 * a known gap, not an oversight.
 */

function maxAllowedEdits(length: number): number {
  if (length <= 9) return 1;
  if (length <= 14) return 2;
  return 3;
}

function eligibleAsTerm(term: string): boolean {
  return term.length >= 5 && !/\d/.test(term);
}

/**
 * Pairs a human has looked at and accepted — because both terms land in
 * the SAME category, a fuzzy mix-up between them still correctly warns the
 * user about the same allergen, just possibly under the wrong specific
 * name. Sorted alphabetically, joined with "|". Add a new pair here only
 * after checking both terms' categories the same way (see the source
 * category files under the project root, e.g. "Big-9 Allergens/*.md") —
 * if they're in DIFFERENT categories, that's a real bug: fix it in
 * matcher.ts (COMMON_LABEL_WORDS or NEVER_FUZZY), don't just allowlist it.
 */
const REVIEWED_COLLISIONS = new Set<string>([
  "albumen|albumin", // both Egg — alternate terms for the same egg protein
  "crawfish|crayfish", // both Shellfish — alternate spellings of the same creature
  "tahina|tahini", // both Sesame — alternate spellings of the same sesame paste
]);

describe("dictionary self-collision audit (docs/matcher.ts fuzzy tolerance)", () => {
  it("has no unreviewed close-collision pairs among single-word terms", () => {
    const terms = Array.from(
      new Set(
        (ingredientsData.ingredients as { term: string }[])
          .map((i) => i.term.toLowerCase().trim())
          .filter((t) => t.length > 0 && !t.includes(" "))
      )
    );
    expect(terms.length).toBeGreaterThan(0); // sanity — a broken import shouldn't silently pass

    const unreviewed: string[] = [];
    for (let i = 0; i < terms.length; i++) {
      for (let j = i + 1; j < terms.length; j++) {
        const a = terms[i];
        const b = terms[j];
        if (Math.abs(a.length - b.length) > 2) continue;
        const dist = levenshtein(a, b);
        if (dist === 0) continue;
        const risky =
          (eligibleAsTerm(a) && dist <= maxAllowedEdits(a.length)) ||
          (eligibleAsTerm(b) && dist <= maxAllowedEdits(b.length));
        if (!risky) continue;
        const key = [a, b].sort().join("|");
        if (!REVIEWED_COLLISIONS.has(key)) unreviewed.push(key);
      }
    }

    if (unreviewed.length > 0) {
      throw new Error(
        `Found ${unreviewed.length} unreviewed close-collision pair(s) in the ingredient dictionary — two ` +
          `different terms close enough that OCR noise on one could fuzzy-match the other:\n` +
          unreviewed.join("\n") +
          `\n\nFor each: check both terms' categories. Same category → add to REVIEWED_COLLISIONS above with a ` +
          `comment. Different categories → this is a real false-positive risk; fix it in matcher.ts (add the ` +
          `more common/generic side to COMMON_LABEL_WORDS if it's an ordinary word, or to NEVER_FUZZY if not) ` +
          `and add a regression test, same pattern as the farina/farine and malt/salt fixes.`
      );
    }
  });
});
