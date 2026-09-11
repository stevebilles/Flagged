import type { Match } from "../matching/matcher";
import type { RecheckOutcome } from "../domain/diffEngine";
export type { Profile } from "../domain/types";

/** Minimal shape of a scan result handed to the results route. */
export interface ScanResultLike {
  paragraph: string;
  matches: Match[];
  isClean: boolean;
  // set when this scan is a pantry recheck
  recheckItemId?: string;
  /** Display label for who this scan was run for — a profile's name, or
   * "all N profiles" — decided at scan time so Results doesn't have to guess
   * from the (possibly since-changed) active profile. */
  scannedFor?: string;
}

/** Hand-off from the recheck capture screen to the recheck-result screen (docs/07). */
export interface RecheckHandoff {
  itemId: string;
  brandName: string;
  productName: string;
  /** The newly scanned ingredient list, ordered as read. */
  newIngredients: string[];
  outcome: RecheckOutcome;
}
