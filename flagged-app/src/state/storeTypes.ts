import type { Match } from "../matching/matcher";
export type { Profile } from "../domain/types";

/** Minimal shape of a scan result handed to the results route. */
export interface ScanResultLike {
  paragraph: string;
  matches: Match[];
  isClean: boolean;
  // set when this scan is a pantry recheck
  recheckItemId?: string;
}
