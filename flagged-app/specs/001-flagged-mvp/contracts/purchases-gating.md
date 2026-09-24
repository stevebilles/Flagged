# Contract — Purchases & Scan Gating (`src/purchases/purchases.ts`, `app/(tabs)/scan.tsx`)

Product reference: `docs/08-monetization.md`. One auto-renewing **annual subscription**
(`Flagged_Pro_Annual`, $24.99/yr) with a **7-day free trial**, one entitlement (`premium`), offering
`default`. Offline-first: a paid user is never locked out (bounded grace window).

> **Rewritten 2026-09-23 to match the code.** The original contract described a one-time
> non-consumable purchase and a 10-scan usage gate (`canScan`, `scansRemaining`,
> `FREE_SCAN_LIMIT`); both were retired 2026-09-21.

## Entitlement (purchases.ts)
- `isPremiumCached(): boolean` — synchronous read of the `app_meta` cache (`cachedPremium`,
  `cachedPremiumExpiresAt`). Never throws, never touches the network. True only while inside the
  subscription's known expiry **plus a 3-day offline grace window**; if no expiry is on record
  (e.g. skeleton/dev mode) it trusts the flag. This is the value the gate uses.
- `cachedRenewalDate(): Date | null` — the cached renewal/expiry date, for display.
- `refreshEntitlement(): Promise<boolean>` — best-effort `getCustomerInfo`; on success writes the
  cache; on failure returns the cached value. Called at bootstrap and on app foreground; never
  blocks a render.
- `purchaseAnnual(): Promise<boolean>` — buy the current offering's package. On success writes
  the cache.
- `restorePurchases(): Promise<boolean>` — RevenueCat restore; updates the cache.
- `diagnosePurchases()` and `setDevPremiumOverride(active)` — dev-only helpers (the Settings dev
  toggle "Turn ON/OFF Premium").
- No-key ("skeleton") mode: without `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY`,
  `configurePurchases()` is a no-op; `isPremiumCached` still works from the cache.

## Gate
- Gating is purely **`isPremium`** (app store value, seeded from the cache):
  `locked = !isPremium` in `app/(tabs)/scan.tsx`. There is no scan counter. (The `freeScansUsed`
  DB column remains but nothing reads or writes it.)
- `evaluateScan(raw, profile)` → `aborted: "illegible"` (no state change) or `result`.
- `commitScanStats(result, profile)` / `commitScanStatsForAll(...)` — called **only** when a
  result screen is reached; update the per-profile counters (`totalLabelsRead`,
  `totalRedFlagsCaught`, `totalCleanScans`).

## UI rules
- Not premium → Scan tab State 2: the paywall (`PaywallView`) rendered inline with a
  `Start your 7-day free trial` button. Camera / Paste / Choose Photo are unavailable. **Every other tab stays usable.**
- No scan meter anywhere; no in-result upsell (`Scan Another Item` is always offered).
- Premium (trial or paid) → the lock is never shown.
- Settings: an active subscriber sees `Flagged Pro · Active · Renews <date>` and Manage
  Subscription; there is a `Restore Purchase` row. Non-premium users see **no** upsell card
  (removed 2026-09-21).
- Paywall (`src/purchases/PaywallView.tsx`; `app/paywall.tsx` wraps it): `$24.99 / year` with the
  `$2.08/mo` and `$0.07/day` breakdowns; buy → `purchaseAnnual`.

**Acceptance checks** (→ tests + device)
- Not premium → Scan tab locked, other tabs usable (screen).
- Premium → lock hidden (unit/screen).
- Illegible abort never commits stats (unit).
- Offline (airplane mode) premium user relaunch → not locked while inside expiry + grace;
  past expiry + grace with no network → treated as not premium (device manual).
- Starting the trial → `premium` entitlement active immediately (device sandbox).
- Restore with no prior purchase → clean "no purchases found" message (device sandbox).
- Purchase cancelled mid-flow → stays locked, no partial entitlement (device).
