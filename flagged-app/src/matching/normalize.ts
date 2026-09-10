/** OCR normalization + tokenization (docs/06 Step 2 & Step 3.1). */

/** Regex cleaning of common OCR confusions. Conservative to avoid false positives. */
export function regexClean(token: string): string {
  return token
    .replace(/0/g, "o") // zero -> o
    .replace(/1/g, "l") // one -> l
    .replace(/\|/g, "l") // pipe -> l
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a raw OCR paragraph (docs/06 Step 2):
 *  - lowercase
 *  - strip line-break hyphens (rejoin words split across lines)
 *  - collapse whitespace
 */
export function normalizeParagraph(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/-\s*\n\s*/g, "") // "prese-\nrvative" -> "preservative"
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize on commas and parentheses (docs/06 Step 2). */
export function tokenize(normalized: string): string[] {
  return normalized
    .split(/[,()]/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Isolate just the ingredient list from a raw OCR capture.
 *
 * A real label is surrounded by a second language, nutrition disclaimers,
 * marketing, recipes and a barcode. We:
 *   1. jump to the ingredient header ("Ingredients:", "Ingrédients :", and OCR
 *      garble around it), preferring the English section on bilingual labels;
 *   2. stop at the first terminator — the other language's header, a nutrition
 *      or marketing marker.
 * The allergen "Contains:" line is kept. Inline nutrition disclaimers
 * ("*5% or less is a little…") are stripped. Falls back to the raw text when no
 * header is found or the result comes out too short to trust.
 */
const HEADER_RE = /ingr[eé]?[a-z]{0,3}ients?\s*:?\s*/gi;

const TERMINATOR_RE = new RegExp(
  [
    "nutrition\\s*facts?",
    "valeur\\s*nutritive",
    "manufactured\\s+(?:for|by)",
    "distributed\\s+by",
    "fabriqu[eé]\\s+(?:pour|par)",
    "best\\s+before",
    "meilleur\\s+avant",
    "questions?\\b[^.]{0,30}\\b(?:comments?|call|email|courriel)",
    "\\brecipe\\b",
    "\\brecette\\b",
  ].join("|"),
  "i"
);

// Nutrition footnotes / bare percent runs that sometimes land mid-list.
const INLINE_NOISE_RE =
  /\*?\s*\d{1,3}\s*%\s*(?:or|ou)\s+(?:less|more|moins|plus)[^.,]*?(?:a lot|beaucoup|peu|little)\.?/gi;

export function extractIngredientList(raw: string): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return text;

  const heads: { at: number; after: number }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(HEADER_RE.source, "gi");
  while ((m = re.exec(text))) heads.push({ at: m.index, after: m.index + m[0].length });
  if (heads.length === 0) return text;

  // Prefer the header whose following text is least accented (English section).
  const accents = (s: string) => (s.match(/[éèêàâçëïôûùî]/gi) ?? []).length;
  let chosen = heads[0];
  if (heads.length > 1) {
    let best = Infinity;
    for (const h of heads) {
      const a = accents(text.slice(h.after, h.after + 220));
      if (a < best) {
        best = a;
        chosen = h;
      }
    }
  }

  let end = text.length;
  for (const h of heads) if (h.at > chosen.after && h.at < end) end = h.at; // next-language block
  const term = TERMINATOR_RE.exec(text.slice(chosen.after, end));
  if (term && term.index > 10) end = chosen.after + term.index;

  const body = text
    .slice(chosen.after, end)
    .replace(INLINE_NOISE_RE, " ")
    .replace(/\s*[•·|]\s*/g, ", ") // bullet separators → commas
    .replace(/\s*,\s*(?:,\s*)+/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;.]+|[\s,;.]+$/g, "")
    .trim();

  return body.length >= 12 ? body : text;
}

/** True if the capture looks like an ingredient list (docs/06 validation). */
export function looksLikeIngredientList(raw: string): boolean {
  // The header word, tolerant of OCR garble and French ("ingrédients").
  if (/ingr[ée]?d|dients|contains|contient/i.test(raw)) return true;
  // Header may have OCR'd badly — accept a long, comma-dense capture too.
  const commas = (raw.match(/,/g) ?? []).length;
  return raw.trim().length >= 60 && commas >= 5;
}
