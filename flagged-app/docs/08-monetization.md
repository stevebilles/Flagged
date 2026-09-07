# 08 — Monetization: The $24.99 Lifetime Unlock

The app **avoids subscriptions and feature-gating**. Conversion is driven entirely by a fully
unrestricted trial of the technology, followed by a **hard usage gate**.

**Infrastructure:** RevenueCat via `react-native-purchases`, configured for a **non-consumable**
(one-time) purchase. StoreKit 2 on iOS / Play Billing on Android under the hood.

## The model

1. **Fully unlocked metered trial.** Free users get exactly **10 successful scans**. During those
   10 scans they have **100% unrestricted** access to the entire app — multiple profiles, custom
   ingredients, building the pantry. Nothing is locked.
   - **What counts:** a scan is counted toward `freeScansUsed` **only if it successfully extracts
     text and routes to the Results Screen** (`06`, `07`). Illegible/aborted scans are free.
2. **Core feature lockout.** On the **11th** attempt, the scanning engine is entirely locked
   (`freeScansUsed == 10`). The user has already experienced custom profiles, the Safe List, and the
   OCR. To keep checking food, they pay the **$24.99** one-time fee.
3. **The pitch:**
   > "Ditch the $40/year subscriptions. Get unlimited, offline label reading for life for less than
   > the cost of one year of the other guys."

## Pricing display
- Price: **$24.99** one-time. Show **$39.99 struck through** on paywall surfaces.
- Paywall entry points: Scan tab **State 2** lock screen (`05`), and the Results secondary button
  that flips to `[ Unlock Unlimited Scans ]` after the 10th scan (`07`), and onboarding Screen 6
  intro (`04`, informational only — no purchase there).

## Entitlement handling (offline-first — critical)

Configure a RevenueCat **entitlement** (e.g., `premium`) tied to the non-consumable product.

- **Cache locally.** After purchase/restore, persist the premium status on-device.
- **Offline check.** A premium user opening the app in a store with **zero connectivity** must
  **not** be locked out. Read the **cached** entitlement (RevenueCat's cached `CustomerInfo`) to
  determine premium state without a network call. Never block a paid user on a failed network
  request.
- **Restore.** Settings → `[ Restore Purchases ]` calls RevenueCat restore; update cache + status
  indicator (Trial / Premium).

## Gating logic (single source of truth)

```
isPremium = cachedEntitlement.active("premium")   // works offline

canScan =
   isPremium
   OR freeScansUsed < 10

onSuccessfulScan():          // only when a Results Screen is reached
   totalLabelsRead += 1
   if !isPremium: freeScansUsed += 1
   // clean vs flagged stats updated per 07
```

- Do **not** decrement or "refund" scans; illegible captures simply never increment (they don't
  reach a Results Screen).
- Once `isPremium`, the meter and lockout are hidden everywhere.

## Compliance
- Provide **Restore Purchases**, **Privacy Policy**, and **Terms of Service** (Settings, `05`).
- Non-consumable product must be configured in App Store Connect / Play Console and mapped in
  RevenueCat.
