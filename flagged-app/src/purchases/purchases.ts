import Purchases, { CustomerInfo } from "react-native-purchases";
import { Platform } from "react-native";
import { getMetaValue, setMetaValue } from "../db/appMeta";

/**
 * RevenueCat wrapper (docs/08). Non-consumable one-time purchase with OFFLINE
 * entitlement caching: a paid user with no connectivity must not be locked out.
 *
 * Configure API keys via app config / EAS secrets before shipping.
 */

export const PREMIUM_ENTITLEMENT = "premium";
export const LIFETIME_PRODUCT_ID = "flagged_lifetime"; // configure in stores + RevenueCat
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
  const products = await Purchases.getProducts([LIFETIME_PRODUCT_ID]);
  if (!products.length) throw new Error("Lifetime product not found.");
  const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
  const active = hasPremium(customerInfo);
  cachePremium(active);
  return active;
}

export async function restorePurchases(): Promise<boolean> {
  if (!configured) return isPremiumCached();
  const info = await Purchases.restorePurchases();
  const active = hasPremium(info);
  cachePremium(active);
  return active;
}
