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

/** True if the capture looks like an ingredient list (docs/06 validation). */
export function looksLikeIngredientList(raw: string): boolean {
  // The header word, tolerant of OCR garble and French ("ingrédients").
  if (/ingr[ée]?d|dients|contains|contient/i.test(raw)) return true;
  // Header may have OCR'd badly — accept a long, comma-dense capture too.
  const commas = (raw.match(/,/g) ?? []).length;
  return raw.trim().length >= 60 && commas >= 5;
}
