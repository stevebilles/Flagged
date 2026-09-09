# Contract — Screens & Navigation (`app/`)

`expo-router`. Root stack: `index` → (`onboarding` | `(tabs)`), plus `results`, `paywall`,
`profile-edit`, `save-to-pantry`, `recheck-result` presented as cards/sheets. Fixed 4-tab
bottom bar, no floating action button. Exact copy: the `docs/` set.

## `index.tsx`
- Redirect: `hasOnboarded` → `(tabs)`, else `onboarding`.

## `onboarding.tsx` — 7 screens (`docs/04`)
1. Label Fatigue · 2. No Barcodes/Scores · 3. Personalize (Quick Pack pills, writes default
profile) · **4. Name** (first-name field, "why we ask" copy, Continue/Skip) · 5. 4-Tab Hub ·
6. 10-Scan Trial · 7. Founding Member pricing → `Start My 10 Free Scans` → `(tabs)`.
- Consumes no scan. Sets `hasOnboarded`. Name (if given) → `app_meta.firstName` + default
  profile name.

## `(tabs)/index.tsx` — Home (`docs/05`)
- Header: "Good Morning, {firstName}" with graceful fallback.
- Profile chips row: select (sets active profile), `Edit` (opens `profile-edit`),
  `Add Profile +`.
- Protection Summary: 5 stat tiles — Labels Read, Red Flags Caught, Clean Scans,
  Skimpflation Caught, Reformulations Caught (last two may be a secondary row / reveal when
  non-zero). Values from the `stats` singleton, refresh on focus.

## `(tabs)/scan.tsx` — Scan (`docs/05`, `docs/06`, `docs/08`)
- State 1 Standby: meter pill (trial only), `Start Camera Scanner` / `Paste` / `Choose Photo`.
- State 2 Locked (`freeScansUsed >= 10`, not premium): lock icon + `Unlock Unlimited Scans -
  $24.99` ($39.99 struck through); all inputs disabled.
- State 3 Active: live camera + cyan boxes + 3s countdown.
- On result → set `appStore.lastScan`, navigate to `results`.

## `results.tsx` (`docs/07`)
- Clean: cyan header "No red flags detected", full paragraph, `Save to Pantry` →
  `save-to-pantry`.
- Flagged: red header "Red flags detected", offending tokens highlighted red, charcoal
  breakdown card (ingredient · category · profile filter).
- Secondary: `Scan Another Item` (→ `Unlock Unlimited Scans` if the 10th scan was just used)
  and `Return to Home`.
- Commits stats once, on mount, via `commitScanStats`.

## `save-to-pantry.tsx` (`docs/07`)
- Camera viewfinder "Snap a photo of the front of the packaging" → compress thumbnail →
  modal for Brand + Product → write `pantryItem` with `originalIngredients` = scanned list,
  `dateAdded`/`lastVerifiedDate` = now.

## `(tabs)/pantry.tsx` (`docs/05`, `docs/07`)
- Section 1 Recheck list: items with `now − lastVerifiedDate > 30d` (clamp negatives).
  Header/subtitle verbatim. Tapping a task → intercept modal ("Only scan a NEWLY PURCHASED
  box…") → `Yes, open camera` (→ recheck scan) / `Remind me later`.
- Section 2 Grid: up-to-date items (thumbnail, brand, product).
- Section 3 Recent Changes: items with `deletedAt` within 24h, each with `Undo`; purge after.
- Empty state (grid AND log empty): calming graphic + verbatim copy.

## `recheck-result.tsx` (`docs/07` §7.1) — NEW
- Outcome 1 identical: green toast, reset timer, back to grid.
- Outcome 2 changed_safe: orange "Recipe Change Detected", breakdown of skimpflation/
  reformulation, "No Active Red Flags Detected" badge, `Keep` / `Delete`.
- Outcome 3 changed_flagged: Alert Red screen, names added ingredient(s) + which filter,
  `Delete` (primary) / `Keep` (muted).
- Applies the Keep/Delete repository effects and the recheck stat increments.

## `profile-edit.tsx` (`docs/05`, `docs/09`)
- Bottom sheet: 11 Quick Pack pills; expandable category rows (name, "N names · tap for
  details", classification badge, on/off switch); per-ingredient toggles; custom-ingredient
  text field + `Add`. Writes through activation functions to the DB; reflects on reload.

## `(tabs)/settings.tsx` (`docs/05`, `docs/08`)
- First Name field (→ `app_meta.firstName`).
- `Restore Purchases` + Trial/Premium status.
- `Report an Issue / Contact Us`.
- `Privacy Policy` / `Terms of Service` links.

## `paywall.tsx` (`docs/08`)
- $24.99 card, $39.99 struck through, the pitch copy, buy button → `purchaseLifetime` → on
  success dismiss and unlock.

## Cross-cutting
- All text in Atkinson Hyperlegible; respects Dynamic Type; WCAG AA both themes; state never
  by colour alone (icon + label always).
- Review prompt (`expo-store-review`) requested per `docs/10` triggers, never on the results
  screen itself, never gated on positive sentiment.

**Acceptance checks**: the spec's User Story acceptance scenarios (US1–US8) map onto these
screens; `/speckit-tasks` turns each into implementation + a screen/integration test where
one is feasible, and a `quickstart.md` manual step where it needs a device.
