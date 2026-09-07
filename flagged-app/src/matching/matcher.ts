import { similarity } from "./levenshtein";
import { normalizeParagraph, regexClean, tokenize } from "./normalize";

/** Hybrid matcher: regex clean → exact → fuzzy (docs/06 Step 3). */

export const FUZZY_THRESHOLD = 0.85; // 85%+ similarity triggers a flag (docs/06)

export interface Match {
  token: string; // the offending token from the label
  term: string; // the red-flag term it matched
  kind: "exact" | "fuzzy";
  score: number; // 1 for exact, similarity ratio for fuzzy
}

export interface ScanResult {
  tokens: string[];
  matches: Match[];
  isClean: boolean;
}

/**
 * Run a normalized paragraph's tokens against the profile's effective red-flag
 * terms (all lowercase). Returns every match found.
 */
export function matchParagraph(rawParagraph: string, redFlagTerms: string[]): ScanResult {
  const normalized = normalizeParagraph(rawParagraph);
  const tokens = tokenize(normalized);
  const terms = redFlagTerms.map((t) => t.toLowerCase());
  const termSet = new Set(terms);

  const matches: Match[] = [];
  for (const rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) continue;
    // Cleaned variant recovers from genuine OCR garble. It must NOT replace the
    // raw token, because digit substitutions (0->o, 1->l) would corrupt valid
    // terms like "red 40" / "yellow 5". We try the raw token first, then the
    // cleaned token as a fallback.
    const cleaned = regexClean(token);

    // Exact match — raw first, then cleaned fallback.
    if (termSet.has(token)) {
      matches.push({ token: rawToken, term: token, kind: "exact", score: 1 });
      continue;
    }
    if (cleaned !== token && termSet.has(cleaned)) {
      matches.push({ token: rawToken, term: cleaned, kind: "exact", score: 1 });
      continue;
    }

    // Fuzzy match (Levenshtein similarity >= threshold). Take the best term over
    // both the raw and cleaned variants.
    let best: Match | null = null;
    for (const term of terms) {
      const score = Math.max(similarity(token, term), similarity(cleaned, term));
      if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
        best = { token: rawToken, term, kind: "fuzzy", score };
      }
    }
    if (best) matches.push(best);
  }

  return { tokens, matches, isClean: matches.length === 0 };
}
