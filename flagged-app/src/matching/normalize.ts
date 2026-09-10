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
 * A real label is surrounded by a second language, a nutrition panel, marketing
 * and a barcode. We:
 *   1. jump to the ingredient header ("Ingredients:", "Ingrédients :", and OCR
 *      garble around it), preferring the English section on bilingual labels;
 *   2. stop at the first strong "we've left the list" signal — the other
 *      language's header, a nutrition-panel word, a "% or more/less" line, a run
 *      of bare percentages, "Serving Suggestion", etc.;
 *   3. let a trailing "Contains:" allergen line finish, then drop the rest;
 *   4. re-insert the separators the OCR dropped (bullets read as nothing, "o" or
 *      "." — a lowercase word followed by a Title-Case word starts a new item).
 * Falls back to the raw text when no header is found or the result is too short.
 */
const HEADER_RE = /ingr[eé]?[a-z]{0,3}ients?\s*:?\s*/gi;
const CONTAINS_RE = /\b[co][ao]nt[a-z]*\s*:/i; // Contains: / Contient: / OCR garble

// A nutrient label immediately followed by an amount, or another "we've left the
// list" marker. Nutrient words are only a stop when a number follows — so
// "Sodium phosphate" / "Soy protein" stay in the list but "Sodium 210mg" ends it.
const STOP_RE = new RegExp(
  [
    "nutrition\\s*facts?",
    "valeur\\s*nutritive",
    "serving\\s+suggestion",
    "pr[eé]sentation\\s+sugg[eé]r",
    "\\bdaily\\s+value\\b",
    "%\\s*(?:dv|vq)\\b",
    "\\b(?:per|par)\\s+\\d+\\s*(?:g|ml)\\b",
    "\\b(?:calories?|cholest[eé]rol|sodium|potassium|calcium|protein|prot[eé]ines?|" +
      "carbohydrates?|glucides?|fib(?:re|er)s?|sugars?|sucres?|iron|fer|lipides?|" +
      "satur(?:ated|[eé]s?)|trans)\\b\\s*/?\\s*[a-zâàäéèêëïîôùûü]*\\s*\\d",
    "manufactured\\s+(?:for|by)",
    "distributed\\s+by",
    "fabriqu[eé]\\s+(?:pour|par)",
    "best\\s+before|meilleur\\s+avant",
    "\\brecipe\\b|\\brecette\\b",
  ].join("|"),
  "i"
);

// Nutrition-panel bleed that lands mid-capture: "*5% or less is a little",
// bare %DV runs, standalone gram/mg amounts.
const INLINE_NOISE_RE = new RegExp(
  [
    "\\*?\\s*\\d{1,3}\\s*%\\s*(?:or|ou)\\s+(?:less|more|moins|plus)[^.]{0,40}?(?:a lot|beaucoup|little|peu)\\.?",
    "(?:\\b\\d{1,3}\\s*%[\\s,]*){2,}",
    "\\b\\d+(?:\\.\\d+)?\\s*m?g\\b",
  ].join("|"),
  "gi"
);

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

  // End of the list, in priority order:
  //   1. the "Contains:" allergen line finishing at its period;
  //   2. otherwise a nutrition / marketing stop marker;
  //   3. never past the next-language ingredient header.
  let cut = text.length;
  const window = text.slice(chosen.after, chosen.after + 2000);
  const cont = CONTAINS_RE.exec(window);
  if (cont) {
    const cAbs = chosen.after + cont.index + cont[0].length;
    const dot = text.slice(cAbs).search(/\.(?:\s|$)/);
    cut = dot >= 0 && dot < 200 ? cAbs + dot + 1 : cAbs + 120;
  } else {
    const stop = STOP_RE.exec(window);
    if (stop && stop.index > 8) cut = chosen.after + stop.index;
  }
  for (const h of heads) if (h.at > chosen.after && h.at < cut) cut = h.at;

  let body = text.slice(chosen.after, cut).replace(INLINE_NOISE_RE, " ");

  // Is this a Title-Case label (every word capitalised)? Measure on the list
  // itself, not the ALL-CAPS-ish "Contains:" line.
  const head = body.split(CONTAINS_RE)[0] || body;
  const hw = head.split(/\s+/).filter(Boolean);
  const capRatio = hw.length ? hw.filter((w) => /^[A-Z]/.test(w)).length / hw.length : 0;

  body = body.replace(/\s*[•·∙‣▪]\s*/g, ", "); // real bullets → commas
  if (capRatio < 0.6) {
    // Sentence-case list ("Enriched wheat flour • Yeast • Salt"): a Title-Case
    // word after a lowercase word or ")" begins a new item, so re-insert the
    // separator the OCR dropped. Skipped for labels that Title-Case every word.
    body = body
      .replace(/(\S)\s+[o.]\s+(?=[A-Z])/g, "$1, ") // bullet misread as "o" / "."
      .replace(/\)\s+(?=[A-Z])/g, "), ")
      .replace(/([a-zâàäéèêëïîôùûü])(?=[A-Z][a-z])/g, "$1, ") // items OCR ran together ("flourCorn")
      .replace(/([a-zâàäéèêëïîôùûü])\s+(?=[A-Z][a-zA-Z])/g, "$1, "); // dropped separator
  }
  body = body
    .replace(/\s*,\s*(?:,\s*)+/g, ", ")
    .replace(/\s+([,.)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;.]+/, "")
    .replace(/[\s,;]+$/, "") // keep a trailing period (end of the "Contains." line)
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
