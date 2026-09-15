# 08 — Monetization: The $24.99/yr Subscription

> **Updated 2026-09-11:** switched from the original one-time lifetime unlock to an
> **annual auto-renewing subscription**. The trial mechanics, the hard usage gate, and the
> offline-first entitlement requirement are unchanged — only the product itself renews now.

Conversion is driven by a fully unrestricted trial of the technology, followed by a
**hard usage gate**.

**Infrastructure:** RevenueCat via `react-native-purchases`, configured for an
**auto-renewing subscription** (1‑year period). StoreKit 2 on iOS / Play Billing on Android
under the hood.

## The model

1. **Fully unlocked metered trial.** Free users get exactly **10 successful scans**. During those
   10 scans they have **100% unrestricted** access to the entire app — multiple profiles, custom
   ingredients, building the pantry. Nothing is locked.
   - **What counts:** a scan is counted toward `freeScansUsed` **only if it successfully extracts
     text and routes to the Results Screen** (`06`, `07`). Illegible/aborted scans are free.
2. **Core feature lockout.** On the **11th** attempt, the scanning engine is entirely locked
   (`freeScansUsed == 10`). The user has already experienced custom profiles, the Safe List, and the
   OCR. To keep checking food, they subscribe for **$24.99/year**.
3. **The pitch:**
   > "Unlimited, offline label reading for a year — less than the cost of one coffee a month.
   > Cancel anytime."

## Pricing display
- Price: **$24.99 / year**, auto‑renewing. Show it as "less than $0.07/day" to make the value
  concrete; do **not** show a struck‑through "was" price (that framing belonged to the one‑time
  model — a subscription doesn't need it).
- Paywall entry points: Scan tab **State 2** lock screen (`05`), the Results secondary button that
  flips to `[ Unlock Unlimited Scans ]` after the 10th scan (`07`), and onboarding Screen 7 intro
  (`04`, informational only — no purchase there).
- Settings shows subscription status and, once known, the renewal date ("Renews Sep 11, 2027").

## Entitlement handling (offline-first — still critical, more subtle with a subscription)

Configure a RevenueCat **entitlement** (`premium`) tied to the annual subscription product.
`entitlements.active[premium]` from `CustomerInfo` already reflects "currently within a paid
period, not expired, not refunded" — no extra logic needed for *that* part.

- **Cache locally**, but **with an expiry**, unlike the old lifetime model. Persist
  `{ active, expiresAt }` on-device after every successful check.
- **Offline grace window.** A subscriber who opens the app with zero connectivity must not be
  locked out — but an *indefinitely* cached "premium" would let a lapsed/cancelled subscription
  scan forever offline. Trust the cache while `now < expiresAt + GRACE` (a few days' grace for a
  normal offline stretch — a road trip, a store basement); past that, fall back to the free gate
  until a network check succeeds. Never fail loudly — just re-evaluate `canScan` next launch.
- **Restore.** Settings → `[ Restore Purchases ]` calls RevenueCat restore; updates cache + status
  indicator (Trial / Premium, with renewal date once available).

## Gating logic (single source of truth)

```
isPremium = cachedEntitlement.active("premium")   // works offline, within the grace window above

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
- Provide a way to manage/cancel the subscription (Apple requires linking to the platform's
  subscription management — e.g. `Linking.openURL("https://apps.apple.com/account/subscriptions")`
  on iOS) — apps that sell auto-renewing subscriptions must offer this per App Store guidelines.
- The subscription product must be configured in App Store Connect / Play Console (1‑year
  auto-renewing) and mapped to the `premium` entitlement in RevenueCat.
