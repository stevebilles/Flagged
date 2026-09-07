# 10 — App Store Review Strategy (ASO)

Use the **native in-app review** prompt via `expo-store-review`
(`StoreReview.requestReview()`), which wraps `SKStoreReviewController` on iOS and the In-App Review
API on Android. The OS decides whether to actually show the dialog and rate-limits it — never build
a custom star prompt that deep-links to the store for these triggers.

## Trigger 1 — The "Aha!" moment
- **Fires:** immediately after the user successfully scans and catches their **fifth flagged
  ingredient** during their 10 free scans.
- **Guard:** must **not** trigger until the user has **left the Results screen** (`07`). Fire on
  return to Home / next navigation, not on the results view itself.

## Trigger 2 — The "Habit" moment
- **Fires:** on the **first app open after 30 days** of active **Premium** installation, **or** upon
  hitting **50 total scans** (`totalLabelsRead`), whichever comes first.

## Implementation notes
- Track the state needed to evaluate triggers locally (e.g., cumulative flagged-ingredient count,
  premium install date, `totalLabelsRead` from the Stats singleton in `03`).
- Call `StoreReview.isAvailableAsync()` before requesting.
- Request **at most** what the platform allows; assume the OS may show nothing. Do not retry
  aggressively.
- Never condition a review request on the user first giving positive feedback (against store
  guidelines).
