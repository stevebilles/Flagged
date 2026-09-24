import { RECHECK_DAYS } from "./types";
import { elapsedSince } from "./time";

/**
 * How many Pantry items are due for a recheck (last verified MORE than
 * RECHECK_DAYS ago). Drives the red dot on the Pantry tab and matches the rule
 * the Pantry screen itself uses for its "Reformulation Checks" list. Elapsed
 * time is clamped at 0, so a device clock that moved backwards never makes an
 * item due early (docs/13).
 */
export function countDuePantryItems(
  items: readonly { lastVerifiedDate: number }[],
  nowMs: number = Date.now()
): number {
  const recheckMs = RECHECK_DAYS * 24 * 60 * 60 * 1000;
  return items.filter((i) => elapsedSince(i.lastVerifiedDate, nowMs) > recheckMs).length;
}
