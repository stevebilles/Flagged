import Purchases, { CustomerInfo } from "react-native-purchases";
import { Platform } from "react-native";
import { getMetaValue, setMetaValue } from "../db/appMeta";
import type { TrialInfo } from "./trialBanner";
import { eligibilityFromStatus, type TrialEligibility } from "./trialEligibility";

/**
 * RevenueCat wrapper (docs/08). An auto-renewing **annual subscription** ($24.99/yr)
 * with OFFLINE entitlement caching: a subscriber with no connectivity must not be
 * locked out — but unlike a one-time purchase, the cache must expire, or a lapsed
 * subscription would scan free forever offline. See `refreshEntitlement`.
 *
 * Configure API keys via app config / EAS secrets before shipping.
 */

// These identifiers must match your RevenueCat / store dashboard config.
export const PREMIUM_ENTITLEMENT = "premium"; // RevenueCat → Entitlements identifier
export const ANNUAL_PRODUCT_ID = "Flagged_Pro_Annual"; // App Store Connect product ID (iOS) — has the 7-day free-trial offer; must match exactly
export const CURRENT_OFFERING = "default"; // RevenueCat → Offerings (recommended fetch path)

const CACHED_PREMIUM_KEY = "cachedPremium";
const CACHED_EXPIRES_AT_KEY = "cachedPremiumExpiresAt"; // ms epoch, or "" if unknown/none
const CACHED_SINCE_KEY = "cachedPremiumSince"; // ms epoch of the store's original purchase (trial start)
const CACHED_PERIOD_KEY = "cachedPremiumPeriodType"; // RevenueCat periodType, e.g. "TRIAL" / "NORMAL" (drives the Home trial banner)
const CACHED_WILL_RENEW_KEY = "cachedPremiumWillRenew"; // "1" while auto-renew is on, "0" once cancelled

/** Apple's / Google's subscription-management page — where a user cancels. */
export const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: undefined,
});
// How long a subscriber can stay offline before we require a fresh network check
// (a normal offline stretch — road trip, a store basement — shouldn't lock them out).
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// TODO(secrets): replace with real RevenueCat public SDK keys (do not commit real keys).
const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? "";
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? "";

let configured = false;

export function configurePurchases(): void {
  if (configured) return;
  const apiKey = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
  if (!apiKey) {
    // Skeleton mode: no key yet. Offline cached status still works via appMeta.
    return;
  }
  Purchases.configure({ apiKey });
  // Live activation: a purchase that completes outside the paywall's own flow
  // (Ask to Buy approval, a redeemed offer code, a restore on another screen)
  // unlocks the app without waiting for the next launch/foreground refresh.
  // Deliberately activation-only: a "not active" report can come from RevenueCat's
  // own offline cache and must not bypass our offline grace window
  // (isPremiumCached) — lapses are handled by refreshEntitlement() instead.
  Purchases.addCustomerInfoUpdateListener((info) => {
    if (!hasPremium(info)) return;
    cachePremium(true, expiryOf(info), sinceOf(info), trialExtraOf(info));
    entitlementListeners.forEach((cb) => cb(true));
  });
  configured = true;
}

type EntitlementListener = (active: boolean) => void;
const entitlementListeners = new Set<EntitlementListener>();

/** Be told when RevenueCat reports an active entitlement (see configurePurchases). Returns an unsubscribe. */
export function subscribeToEntitlement(cb: EntitlementListener): () => void {
  entitlementListeners.add(cb);
  return () => {
    entitlementListeners.delete(cb);
  };
}

interface CacheExtra {
  periodType?: string | null;
  willRenew?: boolean | null;
}

function cachePremium(
  active: boolean,
  expiresAt: Date | null,
  sinceMs: number | null = null,
  extra: CacheExtra = {}
): void {
  setMetaValue(CACHED_PREMIUM_KEY, active ? "1" : "0");
  setMetaValue(CACHED_EXPIRES_AT_KEY, expiresAt ? String(expiresAt.getTime()) : "");
  // The store's original purchase date (= when the free trial was activated).
  // Only ever set, never cleared — it's the anchor for the review schedule.
  if (active && sinceMs) setMetaValue(CACHED_SINCE_KEY, String(sinceMs));
  // Trial details for the Home banner (docs/08) — cleared whenever there's no active entitlement.
  setMetaValue(CACHED_PERIOD_KEY, active ? extra.periodType ?? "" : "");
  setMetaValue(CACHED_WILL_RENEW_KEY, active && extra.willRenew ? "1" : "0");
  trialInfoListeners.forEach((cb) => cb(cachedTrialInfo()));
}

