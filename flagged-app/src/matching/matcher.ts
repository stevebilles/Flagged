import { levenshtein, similarity } from "./levenshtein";
import { normalizeParagraph, regexClean } from "./normalize";
import type { Classification } from "../domain/types";

/** Hybrid matcher: normalize → whole-word/phrase presence → fuzzy (docs/06 Step 3). */

/**
 * How many OCR-style letter errors (dropped, added, or swapped) a word can
 * have and still count as the same word — scaled by length instead of a flat
 * similarity percentage.
 *
 * A flat 85%-similarity cutoff sounds forgiving but isn't, for the word
 * lengths that actually matter here: it takes a word of ~7+ letters to
 * survive even ONE typo at 85% (a single edit on a 5-letter word like
 * "yeast" only scores 80%). Most real allergen words are shorter than that
 * — "milk" (4), "wheat" (5), "yeast" (5), "gluten"/"peanut"/"walnut"/
 * "cashew"/"almond"/"sesame" (6) — so a single Vision misread on exactly
 * the word a scan needs to catch ("Neast" for "Yeast", a real 2026-09-13
 * capture) fell through the fuzzy net entirely under the old threshold.
 * This directly caused a safety gap, not just a cosmetic display issue: the
 * red-flag TERM could still be present on the label while failing to match.
 *
 * Doesn't touch words under 4 letters — those stay exact-match-only, same
 * as before (see the `term.length < 4` / `termWord.length < 4` guards
 * below): a 3-letter word is too short to fuzzy-match safely regardless of
 * scaling ("oil" is 1 edit from "ail", "owl", "oid" — real, unrelated
 * words), which is exactly what the "still requires a short word... to
 * match exactly" regression test guards.
 */
function maxAllowedEdits(length: number): number {
  if (length <= 6) return 1;
  if (length <= 9) return 2;
  return 3;
}

export interface Match {
  token: string; // the offending text from the label
  term: string; // the red-flag term it matched
  kind: "exact" | "fuzzy";
  score: number; // 1 for exact, similarity ratio for fuzzy
  /**
   * The filter that caught this term (category name, or "Custom ingredient"), and
   * its classification badge (docs/09). Populated by the scan/recheck layer (see
   * attributeMatches); the pure matcher leaves both undefined.
   */
  categoryName?: string;
  classification?: Classification;
  /** Which profile(s) this term belongs to — only set for an "All profiles" scan. */
  profileNames?: string[];
}

