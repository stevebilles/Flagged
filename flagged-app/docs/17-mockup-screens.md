# 17 — Figma Mockup Screen Reference

All screens were designed and prototyped in Figma Make before React Native development began.
Screenshots live in `docs/screenshots/`. Use them as the visual source of truth when building
or reviewing any screen.

Numbered variants (e.g. `_2`, `_3`) are **scroll continuations** of the same screen — the screen
is taller than one viewport. Read all numbered variants together as a single scrollable layout.

---

## Screen index

### Tab screens

| Screen | File | Screenshots |
|--------|------|-------------|
| Home | `app/(tabs)/index.tsx` | `home.png` → `home_2.png` |
| Scan | `app/(tabs)/scan.tsx` | `scan.png`, `scan_camera_permissions_overlay.png` |
| Pantry | `app/(tabs)/pantry.tsx` | `pantry.png` → `pantry_2.png` |
| Settings | `app/(tabs)/settings.tsx` | `settings.png` → `settings_2.png` |

### Stack screens

| Screen | File | Screenshots |
|--------|------|-------------|
| Results — Clean | `app/results.tsx` | `results_clean.png` |
| Results — Flagged | `app/results.tsx` | `results_flagged.png` → `results_flagged_2.png` |
| Pantry Detail | `app/pantry-item.tsx` (`?id=<itemId>`) — photo, brand/product, profile pill, **Scan History** card, Remove from Pantry. Edit and the ingredient list from the mockups are not built (`05`). | `pantry_item_scan_history_v2.png` — the owner's 2026-09-25 mockup; **only its Scan History section was specified** (ignore the rest of it). `pantry_detail.png` is older. |
| Scan History | `app/scan-history.tsx` (`?id=<itemId>`) | `scan_history_v2.png` (owner's 2026-09-25 mockup) |
| Recheck Detail | *(no separate screen — mockup only; tapping Recheck on the Pantry goes straight to `app/recheck-capture.tsx`)* | `recheck_detail.png` |
| Recheck Result — Unchanged | `app/recheck-result.tsx` | `recheck_result_clean_v2.png` — the owner's 2026-09-25 mockup, build from this one. The older `recheck_result_clean.png` is **superseded** — ignore it. |
| Recheck Result — Changed | `app/recheck-result.tsx` *(see note below)* | `recheck_result_changed.png` → `recheck_result_changed_2.png` |
| Recheck Result — New Red Flag | `app/recheck-result.tsx` | `recheck_result_red_flag.png` → `recheck_result_red_flag_2.png` — **superseded** (the owner is supplying a new mockup, 2026-09-25); don't build from these. |
| Profile Edit | `app/profile-edit.tsx` (`?id=<profileId>`) | `profile_edit.png` → `profile_edit_2.png` → `profile_edit_3.png` → `profile_edit_4.png` |
| Profile New | `app/profile-edit.tsx` (`?new=1`) | `profile_new.png` → `profile_new_2.png` → `profile_new_3.png` |
| Save to Pantry | `app/save-to-pantry.tsx` | *(no mockup)* |
| Paywall | `src/purchases/PaywallView.tsx` (shown inline in `app/(tabs)/scan.tsx`; also `app/paywall.tsx`) | `paywall.png` *(layout and copy only — its colors/font are not the brand's; the code uses the design system, `09`)* |
| Subscription details | `app/subscription-details.tsx` (opened from the paywall's "Subscription details" link) | *(no mockup)* |
| Onboarding (7 screens) | `app/onboarding.tsx` | *(no screenshot in `docs/screenshots/`; flow pending redesign, see `04`)* |

> **Notes (2026-09-23):** (1) The code's `recheck-result.tsx` implements **two** outcomes —
> `identical` and `changed_flagged` (`07` §7.1); the "Changed" mockup (a "changed but
> unflagged" state) no longer maps to a separate outcome. (2) Some mockups predate later UI
> changes: Quick Pack pills were removed from the profile editor, Settings' upsell card was
> removed on 2026-09-21, and `results_clean.png` still shows an INGREDIENTS card and an "All
> ingredients clear for …" line that the clean result no longer has (2026-09-24 — it shows only the
> verdict and "for <profile>"). Where a mockup and the code disagree, the code wins.

---

## Screenshot descriptions

```
screenshots/
  home.png                            ← Home, top (greeting, active profile, stats)
  home_2.png                          ← Home, scrolled (scan CTA, recent scans list)
  pantry.png                          ← Pantry, top (recheck due + recent changes)
  pantry_2.png                        ← Pantry, scrolled (saved products grid — the mockup's "CLEARED PRODUCTS" title and "all clear" subtitle are not used, see `05`)
  pantry_detail.png                   ← Single product: scan history timeline + ingredients
  profile_edit.png                    ← Profile edit, top (name + color picker)
  profile_edit_2.png                  ← Profile edit, scrolled (filter pack list)
  profile_edit_3.png                  ← Profile edit, scrolled further
  profile_edit_4.png                  ← Profile edit, bottom (save button)
  profile_new.png                     ← New profile, top
  profile_new_2.png                   ← New profile, scrolled (filter pack list)
  profile_new_3.png                   ← New profile, bottom (save button)
  recheck_detail.png                  ← Saved ingredient list + amber warning + rescan CTA
  recheck_result_changed.png          ← Recheck: ingredients changed, top
  recheck_result_changed_2.png        ← Recheck: ingredients changed, scrolled (diff)
  recheck_result_clean.png            ← Recheck: no changes detected
  recheck_result_red_flag.png         ← Recheck: new red flag found, top
  recheck_result_red_flag_2.png       ← Recheck: new red flag found, scrolled
  results_clean.png                   ← Scan result: no flags, save to pantry CTA
  results_flagged.png                 ← Scan result: flags found, top (verdict + ingredients)
  results_flagged_2.png               ← Scan result: flags found, scrolled (breakdown list)
  scan.png                            ← Camera viewfinder with sweep line animation
  scan_camera_permissions_overlay.png ← Camera permission request overlay
  settings.png                        ← Settings top: plan status (the upsell card in this mockup was removed 2026-09-21)
  settings_2.png                      ← Settings scrolled: appearance, notifications, links
```
