/**
 * Only promise the free trial to people who will actually get it (docs/08).
 *
 * Apple gives one introductory offer per Apple account per subscription group, so
 * returning subscribers, reinstalls and anyone who already used the trial pay
 * right away. Pure logic — no native imports — so it's unit-tested
 * (src/__tests__/trialEligibility.test.ts). The RevenueCat call lives in
 * purchases.ts (`getTrialEligibility`).
 */

/** "checking" = the RevenueCat lookup hasn't finished yet (brief). */
export type TrialEligibility = "checking" | "eligible" | "ineligible" | "unknown";

/**
 * RevenueCat's INTRO_ELIGIBILITY_STATUS: 0 unknown, 1 ineligible, 2 eligible,
 * 3 no intro offer exists for the product. (Numeric here so this file stays free
 * of native imports.)
 */
export function eligibilityFromStatus(status: number | null | undefined): Exclude<TrialEligibility, "checking"> {
  if (status === 2) return "eligible";
  if (status === 1 || status === 3) return "ineligible";
  return "unknown";
}

export interface PaywallCopy {
  /** The "7-day free trial" pill on the price card. */
  showTrialPill: boolean;
  /** The "in-app reminder before your trial ends…" line under the price card. */
  showTrialReminder: boolean;
  cta: string;
  /** The short summary under the button. Always states the price and auto-renewal. */
  summary: string;
}

const TRIAL_COPY: PaywallCopy = {
  showTrialPill: true,
  showTrialReminder: true,
  cta: "Start your 7-day free trial",
  summary:
    "7-day free trial, then $24.99 per year, renewing automatically. No charge today. You'll see an in-app reminder before billing, and you can cancel anytime.",
};

const NO_TRIAL_COPY: PaywallCopy = {
  showTrialPill: false,
  showTrialReminder: false,
  cta: "Subscribe for $24.99/year",
  summary:
    "$24.99 per year, renewing automatically. You'll be charged when you subscribe, and you can cancel anytime.",
};

/**
 * "checking" shows the trial wording (the lookup takes a moment and most people
 * qualify); "unknown" — e.g. offline — deliberately does NOT promise a trial.
 * Apple's own purchase sheet always shows the real terms before anyone confirms.
 */
export function paywallCopy(eligibility: TrialEligibility): PaywallCopy {
  return eligibility === "checking" || eligibility === "eligible" ? TRIAL_COPY : NO_TRIAL_COPY;
}
