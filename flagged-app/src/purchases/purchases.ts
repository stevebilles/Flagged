import Purchases, { CustomerInfo } from "react-native-purchases";
import { Platform } from "react-native";
import { getMetaValue, setMetaValue } from "../db/appMeta";

/**
 * RevenueCat wrapper (docs/08). Non-consumable one-time purchase with OFFLINE
 * entitlement caching: a paid user with no connectivity must not be locked out.
 *
 * Configure API keys via app config / EAS secrets before shipping.
 */

// These three identifiers must match your RevenueCat / store dashboard config.
export const PREMIUM_ENTITLEMENT = "premium"; // RevenueCat → Entitlements identifier
export const LIFETIME_PRODUCT_ID = "flagged_lifetime"; // App Store Connect + Play + RevenueCat product ID
export const CURRENT_OFFERING = "default"; // RevenueCat → Offerings (recommended fetch path)
const CACHED_PREMIUM_KEY = "cachedPremium";

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
  configured = true;
}

function cachePremium(active: boolean): void {
  setMetaValue(CACHED_PREMIUM_KEY, active ? "1" : "0");
}

/** Read cached premium status — works fully offline (docs/08). */
export function isPremiumCached(): boolean {
  return getMetaValue(CACHED_PREMIUM_KEY) === "1";
}

function hasPremium(info: CustomerInfo): boolean {
  return info.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
}

/** Refresh from the network when available; always update the offline cache. */
export async function refreshEntitlement(): Promise<boolean> {
  if (!configured) return isPremiumCached();
  try {
    const info = await Purchases.getCustomerInfo();
    const active = hasPremium(info);
    cachePremium(active);
    return active;
  } catch {
    // Offline / transient failure: fall back to cached status. Never lock out.
    return isPremiumCached();
  }
}

export async function purchaseLifetime(): Promise<boolean> {
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
    cachePremium(active);
    return active;
  }

  // Fallback: fetch the product directly by ID if no Offering is configured.
  const products = await Purchases.getProducts([LIFETIME_PRODUCT_ID]);
  if (!products.length) {
    throw new Error(
      `No Offering package and product "${LIFETIME_PRODUCT_ID}" not found. Check RevenueCat + store setup.`
    );
  }
  const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
  const active = hasPremium(customerInfo);
  cachePremium(active);
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

    const products = await Purchases.getProducts([LIFETIME_PRODUCT_ID]);
    d.productFoundById = products.length > 0;
    if (!d.productFoundById) {
      d.notes.push(
        `Product "${LIFETIME_PRODUCT_ID}" not returned by the store — check the product ID, that it's approved/active, and (iOS) that Agreements/Tax/Banking is Active.`
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
  cachePremium(active);
  return active;
}
