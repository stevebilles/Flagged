/**
 * Launch-time entitlement check with a time limit.
 *
 * App launch waits on RevenueCat to learn whether the user is subscribed. On a slow or hung
 * connection that wait has no end, so the app sits on the spinner even though a valid cached
 * entitlement is available locally (docs/02 — nothing may require a network).
 *
 * This races the refresh against a timeout: whichever comes first decides launch. If the timeout
 * wins we launch on the cache, and the refresh's eventual answer is still delivered to `onLate`
 * so a lapsed subscription re-locks the app instead of being ignored. Pure — no native imports —
 * so it is unit-tested.
 */
export function entitlementWithinTimeout(
  refresh: () => Promise<boolean>,
  cached: () => boolean,
  timeoutMs: number,
  onLate?: (active: boolean) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      resolve(cached());
    }, timeoutMs);

    refresh().then(
      (active) => {
        if (timedOut) {
          onLate?.(active);
          return;
        }
        clearTimeout(timer);
        resolve(active);
      },
      () => {
        // A failure before the timeout means "couldn't reach RevenueCat" — same as offline.
        // After the timeout we've already launched on the cache; there is nothing to report.
        if (timedOut) return;
        clearTimeout(timer);
        resolve(cached());
      },
    );
  });
}
