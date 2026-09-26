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
- Language check (all inputs, and `recheck-capture`): if the bulk of the scanned words aren't English
  (`src/matching/language.ts`), the in-app `LanguageWarning` card ("Check the language") appears
  before any result, with a single `Scan again` button — no "continue anyway", not a native alert
  (`docs/06`).
- On result → set `appStore.lastScan`, navigate to `results`.

## `results.tsx` (`docs/07`)
- Both results open with the compact `HeroCard` (small icon in a circle beside the headline; owner,
  2026-09-25 — no big stamp, no `CLEAN`/`FLAGGED` tag, no digit in a circle).
- Clean: cyan hero "No red flags found", "for <profile>" line under it — no ingredient list, no
  explanatory sentence — then `Save to Pantry` → `save-to-pantry`.
- Flagged: red hero "N red flags on your list", "for <profile>" line, and the matched red-flag terms
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
  stored — `docs/07` §7.1) and `dateAdded`/`snapshotAt`/`lastVerifiedDate` = now. A scan run for
  several profiles ("All") saves one card per profile, each with that profile's own snapshot; the
  screen says which profile(s) it is saving under.

## `(tabs)/pantry.tsx` (`docs/05`, `docs/07`) — titled "My Pantry"
- Wording: never "safe list / safe foods / approved / cleared / all clear" (`copyGuard.test.ts`).
- Section 1 Recheck list (top): items with `now − lastVerifiedDate > 30d` (clamp negatives).
  Label `Reformulation Checks`; while any item is due, ONE line above the cards, verbatim from the
  mockup: "Next time you buy one of these, scan the new package to check if the recipe has
  changed." (`docs/05` — not repeated per card). Each card:
  small product photo (only if the item has one), brand, product, the profile it was saved for,
  `Recheck →`. Tapping → straight to `recheck-capture` (no confirmation popup), whose text says
  "Only scan the ingredient list on a NEWLY PURCHASED box." with `Open camera` / `Paste` / `Cancel`.
  Drives the red dot on the Pantry tab icon.
- Section 2 Saved Products: ALL saved items as cards, including ones also listed as due above
  (photo or brand-initial tile, brand, product,
  a tag for the profile it was saved for). With 2+ profiles, an `All` + per-profile filter row
  with counts (local view filter only). Tapping a card → `pantry-item.tsx` (`?id=`).
- Section 3 Recent Changes (bottom): items with `deletedAt` within 24h, each with `Undo`; purge after.
- No invisible features: every section (recheck list, saved products + profile filter, recent
  changes) is always shown, each with its own plain-words empty message (`docs/05`) — there is no
  single "Pantry is empty" screen.

## `pantry-item.tsx` (`docs/05`)
- One saved item: photo, brand, product, `SAVED TO PROFILE` (the profile as a pill — no separate
  saved / last-checked date rows; the Scan History has them), a `SCAN HISTORY` card ("N scans" running total + "First saved [date]", tap → `scan-history`),
  and `Remove from Pantry` (soft delete → appears under Recent Changes with `Undo`). In a
  `__DEV__` build only: a labelled `Force recheck (mark as due)` test button (`docs/05`).

## `scan-history.tsx` (`docs/05`, `docs/03` §3.2b)
- Header (back · "Scan History"), then a product block like the item's card (photo when it has one,
  brand, product) so it's obvious which product this is, then a timeline of every scan, newest first
  (the whole screen scrolls)
  (`LATEST` on the top one). Each entry: date · time; "Saved to Pantry" / "Rescanned — no red flags
  found" / "Rescanned — red flags found"; SCANNED FOR → the profile and the red flags it had on at
  that scan. Text only, read-only. Removed with the item when it's permanently deleted.

## `recheck-result.tsx` (`docs/07` §7.1)
- `known_flags` (every flag was already found at the last scan): the clean layout with the headline
  one bold sentence "No new red flags found for [Profile]'s current profile" (flag icon; not "No red flags found"), then the known flags as
  cards under "SAME RED FLAGS AS YOUR LAST SCAN", the pill-style profile card, then `Back to Pantry`
  (primary, on top) and `Remove from Pantry` (plain secondary, not red) (`docs/07` Outcome 1b).
- Otherwise **two** outcomes (`contracts/recheck-diff.md`): `identical` → the owner's clean mockup (header with the product photo and NO `CLEAN` tag, verdict
  card "No red flags found", PROFILE AT TIME OF EACH SCAN side-by-side filters, `Back to Pantry`;
  `07`), reset the 30-day timer, `Back to Pantry`; `changed_flagged` → the owner's flagged mockup: header (back + "Rescan Result" title, then
  photo + brand/product — no pill; the mockup's `SAME PROFILE` label is mockup-only), compact red hero card (icon beside "New red flag detected — for [Profile]"; the clean result uses the same card in cyan), the "WHY IS THIS FLAGGING
  NOW?" card (Profile of last scan · date → down arrow → Profile of today's scan, each as filter pills)
  **directly under the banner** (no scroll to see why), then one card per
  flagged filter (name + classification badge + ingredient chips); the card's one-line footer (`flaggedFooter`: same filters → "Same red flag set — this is likely a
  product reformulation."; profile changed → the added filters
  as cyan "+" pills and a footer chosen by `flagSource` so "probably not a reformulation" is only
  said when every flag comes from an added filter), `Remove from Pantry`
  (destructive) / `Keep anyway` (secondary). Every recheck is added to the item's scan history once on open (`pantry_scan_history`). The old "changed_safe" outcome no longer exists.
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
