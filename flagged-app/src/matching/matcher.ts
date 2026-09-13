import { similarity } from "./levenshtein";
import { normalizeParagraph, regexClean } from "./normalize";
import type { Classification } from "../domain/types";

/** Hybrid matcher: normalize → whole-word/phrase presence → fuzzy (docs/06 Step 3). */

export const FUZZY_THRESHOLD = 0.85; // 85%+ similarity triggers a flag (docs/06)

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
        const score = similarity(w, term);
        if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
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
    // of the others alone.
    let best: Hit | null = null;
    for (let i = 0; i + termWords.length <= wordMatches.length; i++) {
      let minScore = Infinity;
      let ok = true;
      for (let j = 0; j < termWords.length; j++) {
        const labelWord = wordMatches[i + j][0];
        const termWord = termWords[j];
        let score: number;
        if (labelWord === termWord) {
          score = 1;
        } else if (termWord.length < 4 || Math.abs(labelWord.length - termWord.length) > 2) {
          ok = false;
          break;
        } else {
          score = similarity(labelWord, termWord);
        }
        if (score < minScore) minScore = score;
      }
      if (!ok || minScore < FUZZY_THRESHOLD) continue;
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
