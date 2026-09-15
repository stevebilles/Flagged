import type { Match } from "../matching/matcher";
import type { RecheckOutcome } from "../domain/recheckEngine";
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
  /** The profile(s) this scan was evaluated for — one id for a normal scan,
   * every real profile's id for an "All" scan. Results uses this to commit
   * per-profile stats to the right profile(s) (docs/17). */
  profileIds?: string[];
}

/** Hand-off from the recheck capture screen to the recheck-result screen
 * (docs/07 §7.1). No ingredient text — the redesigned recheck never stores
 * or passes it; `outcome` already carries each match's attribution. */
export interface RecheckHandoff {
  itemId: string;
  brandName: string;
  productName: string;
  outcome: RecheckOutcome;
}
