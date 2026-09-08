import { similarity } from "./levenshtein";
import { normalizeParagraph, regexClean } from "./normalize";

/** Hybrid matcher: normalize → whole-word/phrase presence → fuzzy (docs/06 Step 3). */

export const FUZZY_THRESHOLD = 0.85; // 85%+ similarity triggers a flag (docs/06)

export interface Match {
  token: string; // the offending text from the label
  term: string; // the red-flag term it matched
  kind: "exact" | "fuzzy";
  score: number; // 1 for exact, similarity ratio for fuzzy
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

    // Fuzzy — single-word terms only, against individual label words.
    if (term.includes(" ") || term.length < 4) continue;
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
