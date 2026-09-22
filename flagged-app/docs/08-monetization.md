# 08 — Monetization: The $24.99/yr Subscription

> **Updated 2026-09-21:** switched from a 10-free-scan usage gate to a **7-day free trial**
> (payment method attached at signup, auto-converts silently at day 7 unless cancelled). Apple
> and Google's trial mechanics are strictly calendar-day-based — there is no usage-metered trial
> at the platform level, so this replaces the old scan counter entirely rather than combining
> with it (the two triggers can't coexist without contradicting each other — see the 2026-09-21
> design discussion). The 10-scan model, `FREE_SCAN_LIMIT`, and `Stats.freeScansUsed` are retired;
> the `freeScansUsed` DB column stays (no migration) but nothing reads or writes it anymore.

**Infrastructure:** RevenueCat via `react-native-purchases`, configured for an
**auto-renewing subscription** (1-year period) with a **7-day free trial** phase, configured on
the `flagged_annual` product in App Store Connect / Play Console. RevenueCat's entitlement/
offering/product wiring (`premium` entitlement, `default` offering, `flagged_annual` product)
needs no structural change for this — the trial duration is a property of the store product,
not something RevenueCat itself configures; RevenueCat automatically reflects it once ASC/Play
Console are set up, and already marks the `premium` entitlement **active from the moment a trial
starts**, not delayed until the first real charge.

## The model

1. **Onboarding — soft paywall.** The paywall is shown as the last onboarding screen, dismissible
   (✕ in the corner) — a user can skip straight into the app without starting the trial.
2. **Scan tab — hard lock.** Regardless of onboarding choice, the Scan tab renders a full lockout
   state (`scan.tsx`, `locked = !isPremium`) until the user is premium (trial or paid) — camera,
   Paste, and Choose Photo are all inside this same locked screen, so there's nothing to gate
   per-button. Every other tab (Home, Pantry, Settings, profile setup) stays fully usable while
   locked — only scanning itself requires an active entitlement.
3. **The pitch:**
   > "7 days free, then $24.99/year — unlimited, offline label reading for every profile in your
   > house. You'll get a reminder before your trial ends."

## Pricing display
- Price: **$24.99/year**, shown with both the daily (**$0.07/day**) and monthly (**$2.08/mo** —
  paired with "less than a pack of gum") breakdowns, to make the cost feel concrete from more than
  one angle.
- Paywall entry points: onboarding (soft, skippable), the Scan tab's hard-lock screen (`app/(tabs)/scan.tsx`),
  and `app/paywall.tsx` itself (also reachable from `results.tsx`).
- **Settings no longer shows a subscription upsell.** A non-premium user sees no "Free Trial" or
  "Flagged Pro" card there at all (removed 2026-09-21) — the paywall lives in onboarding and the
  Scan tab now, not Settings. An **active** subscriber still sees their plan status and renewal
  date there (`Flagged Pro · Active · Renews <date>`), with a Manage Subscription link.
- Apple sends its own system-level reminder notification before a trial converts to a paid
  charge — this is platform behavior, not something the app has to build. The "no surprise
  charges" language in the paywall copy is accurate without any extra engineering.

## Entitlement handling (offline-first — still critical)

Configure a RevenueCat **entitlement** (`premium`) tied to the annual subscription product.
`entitlements.active[premium]` from `CustomerInfo` reflects "currently within a trial or paid
period, not expired, not refunded" — true during the 7-day trial too, not just after the first
real charge.

- **Cache locally**, with an expiry. Persist `{ active, expiresAt }` on-device after every
  successful check (`src/purchases/purchases.ts`).
- **Offline grace window.** A subscriber (trialing or paid) who opens the app with zero
  connectivity must not be locked out — but an *indefinitely* cached "premium" would let a
  lapsed/cancelled subscription scan forever offline. Trust the cache while
  `now < expiresAt + GRACE` (a few days' grace for a normal offline stretch); past that, fall back
  to the locked Scan tab until a network check succeeds.
- **Restore.** Settings → `[ Restore Purchases ]` calls RevenueCat restore; updates cache + status.

## Gating logic (single source of truth)

```
isPremium = cachedEntitlement.active("premium")   // true during the trial too, not just after payment

Scan tab: locked = !isPremium                     // hard lock; everything else in the app stays usable

onSuccessfulScan():                                // only when a Results Screen is reached
   totalLabelsRead += 1
   // clean vs flagged stats updated per 07 — no free-scan counter to touch anymore
```

- `commitScanStats`/`commitScanStatsForAll`/`commitRecheckStats` (`src/domain/scanService.ts`) no
  longer take an `isPremium` parameter — they just record what happened; gating is entirely
  `isPremium`-based, checked once at the Scan tab, not per-scan.
- Reaching `results.tsx` at all already implies an active entitlement (the Scan tab wouldn't have
  let a locked-out user get there), so there's no in-result upsell branch anymore.

## Compliance
- Provide **Restore Purchases**, **Privacy Policy**, and **Terms of Service** (Settings, `05`).
- Provide a way to manage/cancel the subscription (Apple requires linking to the platform's
  subscription management — e.g. `Linking.openURL("https://apps.apple.com/account/subscriptions")`
  on iOS) — apps that sell auto-renewing subscriptions must offer this per App Store guidelines.
- The subscription product must be configured in App Store Connect / Play Console (1-year
  auto-renewing, **7-day free trial phase**) and mapped to the `premium` entitlement in
  RevenueCat.
