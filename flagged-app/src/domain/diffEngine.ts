import { matchParagraph, Match } from "../matching/matcher";

/**
 * Pantry recheck "Lite Diff" engine (docs/07 §7.1).
 * Compares newly scanned ingredients against the saved baseline and, if changed,
 * runs the new list through the active red-flag filters.
 */

export interface DiffResult {
  added: string[]; // in new, not in old (reformulation)
  removed: string[]; // in old, not in new (reformulation)
  orderShifted: boolean; // relative order of surviving ingredients changed (skimpflation)
  changed: boolean; // any reformulation or order shift
}

export type RecheckOutcome =
  | { kind: "identical" } // Outcome 1
  | { kind: "changed_safe"; diff: DiffResult } // Outcome 2
  | { kind: "changed_flagged"; diff: DiffResult; matches: Match[] }; // Outcome 3

const norm = (s: string) => s.trim().toLowerCase();

export function diffIngredients(oldList: string[], newList: string[]): DiffResult {
  const oldN = oldList.map(norm);
  const newN = newList.map(norm);
  const oldSet = new Set(oldN);
  const newSet = new Set(newN);

  const added = newList.filter((x) => !oldSet.has(norm(x)));
  const removed = oldList.filter((x) => !newSet.has(norm(x)));

  // Order shift among survivors (present in both), ignoring pure add/remove.
  const survivorsOld = oldN.filter((x) => newSet.has(x));
  const survivorsNew = newN.filter((x) => oldSet.has(x));
  const orderShifted = survivorsOld.join("|") !== survivorsNew.join("|");

  const changed = added.length > 0 || removed.length > 0 || orderShifted;
  return { added, removed, orderShifted, changed };
}

/**
 * Evaluate the three background checks (docs/07 §7.1). The red-flag check only
 * runs when a change is detected.
 */
export function evaluateRecheck(
  oldList: string[],
  newList: string[],
  redFlagTerms: string[]
): RecheckOutcome {
  const diff = diffIngredients(oldList, newList);
  if (!diff.changed) return { kind: "identical" };

  const { matches } = matchParagraph(newList.join(", "), redFlagTerms);
  if (matches.length > 0) return { kind: "changed_flagged", diff, matches };
  return { kind: "changed_safe", diff };
}
