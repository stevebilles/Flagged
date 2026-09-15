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
 * Doesn't touch words 4 letters or under — those stay exact-match-only
 * (see the `term.length < 5` / `termWord.length < 5` guards below), a
 * boundary raised from 4 to 5 after a real device false positive
 * (2026-09-13): "malt" and "salt" are both genuine, common, unrelated
 * words, exactly 1 edit apart — allowing even 1 edit at length 4 flagged
 * "malt" on a label that only ever said "salt" (present in nearly every
 * ingredient list). At 4 letters, 1 edit changes a quarter of the word —
 * too big a fraction to reliably tell "the same word, misread" from "a
 * different, extremely common word." 5-letter words keep 1-edit tolerance
 * (needed for "Neast" -> "Yeast", the original real miss this was built
 * for) since 5-letter English/ingredient collisions a single edit apart
 * are markedly rarer than 4-letter ones.
 *
 * Stays at 1 edit all the way up to 9 letters, not 2 (real device miss,
 * 2026-09-13): "sunflower" and "safflower" are both genuine, different
 * ingredients, exactly 2 edits apart — a 2-edit allowance at length 9
 * flagged "safflower oil" on a label that only ever said "sunflower oil".
 * 2 edits only kicks in for words long enough (10+ letters) that 2 letters
 * is still a small fraction of the word, the same proportion 1 edit is for
 * a 5-letter word — not a free pass at any length that happens to reach 9.
 */
function maxAllowedEdits(length: number): number {
  if (length <= 9) return 1;
  if (length <= 14) return 2;
  return 3;
}

/**
 * Ordinary, common ingredient-label words — English and French — that are
 * NOT themselves being checked for (docs, 2026-09-14). Used as a
 * countersignal during fuzzy matching: a candidate word that exactly equals
 * one of these, but isn't the term currently being checked, is confidently
 * a real, different, unrelated word — not "the term, misread" — so it's
 * rejected as a fuzzy candidate before the edit-distance check even runs.
 *
 * This exists because the matcher's ONLY vocabulary used to be the profile's
 * dangerous terms — so an ordinary word with no dangerous meaning at all
 * (French "farine," meaning any kind of flour) got force-fit against
 * whichever dangerous term happened to be spelled similarly ("farina," a
 * specific wheat product), for lack of anything else to compare it to. Real
 * device miss (2026-09-14): this false-flagged Wheat on a label whose
 * French section just said "farine" for wheat, soy, and barley flour alike.
 * Giving the matcher a broader "these are just ordinary words" vocabulary
 * fixes the whole class of this mistake at once, not just this one pair —
 * see `dictionaryCollisions.test.ts` for the complementary check (two
 * DIFFERENT dangerous terms colliding with each other, which this list
 * can't help with since neither side is "just an ordinary word").
 *
 * Doesn't need to be exhaustive: an exact real match to your actual list is
 * always caught before fuzzy matching ever runs (see `findPresence` above),
 * so a term missing from this list only means one fewer countersignal for
 * ambiguous fuzzy cases, not a missed real match.
 */
const COMMON_LABEL_WORDS = new Set([
  // English
  "salt", "water", "sugar", "oil", "flour", "milk", "cream", "butter", "cheese",
  "egg", "eggs", "corn", "rice", "wheat", "oats", "yeast", "spice", "spices",
  "natural", "flavor", "flavour", "color", "colour", "starch", "vinegar",
  "extract", "powder", "syrup", "gum", "acid", "vitamin", "protein", "sodium",
  "potassium", "calcium", "iron", "contains", "ingredients",
  // French
  "farine", "sucre", "sucres", "lait", "sel", "sels", "oeuf", "oeufs", "huile",
  "soja", "soya", "ble", "avoine", "orge", "seigle", "levure", "contient",
  "ingredients", "poudre", "extrait", "arome", "naturel", "amidon",
  "maltodextrine", "colorant", "conservateur", "acide", "citrique", "vinaigre",
  "beurre", "fromage", "legume", "legumes", "assaisonnement", "riz", "mais",
  "lecithine", "lactoserum", "moutarde", "noix", "arachide", "poisson",
  "crustace", "sesame", "epice", "epices", "sirop", "miel", "melasse",
  "phosphate", "fer", "vitamine", "proteine", "eau", "sans", "avec", "creme",
]);

/**
 * Single-word terms that must never fuzzy-match at all, even against a word
 * not covered by COMMON_LABEL_WORDS — an escape hatch for a same-vocabulary
 * collision between two genuinely dangerous-sounding terms (neither side an
 * "ordinary word" COMMON_LABEL_WORDS could catch). Empty for now; see
 * `dictionaryCollisions.test.ts` for how those get surfaced before shipping
 * instead of by a user hitting one on a real scan.
 */
const NEVER_FUZZY = new Set<string>([]);

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
  /** Stable category id (null for a custom ingredient) — docs/07 §7.1 recheck
   * attribution needs a real id to compare against a saved snapshot, not the
   * display name categoryName is. */
  categoryId?: string | null;
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

/** Diacritics are preserved through normalizeParagraph (real French OCR
 * output keeps them — "Arôme," "Lécithine" — even though it sometimes
 * doesn't), but COMMON_LABEL_WORDS is written unaccented for maintainability.
 * Stripped at comparison time so a lookup matches either form. */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
      if (term.length < 5 || NEVER_FUZZY.has(term)) continue;
      let best: Hit | null = null;
      for (const w of words) {
        if (Math.abs(w.length - term.length) > 2) continue;
        if (levenshtein(w, term) > maxAllowedEdits(term.length)) continue;
        // w is already known not to exactly equal term (findPresence above
        // would've caught that) — so if it exactly equals some OTHER
        // ordinary word, it's confidently that word, not term misread.
        if (COMMON_LABEL_WORDS.has(stripAccents(w))) continue;
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
          // A word THIS short only needs exact-match protection when it's
          // standing alone (see the single-word path's `< 5` floor and the
          // "malt"/"salt" regression it guards) — here it's locked next to
          // at least one OTHER word from the same phrase that must ALSO
          // independently match. A real device miss (2026-09-13):
          // "Sunflower oll" (an i->l OCR slip, one of the most common OCR
          // confusions) never matched "sunflower oil" because "oil" (3
          // letters) was held to the same exact-match floor as a standalone
          // term. Coincidentally matching BOTH "sunflower" (or another
          // term word) AND a short word 1 edit from "oil" side by side,
          // for text that isn't actually about sunflower oil, is
          // vanishingly unlikely — the adjacent word's own match is the
          // safety net a standalone short word doesn't have. Floor is 3,
          // not 0: a 1-2 letter word ("a", "of") is too small to carry any
          // signal even with a neighbor's help.
          termWord.length < 3 ||
          Math.abs(labelWord.length - termWord.length) > 2 ||
          levenshtein(labelWord, termWord) > maxAllowedEdits(termWord.length) ||
          COMMON_LABEL_WORDS.has(stripAccents(labelWord))
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