type TrialInfoListener = (info: TrialInfo | null) => void;
const trialInfoListeners = new Set<TrialInfoListener>();

/** Be told whenever the cached subscription details change (purchase, refresh, restore). Returns an unsubscribe. */
export function subscribeToTrialInfo(cb: TrialInfoListener): () => void {
  trialInfoListeners.add(cb);
  return () => {
    trialInfoListeners.delete(cb);
  };
}

/** The cached trial details behind the Home banner (see trialBanner.ts) — null when not subscribed. */
export function cachedTrialInfo(): TrialInfo | null {
  if (getMetaValue(CACHED_PREMIUM_KEY) !== "1") return null;
  const expiresAtMs = Number(getMetaValue(CACHED_EXPIRES_AT_KEY));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return null;
  return {
    periodType: getMetaValue(CACHED_PERIOD_KEY) || null,
    willRenew: getMetaValue(CACHED_WILL_RENEW_KEY) === "1",
    expiresAtMs,
  };
}

/** When the user first activated the trial/subscription, per the store — null if never seen. */
export function cachedPremiumSinceMs(): number | null {
  const ms = Number(getMetaValue(CACHED_SINCE_KEY));
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * Read cached premium status — works fully offline (docs/08), but only within the
 * grace window past the subscription's known expiry. Past that, a stretch of no
 * connectivity means "can't confirm you're still subscribed" rather than "still
 * premium forever" — the user just falls back to the free gate until we can check.
 */
export function isPremiumCached(): boolean {
  if (getMetaValue(CACHED_PREMIUM_KEY) !== "1") return false;
  const raw = getMetaValue(CACHED_EXPIRES_AT_KEY);
  if (!raw) return true; // no expiry on record yet (e.g. skeleton/dev mode) — trust the flag
  const expiresAt = Number(raw);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt + OFFLINE_GRACE_MS;
}

/** The subscription's known renewal/expiry date, for display ("Renews Sep 11, 2027"). */
export function cachedRenewalDate(): Date | null {
  const raw = getMetaValue(CACHED_EXPIRES_AT_KEY);
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function activeEntitlement(info: CustomerInfo) {
  return info.entitlements.active[PREMIUM_ENTITLEMENT];
}

function hasPremium(info: CustomerInfo): boolean {
  return activeEntitlement(info) !== undefined;
}

function expiryOf(info: CustomerInfo): Date | null {
  const iso = activeEntitlement(info)?.expirationDate;
  return iso ? new Date(iso) : null;
}

function sinceOf(info: CustomerInfo): number | null {
  return activeEntitlement(info)?.originalPurchaseDateMillis ?? null;
}

function trialExtraOf(info: CustomerInfo): CacheExtra {
  const e = activeEntitlement(info);
  return { periodType: e?.periodType ?? null, willRenew: e?.willRenew ?? null };
}

/**
 * Will the store give this user the free trial? Apple allows one introductory offer
 * per Apple account per subscription group, so returning subscribers, reinstalls and
 * anyone who already used it pay right away — the paywall must only promise the trial
 * to people who get it (trialEligibility.ts). Never throws: any failure (offline,
 * not configured) is "unknown", which does NOT promise a trial.
 */
export async function getTrialEligibility(): Promise<Exclude<TrialEligibility, "checking">> {
  if (!configured) return "unknown";
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current ?? offerings.all[CURRENT_OFFERING];
    const productId = offering?.availablePackages?.[0]?.product.identifier ?? ANNUAL_PRODUCT_ID;
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility([productId]);
    return eligibilityFromStatus(result[productId]?.status);
  } catch {
    return "unknown";
  }
}

/** Refresh from the network when available; always update the offline cache. */
export async function refreshEntitlement(): Promise<boolean> {
  if (!configured) return isPremiumCached();
  try {
    const info = await Purchases.getCustomerInfo();
    const active = hasPremium(info);
    cachePremium(active, expiryOf(info), sinceOf(info), trialExtraOf(info));
    return active;
  } catch {
    // Offline / transient failure: fall back to the cache (which itself expires
    // past its grace window — see isPremiumCached).
    return isPremiumCached();
  }
}

export async function purchaseAnnual(): Promise<boolean> {
  if (!configured) throw new Error("Purchases not configured (missing API key).");

  // Preferred path: buy the package from the current Offering (RevenueCat's
  // recommended pattern — lets you swap products/pricing from the dashboard
  // without an app update).
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current ?? offerings.all[CURRENT_OFFERING];
  const pkg = offering?.availablePackages?.[0];
  if (pkg) {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = hasPremium(customerInfo);
    cachePremium(active, expiryOf(customerInfo), sinceOf(customerInfo), trialExtraOf(customerInfo));
    return active;
  }

  // Fallback: fetch the product directly by ID if no Offering is configured.
  const products = await Purchases.getProducts([ANNUAL_PRODUCT_ID]);
  if (!products.length) {
    throw new Error(
      `No Offering package and product "${ANNUAL_PRODUCT_ID}" not found. Check RevenueCat + store setup.`
    );
  }
  const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
  const active = hasPremium(customerInfo);
  cachePremium(active, expiryOf(customerInfo), sinceOf(customerInfo), trialExtraOf(customerInfo));
  return active;
}

/**
 * One-shot connection diagnostic. Call from a dev build to confirm store setup.
 * Surfaces the usual gotchas: missing key, agreements not "Active", product ID
 * typos, entitlement not attached. Logs a report and returns it.
 */
export interface PurchasesDiagnostic {
  configured: boolean;
  offeringFound: boolean;
  packagesInOffering: number;
  productFoundById: boolean;
  entitlementActive: boolean;
  notes: string[];
}

export async function diagnosePurchases(): Promise<PurchasesDiagnostic> {
  const d: PurchasesDiagnostic = {
    configured,
    offeringFound: false,
    packagesInOffering: 0,
    productFoundById: false,
    entitlementActive: isPremiumCached(),
    notes: [],
  };
  if (!configured) {
    d.notes.push(
      "SDK not configured — set EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY (public SDK key)."
    );
    console.log("[Purchases diagnostic]", d);
    return d;
  }
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current ?? offerings.all[CURRENT_OFFERING];
    d.offeringFound = !!offering;
    d.packagesInOffering = offering?.availablePackages?.length ?? 0;
    if (!d.offeringFound) d.notes.push('No current Offering — create one in RevenueCat (id "default").');

    const products = await Purchases.getProducts([ANNUAL_PRODUCT_ID]);
    d.productFoundById = products.length > 0;
    if (!d.productFoundById) {
      d.notes.push(
        `Product "${ANNUAL_PRODUCT_ID}" not returned by the store — check the product ID, that it's approved/active, and (iOS) that Agreements/Tax/Banking is Active.`
      );
    }

    const info = await Purchases.getCustomerInfo();
    d.entitlementActive = hasPremium(info);
    if (!d.entitlementActive) {
      d.notes.push(
        `Entitlement "${PREMIUM_ENTITLEMENT}" not active for this user (expected until a purchase/restore). Ensure the product is attached to it in RevenueCat.`
      );
    }
  } catch (e: any) {
    d.notes.push(`Network/SDK error: ${e?.message ?? e}. Falling back to cached status offline.`);
  }
  console.log("[Purchases diagnostic]", d);
  return d;
}

