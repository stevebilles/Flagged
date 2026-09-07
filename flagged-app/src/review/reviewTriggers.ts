import * as StoreReview from "expo-store-review";
import { getMetaValue, setMetaValue } from "../db/appMeta";
import { getStats } from "../db/repositories";

/**
 * In-app review triggers (docs/10). Uses the native prompt; the OS rate-limits
 * and may show nothing. Never gate on positive feedback first.
 */

const KEY_REVIEW_REQUESTED = "reviewRequested";
const KEY_FLAGGED_CATCH_COUNT = "ahaFlaggedCatchCount";
const KEY_PREMIUM_INSTALL_AT = "premiumInstalledAt";

async function requestOnce(reasonKey: string): Promise<void> {
  if (getMetaValue(KEY_REVIEW_REQUESTED) === reasonKey) return;
  if (!(await StoreReview.isAvailableAsync())) return;
  await StoreReview.requestReview();
  setMetaValue(KEY_REVIEW_REQUESTED, reasonKey);
}

/**
 * "Aha!" trigger: after the user catches their 5th flagged ingredient during
 * the trial. Must be called AFTER leaving the results screen (docs/10).
 */
export async function onFlaggedResultDismissed(matchesInScan: number): Promise<void> {
  const count = Number(getMetaValue(KEY_FLAGGED_CATCH_COUNT) ?? "0") + matchesInScan;
  setMetaValue(KEY_FLAGGED_CATCH_COUNT, String(count));
  if (count >= 5) await requestOnce("aha");
}

export function markPremiumInstalled(): void {
  if (!getMetaValue(KEY_PREMIUM_INSTALL_AT)) {
    setMetaValue(KEY_PREMIUM_INSTALL_AT, String(Date.now()));
  }
}

/**
 * "Habit" trigger: first app open after 30 days of premium install, OR upon
 * hitting 50 total scans (docs/10). Call on app foreground.
 */
export async function onAppForeground(isPremium: boolean): Promise<void> {
  const totalScans = getStats().totalLabelsRead;
  if (totalScans >= 50) {
    await requestOnce("habit-50-scans");
    return;
  }
  if (isPremium) {
    const at = Number(getMetaValue(KEY_PREMIUM_INSTALL_AT) ?? "0");
    if (at && Date.now() - at >= 30 * 24 * 60 * 60 * 1000) {
      await requestOnce("habit-30-days");
    }
  }
}
