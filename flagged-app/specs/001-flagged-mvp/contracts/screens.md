# Contract — Screens & Navigation (`app/`)

`expo-router`. Root stack: `index` → (`onboarding` | `(tabs)`), plus `results`, `paywall`,
`profile-edit`, `save-to-pantry`, `recheck-result` presented as cards/sheets. Fixed 4-tab
bottom bar, no floating action button. Exact copy: the `docs/` set.

> **Updated 2026-09-23** for scan gating, the Home tiles, the Scan states, the recheck outcomes,
> the profile editor, Settings and the paywall. Sections not mentioned here were not re-verified
> line by line — where this file and the code disagree, the code wins.

## `index.tsx`
- Redirect: `hasOnboarded` → `(tabs)`, else `onboarding`.

## `onboarding.tsx` — 7 screens (`docs/04`)
1. Label Fatigue · 2. No Barcodes/Scores · 3. Personalize (Quick Pack pills, writes default
profile) · **4. Name** (first-name field, "why we ask" copy, Continue/Skip) · 5. 4-Tab Hub ·
6. 10-Scan Trial · 7. Founding Member pricing → `Start My 10 Free Scans` → `(tabs)`.
*(Screens 6–7 are the retired 10-scan copy; onboarding is pending redesign — see `docs/04`.)*
- Consumes no scan. Sets `hasOnboarded`. Name (if given) → `app_meta.firstName` + default
  profile name.

## `(tabs)/index.tsx` — Home (`docs/05`)
- Header: "Good Morning, {firstName}" with graceful fallback.
- Profile chips row: select (sets active profile), `Edit` (opens `profile-edit`),
  `Add Profile +`.
- Protection Summary: 4 tiles in a 2×2 grid — Total Scans, Pantry Items Saved, Red Flags Found,
  Reformulations Found. Values come from the viewed profile's per-profile counters (summed across
  profiles in "All" mode), not the legacy `stats` singleton. (Skimpflation Caught was retired.)

## `(tabs)/scan.tsx` — Scan (`docs/05`, `docs/06`, `docs/08`)
- State 1 Standby: `Scan Label` / `Paste Text` / `Choose Photo` (no scan meter).
- State 2 Locked (not premium): the paywall (`PaywallView`) rendered inline with a
  `Start your 7-day free trial` button; all scan inputs unavailable, every other tab still usable;
  it unlocks in place after purchase.
- State 3 Active: inline live camera + dashed cyan guide box + `Capture` (manual shutter), then
  `Done` / `Scan More` — see `contracts/ocr-pipeline.md`.
- On result → set `appStore.lastScan`, navigate to `results`.

## `results.tsx` (`docs/07`)
- Clean: cyan `CLEAN` stamp, "No red flags found", "for <profile>" line — no ingredient list, no
  explanatory sentence — then `Save to Pantry` → `save-to-pantry`.
- Flagged: red `FLAGGED` stamp with count, "for <profile>" line, and the matched red-flag terms
  grouped by category, each group with its classification badge (no raw OCR paragraph).
- Secondary: `Scan Another Item` and `Return to Home`. Flagged results can't be saved to the
  Pantry — only clean scans show `Save to Pantry`. In its place a flagged result shows a notice
  (filled panel, accent bar, info icon, left-aligned "Flagged items can't be saved to your Pantry —
  only clean scans can.") directly above the buttons, so a user looking for the missing button sees
  why. It is deliberately not outlined or centered, so it can't be mistaken for a button.
- Commits stats once, on mount, via `commitScanStats`.

## `save-to-pantry.tsx` (`docs/07`)
- Take a photo of the front of the packaging (`Take photo` / `Retake photo`), enter `Brand Name`
  and `Product Name` (`Save` stays disabled until both are filled), then write the `pantryItem`
  with a `profileSnapshot` of the profile's active filters at save time (no ingredient text is
  stored — `docs/07` §7.1) and `dateAdded`/`lastVerifiedDate` = now.

## `(tabs)/pantry.tsx` (`docs/05`, `docs/07`)
- Section 1 Recheck list: items with `now − lastVerifiedDate > 30d` (clamp negatives).
  Header `Reformulation Checks` + subtitle verbatim (`docs/05`). Tapping a task → intercept modal ("Only scan a NEWLY PURCHASED
  box…") → `Yes, open camera` (→ recheck scan) / `Remind me later`.
- Section 2 Grid: up-to-date items (thumbnail, brand, product).
- Section 3 Recent Changes: items with `deletedAt` within 24h, each with `Undo`; purge after.
- Empty state (grid AND log empty): calming graphic + verbatim copy.

## `recheck-result.tsx` (`docs/07` §7.1)
- **Two** outcomes (`contracts/recheck-diff.md`): `identical` → green confirmation, reset the
  30-day timer, `Back to Pantry`; `changed_flagged` → Alert Red screen, each match attributed
  (reformulation vs. a dated/generic filter change), `Delete Item` (destructive) / `Keep Item`
  (secondary). The old "changed_safe" outcome no longer exists.
- Applies the Keep/Delete repository effects and the recheck stat increments (once, on mount).

## `profile-edit.tsx` (`docs/05`, `docs/09`)
- Editor (no Quick Pack pills — removed; filters are toggled per category): expandable category rows (name, "N names · tap for
  details", classification badge, on/off switch); per-ingredient toggles; custom-ingredient
  text field + `Add`. Writes through activation functions to the DB; reflects on reload.

## `(tabs)/settings.tsx` (`docs/05`, `docs/08`)
- First Name field (→ `app_meta.firstName`).
- Active subscribers see `Flagged Pro · Active · Renews <date>` + `Manage Subscription`;
  non-premium users see no upsell card. `Restore Purchase`, `Rate Flagged`, `Contact Support`.
  (A dev toggle to force Premium on/off also exists.)
- `Privacy Policy` / `Terms of Service` links.

## `PaywallView` (`src/purchases/PaywallView.tsx`; `app/paywall.tsx` wraps it) (`docs/08`)
- "FLAGGED PRO" header, `$24.99 / year` card with a "7-day free trial" pill and the `$2.08/mo` /
  `$0.07/day` breakdowns, four feature rows, buy button → `purchaseAnnual` → on success
  `setPremium(true)` (the Scan tab unlocks in place; the standalone route also goes back).
- One-line subscription summary under the button plus a `Subscription details` link to
  `subscription-details.tsx` (Terms/Privacy links are in Settings, not here). `onDismiss` adds a
  `Not now`
  button (standalone route only).

## Cross-cutting
- All text in Atkinson Hyperlegible; respects Dynamic Type; WCAG AA both themes; state never
  by colour alone (icon + label always).
- Review prompt (`expo-store-review`) requested per `docs/10` triggers, never on the results
  screen itself, never gated on positive sentiment.

**Acceptance checks**: the spec's User Story acceptance scenarios (US1–US8) map onto these
screens; `/speckit-tasks` turns each into implementation + a screen/integration test where
one is feasible, and a `quickstart.md` manual step where it needs a device.
