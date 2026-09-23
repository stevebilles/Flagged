# 10 — App Store Review Strategy (ASO)

Use the **native in-app review** prompt via `expo-store-review`
(`StoreReview.requestReview()`), which wraps `SKStoreReviewController` on iOS and the In-App Review
API on Android. The OS decides whether to actually show the dialog and rate-limits it — never build
a custom star prompt that deep-links to the store for these triggers.

> **Rewritten 2026-09-23 for the 7-day free trial.** The original "Aha" (5th flagged ingredient)
> and "Habit" (30 days premium / 50 total scans) triggers were retired. The 50-scan half of the
> old Habit trigger also never worked (it read a legacy counter nothing updates).

## The schedule — three requests, each at most once

Every request is made only **right after a completed scan** — one that reached the Results screen,
clean or flagged — and only once the user has **left** the Results screen (never while they're
looking at it). Times are measured from when the **free trial was activated**: the store's
original purchase date, falling back to the first time this device saw the user as premium.

| # | Moment | Fires on |
|---|--------|----------|
| 1 | **Trial** | the first completed scan **inside the 7-day trial** |
| 2 | **Post-trial** | the first completed scan **after the trial has ended** (day 7 onward) |
| 3 | **30-day** | the first completed scan **30 or more days after activation** (after #2 was asked) |

Rules and consequences:
- **At most one request per completed scan**, in the order above. If several are due at once (e.g.
  a user's first scan is on day 40), #2 fires on that scan and #3 on their next one.
- Because **scanning requires premium**, anyone who cancels during the trial is locked out of
  scanning on day 8 — so requests #2 and #3 only ever reach people who kept their subscription.
  Request #1 happens during the trial as long as the user completes at least one scan in it.
- If the trial start date is unknown (e.g. a dev build with a forced-premium override), the time of
  the first completed scan is treated as the start.
- iOS rate-limits the system prompt (Apple's documented cap is three displays per 365 days per app)
  and may show nothing. This three-request schedule uses that whole yearly allowance within the
  first month — worth remembering before adding any further request.

## Implementation notes
- The schedule is a pure function in `src/review/reviewSchedule.ts` (`nextReviewMoment`,
  `pickTrialStartMs`), unit-tested in `src/__tests__/reviewSchedule.test.ts`.
- `onScanCompleted()` in `src/review/reviewTriggers.ts` reads/writes state and calls the native
  prompt; `app/results.tsx` calls it when the user leaves Results. There is no app-foreground
  trigger any more.
- State lives in `app_meta`: `reviewAsked:trial`, `reviewAsked:post-trial`, `reviewAsked:day-30`
  (each `"1"` once asked), `cachedPremiumSince` (the store's original purchase date, written by
  `src/purchases/purchases.ts`) and `premiumInstalledAt` (fallback start). The old
  `reviewRequested` / `ahaFlaggedCatchCount` keys are unused.
- Call `StoreReview.isAvailableAsync()` before requesting; if it isn't available, don't mark the
  request as asked. Never let a review failure break the Results screen (`onScanCompleted` never
  throws).
- Request **at most** what the platform allows; assume the OS may show nothing. Do not retry
  aggressively.
- Never condition a review request on the user first giving positive feedback (against store
  guidelines).
