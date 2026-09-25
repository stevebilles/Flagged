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
the `Flagged_Pro_Annual` product in App Store Connect / Play Console. RevenueCat's entitlement/
offering/product wiring (`premium` entitlement, `default` offering, `Flagged_Pro_Annual` product)
needs no structural change for this — the trial duration is a property of the store product,
not something RevenueCat itself configures; RevenueCat automatically reflects it once ASC/Play
Console are set up, and already marks the `premium` entitlement **active from the moment a trial
starts**, not delayed until the first real charge.

## The model

1. **Onboarding — soft paywall.** The paywall is shown as the last onboarding screen, dismissible
   (✕ in the corner) — a user can skip straight into the app without starting the trial.
2. **Scan tab — hard lock, showing the paywall.** Regardless of onboarding choice, the Scan tab
   renders the paywall (`PaywallView`, in `scan.tsx` when `locked = !isPremium`) until the user is
   premium (trial or paid) — camera, Paste, and Choose Photo are all behind it, so there's nothing
   to gate per-button. Every other tab (Home, Pantry, Settings, profile setup) stays fully usable while
   locked — only scanning itself requires an active entitlement.
3. **The pitch:**
   > "7 days free, then $24.99/year — unlimited, offline label reading for every profile in your
   > house. You'll see an in-app reminder before your trial ends."

## Pricing display
- Price: **$24.99/year**, shown with both the daily (**$0.07/day**) and monthly (**$2.08/mo** —
  paired with "less than a pack of gum") breakdowns, to make the cost feel concrete from more than
  one angle.
- Paywall entry points: the Scan tab (`app/(tabs)/scan.tsx`, inline), and — once built — onboarding
  (soft, skippable). Both render the same component, `src/purchases/PaywallView.tsx`. The
  standalone `app/paywall.tsx` route still exists (it wraps `PaywallView`) but nothing links to it
  today, and `results.tsx` no longer has a paywall path.
- **Paywall design:** built to the Figma mockup's layout and copy (`docs/screenshots/paywall.png`)
  but in Flagged's own design system (`09`): Atkinson Hyperlegible, brand cyan (not the mockup's
  green), theme tokens and the Dynamic Type sizes. The required subscription disclosure
  (App Store Guideline 3.1.2) is a **short summary sentence** under the button ("7-day free trial, then
  $24.99 per year, renewing automatically. No charge today. You'll see an in-app reminder before
  billing, and you can cancel anytime.") plus a **Subscription details** link to `app/subscription-details.tsx`, an in-app screen with
  the longer wording (what you get, price and length, trial terms, what happens when it ends,
  renewal/payment, how to manage or cancel and restore) and a Back button. The Terms of Service /
  Privacy Policy links are **not** on the paywall — they're in Settings (Apple requires them in the
  app and in App Store metadata, not specifically on the purchase screen). Restore Purchase is also
  only in Settings for now; add it to the paywall if App Review asks.
- **Trial eligibility (2026-09-24):** Apple gives one introductory offer per Apple account per
  subscription group, so returning subscribers, reinstalls and anyone who already used the trial
  pay immediately. The paywall therefore asks RevenueCat (`getTrialEligibility` in `purchases.ts`,
  copy rules + tests in `trialEligibility.ts`) and shows the trial wording — the "7-day free trial"
  pill, the in-app-reminder line, the "Start your 7-day free trial" button, and the "No charge
  today" summary — **only to users who are eligible**. Everyone else sees "Subscribe for
  $24.99/year" and "$24.99 per year, renewing automatically. You'll be charged when you subscribe,
  and you can cancel anytime." While the lookup runs the trial wording shows (it's quick); if it
  can't be determined (offline, etc.) the app does **not** promise a trial. Apple's own purchase
  sheet always shows the real terms before anyone confirms. The Subscription details screen words
  the trial as "if you're eligible".
- **Settings no longer shows a subscription upsell.** A non-premium user sees no "Free Trial" or
  "Flagged Pro" card there at all (removed 2026-09-21) — the paywall lives in onboarding and the
  Scan tab now, not Settings. An **active** subscriber still sees their plan status and renewal
  date there (`Flagged Pro · Active · Renews <date>`), with a Manage Subscription link.
- **Apple does not send a pre-charge reminder** before a trial converts to a paid charge (the owner
  checked this on 2026-09-24, and Apple's subscription docs don't promise one). So the app makes its
  own, **in-app only — deliberately no push/local notifications**: a calm banner on the Home tab
  during the last 3 days of an active trial that hasn't been cancelled, showing a "cancel by" time
  (Apple requires cancelling at least 24 hours before the trial ends) and no countdown. The paywall
  says "in-app reminder" on purpose — it must not promise notifications. Likewise the Pantry
  "recheck" prompt is in-app (a red dot on the Pantry tab plus the to-do list at the top of the
  Pantry). **Built 2026-09-24:** the Home banner is `src/purchases/TrialEndingBanner.tsx` (logic +
  tests in `trialBanner.ts`); the Pantry dot is in `app/(tabs)/_layout.tsx` (rule + tests in
  `src/domain/pantryDue.ts`). Settings' dev-only buttons "Simulate trial ending in 48h / 20h" let you
  see the banner without waiting. The banner needs the entitlement's `periodType` and `willRenew`,
  which `purchases.ts` now caches (`cachedTrialInfo`). Caveat: in the sandbox the 7-day trial lasts
  only minutes, so a real sandbox trial shows the "past the cutoff" wording almost immediately.

## Entitlement handling (offline-first — still critical)

**How the paywall knows (2026-09-23):** the Scan tab shows the paywall whenever `isPremium` is
false. `isPremium` starts from the local cache at launch, is confirmed by RevenueCat during
bootstrap (the app doesn't render until that finishes, fails, or **3 seconds pass** — on a slow
connection it opens on the cached value and RevenueCat's late answer is applied when it arrives,
so a lapse still re-locks; see `src/purchases/launchEntitlement.ts`), and is refreshed on every return
to the foreground, after a purchase, and after Restore Purchase. RevenueCat's live update listener
(`subscribeToEntitlement` in `purchases.ts`) also unlocks the app immediately if an active
entitlement is reported while the app is open (e.g. an Ask-to-Buy approval or redeemed offer code).
It is activation-only: lapses are picked up by the next refresh so RevenueCat's offline cache can't
bypass the offline grace window below.

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
