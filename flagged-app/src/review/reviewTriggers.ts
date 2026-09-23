import * as StoreReview from "expo-store-review";
import { getMetaValue, setMetaValue } from "../db/appMeta";
import { cachedPremiumSinceMs } from "../purchases/purchases";
import { nextReviewMoment, pickTrialStartMs, ReviewMoment } from "./reviewSchedule";

/**
 * In-app review requests (docs/10). Uses the native prompt; the OS rate-limits
 * and may show nothing. Never gate on positive feedback first.
 *
 * The schedule itself (three requests measured from trial activation) lives in
 * reviewSchedule.ts so it can be unit-tested; this file only reads/writes
 * app_meta and calls the native prompt.
 */

const KEY_PREMIUM_INSTALL_AT = "premiumInstalledAt"; // fallback trial start (this device first saw premium)
const MOMENTS: ReviewMoment[] = ["trial", "post-trial", "day-30"];
const askedKey = (m: ReviewMoment) => `reviewAsked:${m}`;

/** Record the first time this device saw the user as premium (fallback trial start). */
export function markPremiumInstalled(): void {
  if (!getMetaValue(KEY_PREMIUM_INSTALL_AT)) {
    setMetaValue(KEY_PREMIUM_INSTALL_AT, String(Date.now()));
  }
}

/**
 * Call after a COMPLETED scan (one that reached the Results screen, clean or
 * flagged), once the user has LEFT that screen — never while they're looking
 * at it (docs/10). Asks for a review if one of the three scheduled requests is
 * due; at most one per call, each at most once ever. Never throws.
 */
export async function onScanCompleted(): Promise<void> {
  try {
    // Scanning requires premium, so a completed scan with no known start date
    // means we just haven't recorded it yet (e.g. dev override): start it now.
    let trialStartMs = pickTrialStartMs(
      cachedPremiumSinceMs(),
      Number(getMetaValue(KEY_PREMIUM_INSTALL_AT)) || null
    );
    if (trialStartMs == null) {
      markPremiumInstalled();
      trialStartMs = Date.now();
    }

    const asked = MOMENTS.filter((m) => getMetaValue(askedKey(m)) === "1");
    const moment = nextReviewMoment({ nowMs: Date.now(), trialStartMs, asked });
    if (!moment) return;
    if (!(await StoreReview.isAvailableAsync())) return;

    await StoreReview.requestReview();
    setMetaValue(askedKey(moment), "1");
  } catch (e) {
    console.warn("review request failed", e);
  }
}
