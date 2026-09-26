/**
 * How a red-flag term from the dictionary is shown on a result screen. Terms are stored lowercase
 * ("tbhq", "e320", "red 40"); showing them with only the first letter capitalized turned acronyms into
 * "Tbhq" / "Bha" / "E320" (owner, 2026-09-25). Pure, so it's unit-tested.
 */

/** Dictionary terms that are abbreviations and read as all-caps. (E-numbers are matched by pattern.) */
const ACRONYMS = new Set(["bha", "bht", "tbhq", "edta", "msg", "hfcs", "fd&c"]);

export function displayTerm(term: string): string {
  const lower = term.toLowerCase();
  if (ACRONYMS.has(lower) || /^e\d{3}[a-z]?$/.test(lower)) return term.toUpperCase();
  if (lower === "ace-k") return "Ace-K";
  return term.charAt(0).toUpperCase() + term.slice(1);
}
