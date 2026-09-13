import { longestCommonSubstringLength } from "../matching/levenshtein";
import { looksSpatiallyComplete, looksTextuallyComplete } from "./completeness";
import { stitch } from "./stitch";
import type { SpatialBlock } from "./recognition";

/** One photo's OCR result from the capture burst (docs/06/14). */
export interface BurstShot {
  text: string;
  blocks: SpatialBlock[];
}

/**
 * Combine 2–3 full-resolution still photos taken while panning across a
 * label into the single best raw text to hand to extractIngredientList.
 *
 * Replaces the old approach of stitching together many small, noisy
 * live-preview frames (whose relative order could drift as the phone
 * naturally moved between frames, scrambling English/French/nutrition text
 * together — the real bug behind a 2026-09-13 report). A burst of a
 * handful of real, full-resolution photos taken deliberately during a
 * steady pan is both higher-quality input and, critically, naturally
 * temporally ordered (the user panned start to end), so there's no
 * per-frame re-ordering to get wrong.
 *
 * Two situations, handled differently:
 *  - The label fit entirely in one shot (the common case for most flat or
 *    only mildly curved packaging): one or more of the burst photos
 *    independently reads as a complete capture (see completeness.ts). Pick
 *    the longest complete one and use it alone — the other shots are
 *    near-duplicates of the same content from slightly different angles,
 *    and concatenating them would repeat the ingredient list 2-3 times.
 *  - The label is long or wraps around a curved surface and no single shot
 *    saw all of it: drop near-duplicate/subset shots, then stitch what's
 *    left in capture order (a real pan sweep) using the overlapping seam
 *    each adjacent pair of photos should share.
 */
export function combineBurst(shots: BurstShot[]): string {
  const candidates = shots.filter((s) => s.text.trim().length > 0);
  if (candidates.length === 0) return "";
  if (candidates.length === 1) return candidates[0].text;

  // Either signal is enough — see completeness.ts for why they're
  // deliberately independent checks (one geometric, one structural).
  const complete = candidates.filter((s) => looksSpatiallyComplete(s.blocks) || looksTextuallyComplete(s.text));
  if (complete.length > 0) {
    return complete.reduce((best, c) => (c.text.length > best.text.length ? c : best)).text;
  }

  const deduped = dedupeByOverlap(candidates.map((c) => c.text));
  return deduped.reduce((acc, text) => stitch(acc, text), "");
}

/**
 * Drop any text that's essentially already covered by another (near-
 * duplicate or fully-contained captures — e.g. the user held mostly still
 * and every shot saw roughly the same, still-incomplete view), keeping the
 * longer/more complete one of each overlapping pair. What's left are texts
 * that genuinely differ, safe to hand to `stitch()`.
 */
function dedupeByOverlap(texts: string[]): string[] {
  const kept: string[] = [];
  for (const text of texts) {
    let mergedIntoExisting = false;
    for (let i = 0; i < kept.length; i++) {
      if (isSubsumed(text, kept[i])) {
        if (text.length > kept[i].length) kept[i] = text;
        mergedIntoExisting = true;
        break;
      }
    }
    if (!mergedIntoExisting) kept.push(text);
  }
  return kept;
}

/** True when the shorter of `a`/`b` is almost entirely one contiguous run
 * also found in the other — a near-duplicate capture, not new content. */
function isSubsumed(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  if (shorter.length < 20) return false; // too short to judge reliably
  return longestCommonSubstringLength(a, b) / shorter.length >= 0.8;
}
