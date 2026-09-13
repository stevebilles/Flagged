import { similarity } from "../matching/levenshtein";

/**
 * Cross-checks multiple independent OCR reads of the SAME physical content
 * against each other to reduce individual letter-level misreads (docs/06,
 * 2026-09-13) — a real limit of on-device OCR on small, curved, glossy
 * print that no amount of extraction/matching logic can fully eliminate,
 * but that redundant confirmation photos can meaningfully reduce.
 *
 * The evidence this is built on: every observed misread on a real device
 * has been a dropped or substituted letter within an otherwise-recognizable
 * word ("Seasoning" -> "scasoning", "Yeast" -> "east") — never the exact
 * same word garbled identically twice across separate captures. That means
 * these errors are largely independent, random noise per shot, not a fixed
 * defect — so taking a few photos of the same already-confirmed-good view
 * and voting on each word is a real accuracy technique here, not wishful
 * thinking. It cannot fix a mistake every read happens to share (e.g. a
 * persistent glare from holding the exact same angle throughout), and it
 * never invents a word that only one read ever saw — it only ever picks
 * among things the camera actually reported.
 */

const GAP_PENALTY = 0.6; // cost of leaving a word unmatched rather than aligning it to something dissimilar
const MIN_MATCH_SIMILARITY = 0.5; // below this, two words are treated as genuinely different, not a typo of each other

/**
 * Aligns two word sequences using edit-distance-style dynamic programming,
 * where the cost of pairing two words is based on their string similarity
 * (near 0 for identical/near-identical words) rather than a flat match/
 * no-match cost — so "Seasoning" correctly aligns with "scasoning" instead
 * of being treated as two unrelated words either side of a gap. Returns
 * pairs in sequence order; a `null` on one side means that word had no
 * good counterpart in the other sequence (the two reads disagreed on
 * whether it's there at all, not just how it's spelled).
 */
export function alignWords(a: string[], b: string[]): Array<[string | null, string | null]> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i * GAP_PENALTY;
  for (let j = 1; j <= m; j++) dp[0][j] = j * GAP_PENALTY;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = 1 - similarity(a[i - 1], b[j - 1]);
      dp[i][j] = Math.min(dp[i - 1][j - 1] + subCost, dp[i - 1][j] + GAP_PENALTY, dp[i][j - 1] + GAP_PENALTY);
    }
  }

  const pairs: Array<[string | null, string | null]> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const subCost = 1 - similarity(a[i - 1], b[j - 1]);
      if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + subCost)) < 1e-9) {
        pairs.push([a[i - 1], b[j - 1]]);
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && Math.abs(dp[i][j] - (dp[i - 1][j] + GAP_PENALTY)) < 1e-9) {
      pairs.push([a[i - 1], null]);
      i--;
      continue;
    }
    pairs.push([null, b[j - 1]]);
    j--;
  }
  pairs.reverse();
  return pairs;
}

/**
 * Progressively folds each text's words into a running list of "candidate
 * sets" — one per aligned position, keeping every read's spelling at that
 * position instead of collapsing to a single guess early, so a genuine
 * majority vote is possible once every read has been folded in. Each new
 * text is aligned against the position's FIRST candidate so far (a stable,
 * consistent anchor across every merge).
 */
function buildCandidateSkeleton(texts: string[]): string[][] {
  const wordLists = texts.map((t) => t.split(/\s+/).filter(Boolean)).filter((w) => w.length > 0);
  if (wordLists.length === 0) return [];

  let skeleton: string[][] = wordLists[0].map((w) => [w]);
  for (let k = 1; k < wordLists.length; k++) {
    const representative = skeleton.map((candidates) => candidates[0]);
    const pairs = alignWords(representative, wordLists[k]);
    const next: string[][] = [];
    let skelIdx = 0;
    for (const [repWord, newWord] of pairs) {
      if (repWord !== null) {
        const candidates = skeleton[skelIdx];
        skelIdx++;
        next.push(newWord !== null ? [...candidates, newWord] : candidates);
      } else if (newWord !== null) {
        next.push([newWord]);
      }
    }
    skeleton = next;
  }
  return skeleton;
}

/** Picks the winner among one position's candidate spellings: an outright
 * majority/plurality if two or more reads agree, otherwise the longest
 * candidate (a dropped character always shortens a word — the most common
 * real misread seen on device), otherwise the first read as a last resort. */
function pickWinner(candidates: string[]): string {
  if (candidates.length === 1) return candidates[0];
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = candidates[0];
  let bestCount = 0;
  for (const [word, count] of counts) {
    if (count > bestCount) {
      best = word;
      bestCount = count;
    }
  }
  if (bestCount > 1) return best; // two or more reads genuinely agreed
  return candidates.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * Reconciles 2+ independent OCR reads of the SAME content into one, word
 * by word. Callers decide when reads are close enough to be worth
 * reconciling in the first place (combineBurst, burst.ts, treats this as
 * strictly separate from stitching genuinely different, complementary
 * portions of a long label together).
 */
export function reconcileTexts(...texts: string[]): string {
  const nonEmpty = texts.map((t) => t.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "";
  if (nonEmpty.length === 1) return nonEmpty[0];
  return buildCandidateSkeleton(nonEmpty)
    .map(pickWinner)
    .filter(Boolean)
    .join(" ");
}
