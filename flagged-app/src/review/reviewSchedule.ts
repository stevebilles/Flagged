/**
 * Pure scheduling for the in-app review requests (docs/10). No native or DB
 * imports, so it is unit-testable (src/__tests__/reviewSchedule.test.ts).
 *
 * Three requests, each made at most once, only right after a COMPLETED scan
 * (the user has left the Results screen), measured from when the free trial
 * was activated:
 *   "trial"       — inside the 7-day trial
 *   "post-trial"  — once the trial has ended (day 7 onward)
 *   "day-30"      — 30 or more days after activation
 * At most one is returned per call, in that order.
 */

export type ReviewMoment = "trial" | "post-trial" | "day-30";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 7;
export const FOLLOW_UP_DAYS = 30;

export function nextReviewMoment(input: {
  nowMs: number;
  trialStartMs: number | null;
  asked: readonly ReviewMoment[];
}): ReviewMoment | null {
  const { nowMs, trialStartMs, asked } = input;
  if (trialStartMs == null) return null;

  const elapsed = nowMs - trialStartMs;
  const inTrial = elapsed < TRIAL_DAYS * DAY_MS;

  if (inTrial) return asked.includes("trial") ? null : "trial";
  if (!asked.includes("post-trial")) return "post-trial";
  if (elapsed >= FOLLOW_UP_DAYS * DAY_MS && !asked.includes("day-30")) return "day-30";
  return null;
}

const usable = (ms: number | null): ms is number => ms != null && Number.isFinite(ms) && ms > 0;

/**
 * When the trial was activated: the store's original purchase date if we have
 * it, else the time this device first saw the user as premium.
 */
export function pickTrialStartMs(storeOriginalPurchaseMs: number | null, firstSeenMs: number | null): number | null {
  if (usable(storeOriginalPurchaseMs)) return storeOriginalPurchaseMs;
  if (usable(firstSeenMs)) return firstSeenMs;
  return null;
}
