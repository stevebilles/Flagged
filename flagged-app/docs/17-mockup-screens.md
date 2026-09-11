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
| Pantry Detail | `app/pantry/[id].tsx` | `pantry_detail.png` |
| Recheck Detail | `app/recheck/[id].tsx` | `recheck_detail.png` |
| Recheck Result — Unchanged | `app/recheck-result.tsx` | `recheck_result_clean.png` |
| Recheck Result — Changed | `app/recheck-result.tsx` | `recheck_result_changed.png` → `recheck_result_changed_2.png` |
| Recheck Result — New Red Flag | `app/recheck-result.tsx` | `recheck_result_red_flag.png` → `recheck_result_red_flag_2.png` |
| Profile Edit | `app/profile/edit.tsx` | `profile_edit.png` → `profile_edit_2.png` → `profile_edit_3.png` → `profile_edit_4.png` |
| Profile New | `app/profile/new.tsx` | `profile_new.png` → `profile_new_2.png` → `profile_new_3.png` |

---

## Screenshot descriptions

```
screenshots/
  home.png                            ← Home, top (greeting, active profile, stats)
  home_2.png                          ← Home, scrolled (scan CTA, recent scans list)
  pantry.png                          ← Pantry, top (recheck due + recent changes)
  pantry_2.png                        ← Pantry, scrolled (cleared products grid)
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
  settings.png                        ← Settings top: plan status, upsell card
  settings_2.png                      ← Settings scrolled: appearance, notifications, links
```
