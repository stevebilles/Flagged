import { initializeDatabase } from "../db/seed";
import { purgeExpiredDeletions } from "../db/repositories";
import { configurePurchases, refreshEntitlement } from "../purchases/purchases";
import { useAppStore } from "../state/appStore";

/**
 * One-time app bootstrap (docs/02, offline-first):
 *  1. seed the local DB from the bundled dictionary (idempotent)
 *  2. purge expired soft-deletes (24h window)
 *  3. configure purchases + refresh entitlement (falls back to cache offline)
 *  4. hydrate app state
 */
export async function bootstrap(): Promise<void> {
  initializeDatabase();
  purgeExpiredDeletions();

  useAppStore.getState().hydrate();

  configurePurchases();
  const premium = await refreshEntitlement();
  useAppStore.getState().setPremium(premium);
}
