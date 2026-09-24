/**
 * Pure logic for the in-app "your free trial is ending" banner on Home
 * (docs/08). No native/DB imports, so it's unit-tested
 * (src/__tests__/trialBanner.test.ts).
 *
 * Why a "cancel by" time and not a countdown: Apple only stops the charge if
 * the user cancels at least 24 hours BEFORE the trial ends, so the useful (and
 * calm) thing to show is the actual deadline. We deliberately use in-app
 * banners rather than push notifications.
 */

const HOUR_MS = 60 * 60 * 1000;
/** The banner appears during the last 3 days of the trial. */
export const BANNER_WINDOW_HOURS = 72;
/** Apple: cancel at least this long before the trial ends to avoid the charge. */
export const CANCEL_CUTOFF_HOURS = 24;

export interface TrialInfo {
  /** RevenueCat's periodType for the active entitlement ("TRIAL", "NORMAL", "INTRO"…). */
  periodType: string | null;
  /** False once the user has turned off auto-renew (they've already cancelled). */
  willRenew: boolean;
  /** When the trial ends (ms epoch). */
  expiresAtMs: number;
}

export interface TrialBannerState {
  /** "cancel-window": the user can still cancel in time. "past-cutoff": fewer than 24h left. */
  kind: "cancel-window" | "past-cutoff";
  endsAtMs: number;
  /** endsAtMs minus 24 hours — the last moment cancelling still avoids the charge. */
  cancelByMs: number;
}

export function trialBannerState(info: TrialInfo | null, nowMs: number): TrialBannerState | null {
  if (!info) return null;
  if ((info.periodType ?? "").toLowerCase() !== "trial") return null;
  if (!info.willRenew) return null;
  if (!Number.isFinite(info.expiresAtMs) || info.expiresAtMs <= 0) return null;

  const msLeft = info.expiresAtMs - nowMs;
  if (msLeft <= 0) return null;
  if (msLeft > BANNER_WINDOW_HOURS * HOUR_MS) return null;

  const cancelByMs = info.expiresAtMs - CANCEL_CUTOFF_HOURS * HOUR_MS;
  return {
    kind: nowMs <= cancelByMs ? "cancel-window" : "past-cutoff",
    endsAtMs: info.expiresAtMs,
    cancelByMs,
  };
}
