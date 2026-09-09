# Contract — Purchases & Trial Gating (`src/purchases/purchases.ts`, `src/domain/scanService.ts`)

Product reference: `docs/08-monetization.md`. One non-consumable product, one entitlement
(`premium`). Offline-first: a paid user is never locked out.

## Entitlement (purchases.ts)
- `isPremiumCached(): boolean` — synchronous read of `app_meta.cachedPremium`. Never throws,
  never touches the network. This is the value the gate uses.
- `refreshEntitlement(): Promise<boolean>` — best-effort `getCustomerInfo`; on success
  writes the cache; on failure returns the cached value. Never blocks a render.
- `purchaseLifetime(): Promise<boolean>` — buy the current Offering's package (fallback: the
  product by id). On success writes cache = true and records `premiumSince` if unset.
- `restorePurchases(): Promise<boolean>` — RevenueCat restore; updates cache + status.
- SDK-not-configured ("skeleton") mode: purchase/restore are unavailable but
  `isPremiumCached` still works.

## Gate (scanService.ts)
```
canScan(isPremium)      = isPremium || getStats().freeScansUsed < 10
scansRemaining()        = max(0, 10 − freeScansUsed)
```
- `evaluateScan(raw, profile)` → `aborted:"illegible"` (no state change) or `result`.
- `commitScanStats(result, isPremium)` — called **only** when a result screen is reached:
  `totalLabelsRead += 1`; if `!isPremium` `freeScansUsed = min(10, +1)`; clean/flagged
  counters per the matching result.

## UI rules
- `showMeter = !isPremium`; the Scan tab shows `Scans Remaining: N / 10`.
- `locked = !isPremium && freeScansUsed >= 10` → Scan tab State 2: lock icon + single
  `Unlock Unlimited Scans - $24.99` button with `$39.99` struck through. Camera / Paste /
  Choose Photo are all disabled.
- Results secondary button becomes `Unlock Unlimited Scans` when the 10th scan was just used.
- After premium: meter, lock, and unlock buttons are hidden everywhere.
- Settings shows `Restore Purchases` + a Trial/Premium status indicator.

**Acceptance checks** (→ tests + device)
- 10 successful scans decrement to 0; 11th attempt → locked (unit on gate; screen test).
- Illegible abort never decrements (unit).
- Premium never decrements; meter/lock hidden (unit + screen).
- Offline (airplane mode) premium user relaunch → not locked, no meter (device manual).
- Restore with no prior purchase → clean "no purchases found" message (device sandbox).
- Purchase cancelled mid-flow → stays in trial/locked, no partial entitlement (device).