export interface ScanResult {
  tokens: string[];
  matches: Match[];
  isClean: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A term is "present" if it appears as a whole word / phrase in `haystack`
 * (case-insensitive). Boundaries are non-alphanumeric so "milk" hits "skim milk"
 * and "contains: milk" but NOT "buttermilk"; "vegetable oil" hits even when an
 * OCR stop glued it to the next word ("vegetable oil. tomato").
 */
function findPresence(term: string, haystack: string): { index: number; text: string } | null {
  const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}(?![a-z0-9])`, "i");
  const m = re.exec(haystack);
  return m ? { index: m.index, text: m[0] } : null;
}

/**
 * Run a normalized paragraph against the profile's effective red-flag terms.
 * Returns one match per matched term. Longer phrases win: if "peanut butter"
 * matches, the "butter" inside it is not also reported.
 */
export function matchParagraph(rawParagraph: string, redFlagTerms: string[]): ScanResult {
  const normalized = normalizeParagraph(rawParagraph);
  // Digit→letter cleanup recovers OCR garble ("0ils" → "oils") but corrupts
  // dye codes ("red 40" → "red 4o"), so only use it for digit-free terms.
  const cleaned = regexClean(normalized);
  const words = normalized.split(/[^a-z0-9]+/i).filter(Boolean);
  // Position-aware word list — needed for the multi-word fuzzy fallback below
  // to report a real, highlightable start/end span; `words` above (used by
  // the existing single-word path and the returned `tokens` field) discards
  // position on purpose and is left untouched.
  const wordMatches = [...normalized.matchAll(/[a-z0-9]+/gi)];
  // Which printed ingredient this word belongs to (Steve's observation,
  // 2026-09-13: real labels separate ingredients with a comma OR a bullet
  // dot — "Maize, Rice, Seasoning" vs "Enriched wheat flour • Sugars •
  // Yeast" — and that's the true, structural signal for where one
  // ingredient ends and the next begins, not something the word-only fuzzy
  // window below could otherwise know). Increments every time a real
  // inter-ingredient separator sits between two words, so a multi-word
  // fuzzy window (below) can be restricted to never span two different
  // ingredients — closing off a theoretical, if rare, false-match path.
  const BOUNDARY_RE = /[,•·∙‣▪]/;
  const segmentOf: number[] = [];
  for (let i = 0; i < wordMatches.length; i++) {
    if (i === 0) {
      segmentOf.push(0);
    } else {
      const prev = wordMatches[i - 1];
      const between = normalized.slice(prev.index! + prev[0].length, wordMatches[i].index!);
      segmentOf.push(segmentOf[i - 1] + (BOUNDARY_RE.test(between) ? 1 : 0));
    }
  }

  const terms = [...new Set(redFlagTerms.map((t) => t.toLowerCase().trim()))].filter(Boolean);

  type Hit = Match & { start: number; end: number };
  const hits: Hit[] = [];

  for (const term of terms) {
    const hasDigit = /\d/.test(term);
    const found =
      findPresence(term, normalized) ?? (hasDigit ? null : findPresence(term, cleaned));
    if (found) {
      hits.push({
        token: found.text,
        term,
        kind: "exact",
        score: 1,
        start: found.index,
        end: found.index + term.length,
      });
      continue;
    }

    if (hasDigit) continue; // never fuzzy a dye code / E-number — see regression test below

    const termWords = term.split(" ");
    if (termWords.length === 1) {
      // Fuzzy — single-word terms, against individual label words.
      if (term.length < 4) continue;
      let best: Hit | null = null;
      for (const w of words) {
        if (Math.abs(w.length - term.length) > 2) continue;
        if (levenshtein(w, term) > maxAllowedEdits(term.length)) continue;
        const score = similarity(w, term);
        if (!best || score > best.score) {
          const at = normalized.indexOf(w);
          best = { token: w, term, kind: "fuzzy", score, start: at, end: at + w.length };
        }
      }
      if (best) hits.push(best);
      continue;
    }

    // Fuzzy — multi-word terms ("sunflower oil"), against a same-length
    // window of consecutive label words. A real device miss (2026-09-13):
    // "Sunfiower oil" (an l→i OCR slip) never matched "sunflower oil"
    // because multi-word terms were excluded from fuzzy matching entirely —
    // only an exact substring counted. Each word in the window must match
    // (exactly, or fuzzily if it's long enough to compare safely — a short
    // word like "oil" must match exactly, since 3 letters is too little to
    // judge similarity on); the window's score is its worst-matching word,
    // so one confidently-fuzzy word can't drag in a match on the strength
    // of the others alone. The window must also stay within a single
    // printed ingredient (segmentOf above) — never blend the tail of one
    // ingredient with the head of the next just because the words happen
    // to resemble a red-flag phrase.
    let best: Hit | null = null;
    for (let i = 0; i + termWords.length <= wordMatches.length; i++) {
      if (segmentOf[i] !== segmentOf[i + termWords.length - 1]) continue;
      let minScore = Infinity;
      let ok = true;
      for (let j = 0; j < termWords.length; j++) {
        const labelWord = wordMatches[i + j][0];
        const termWord = termWords[j];
        let score: number;
        if (labelWord === termWord) {
          score = 1;
        } else if (
          termWord.length < 4 ||
          Math.abs(labelWord.length - termWord.length) > 2 ||
          levenshtein(labelWord, termWord) > maxAllowedEdits(termWord.length)
        ) {
          ok = false;
          break;
        } else {
          score = similarity(labelWord, termWord);
        }
        if (score < minScore) minScore = score;
      }
      if (!ok) continue;
      if (!best || minScore > best.score) {
        const start = wordMatches[i].index!;
        const lastWord = wordMatches[i + termWords.length - 1];
        const end = lastWord.index! + lastWord[0].length;
        best = { token: normalized.slice(start, end), term, kind: "fuzzy", score: minScore, start, end };
      }
    }
    if (best) hits.push(best);
  }

  // Drop hits fully covered by a longer hit ("butter" inside "peanut butter").
  const matches: Match[] = hits
    .filter(
      (a) =>
        !hits.some(
          (b) => b !== a && b.start <= a.start && b.end >= a.end && b.end - b.start > a.end - a.start
        )
    )
    .sort((a, b) => a.start - b.start)
    .map(({ token, term, kind, score }) => ({ token, term, kind, score }));

  return { tokens: words, matches, isClean: matches.length === 0 };
}