export async function restorePurchases(): Promise<boolean> {
  if (!configured) return isPremiumCached();
  const info = await Purchases.restorePurchases();
  const active = hasPremium(info);
  cachePremium(active, expiryOf(info), sinceOf(info), trialExtraOf(info));
  return active;
}

/**
 * Dev-only: force the offline entitlement cache without a real purchase
 * (used by Settings' __DEV__ "Turn ON/OFF Premium" toggle). Writing only to
 * the Zustand store (setPremium) isn't enough — the very next time the app
 * comes to the foreground, refreshEntitlement() re-reads isPremiumCached()
 * (RevenueCat isn't configured in dev, so that's the only source of truth)
 * and silently overwrites an in-memory-only override back to false.
 */
export function setDevPremiumOverride(active: boolean): void {
  cachePremium(active, active ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null);
}

/**
 * Dev-only: pretend the free trial ends in `hoursLeft` hours, so the Home
 * trial banner (trialBanner.ts) can be seen without waiting days. Used by
 * Settings' __DEV__ buttons.
 */
export function setDevTrialEndingOverride(hoursLeft: number): void {
  cachePremium(true, new Date(Date.now() + hoursLeft * 60 * 60 * 1000), null, {
    periodType: "TRIAL",
    willRenew: true,
  });
}
