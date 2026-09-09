/**
 * Elapsed-time helpers for the 30-day recheck and 24-hour undo windows.
 *
 * A device clock can move backwards (manual change, timezone/DST glitches). We
 * only ever treat *forward* elapsed time as elapsed: if `now < since`, elapsed
 * is 0, so a recheck is simply "not yet due" and a soft-deleted item is "not yet
 * purged" — never the reverse (spec Edge Cases / research R8).
 */

export function elapsedSince(sinceMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, nowMs - sinceMs);
}

export function hasElapsed(sinceMs: number, windowMs: number, nowMs: number = Date.now()): boolean {
  return elapsedSince(sinceMs, nowMs) > windowMs;
}
