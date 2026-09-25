import { AppState } from "react-native";
import { initializeDatabase } from "../db/seed";
import { purgeExpiredDeletions } from "../db/repositories";
import { deleteThumbnail } from "../domain/pantryImage";
import { sweepTempPhotos } from "../domain/tempPhotos";
import { entitlementWithinTimeout } from "../purchases/launchEntitlement";
import {
  configurePurchases,
  isPremiumCached,
  refreshEntitlement,
  subscribeToEntitlement,
  subscribeToTrialInfo,
} from "../purchases/purchases";
import { useAppStore } from "../state/appStore";

/** How long launch waits on RevenueCat before opening on the cached entitlement instead. */
const ENTITLEMENT_LAUNCH_TIMEOUT_MS = 3000;

/**
 * Storage cleanup, run at launch AND every time the app returns to the foreground (a phone app is
 * rarely relaunched, so launch alone would leave things around for days):
 *  - permanently delete Pantry items removed more than 24 hours ago, and their photo files
 *  - delete scan photos (temp) that are 20+ minutes old (`tempPhotos.ts`)
 * Fire-and-forget: file IO never blocks the UI.
 */
export function runCleanup(): void {
  const purgedThumbnails = purgeExpiredDeletions();
  void Promise.all(purgedThumbnails.map(deleteThumbnail)).catch(() => undefined);
  void sweepTempPhotos().catch(() => undefined);
}

let cleanupOnForeground = false;

/**
 * One-time app bootstrap (docs/02, offline-first):
 *  1. seed the local DB from the bundled dictionary (idempotent)
 *  2. purge expired soft-deletes (24h window)
 *  3. configure purchases + refresh entitlement (cache offline, or after a few seconds if slow)
 *  4. hydrate app state
 */
export async function bootstrap(): Promise<void> {
  initializeDatabase();
  runCleanup();
  if (!cleanupOnForeground) {
    cleanupOnForeground = true;
    AppState.addEventListener("change", (s) => {
      if (s === "active") runCleanup();
    });
  }

  useAppStore.getState().hydrate();

  configurePurchases();
  // Unlock live if RevenueCat later reports an active entitlement (purchases.ts).
  subscribeToEntitlement((active) => useAppStore.getState().setPremium(active));
  // Keep the Home trial banner's data current after every purchase/refresh/restore.
  subscribeToTrialInfo((info) => useAppStore.getState().setTrialInfo(info));
  // Don't let a slow connection hold the spinner: after the timeout, open on the cache. The
  // late RevenueCat answer still lands via setPremium, so a lapsed subscription re-locks.
  const setPremium = (active: boolean) => useAppStore.getState().setPremium(active);
  const premium = await entitlementWithinTimeout(
    refreshEntitlement,
    isPremiumCached,
    ENTITLEMENT_LAUNCH_TIMEOUT_MS,
    setPremium,
  );
  setPremium(premium);
}
