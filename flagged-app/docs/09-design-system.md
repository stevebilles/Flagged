# 09 — Visual Identity, Typography & Design System

## Typography — Atkinson Hyperlegible (exclusive)

Use **Atkinson Hyperlegible** everywhere. It disambiguates easily-confused characters
(`I`, `l`, `1`, `O`, `0`) and reduces eye strain — essential for an app whose whole job is reading
ingredient text.

- Load via `expo-font` from `assets/fonts/` (bundle the TTFs; no network fetch).
- Define weights (Regular / Bold, plus Italic variants) and expose through the theme.
- Never fall back to a system font for primary content.

## Dynamic color system

**No single hex code is shared between modes.** Provide two complete palettes and switch on the
active color scheme. Define these as theme tokens; never hard-code hex in components.

### Dark Mode (default — "X-Ray" feel)
| Token | Hex |
|---|---|
| Canvas (background) | `#111827` |
| Cards / Menus | `#1F2937` |
| Primary Text | `#F9FAFB` |
| Muted Text | `#9CA3AF` |
| Safe / Scanning Cyan | `#22D3EE` |
| Flagged Red | `#EF4444` |
| Warning Orange | `#F59E0B` |

### Light Mode (clinical feel)
| Token | Hex |
|---|---|
| Canvas (background) | `#F1F5F9` |
| Cards / Menus | `#FFFFFF` (with shadow) |
| Primary Text | `#0F172A` |
| Muted Text | `#475569` |
| Safe Cyan | `#0E7490` |
| Flagged Red | `#B91C1C` |
| Warning Orange | `#B45309` |

### Semantic roles
- **Cyan** = safe / scanning affordance (bounding boxes `#22D3EE`, clean-result header, meter).
- **Red** = flagged ingredients + flagged-result header + destructive actions.
- **Warning Orange** = the "Recipe Change Detected" (still-approved) recheck screen (`07`).
  Confirmed tokens: **Dark `#F59E0B`**, **Light `#B45309`** (exposed as `colors.warning`).
- Cards use `#1F2937` (dark) / `#FFFFFF`+shadow (light).

## Category classification badges

Each category row (profile editor, `05`) shows a **classification badge**, sourced from the
dictionary (`classification` field, `03`/`data-schema.md`):

| Classification | Meaning | Suggested badge color |
|---|---|---|
| `regulated` | Legally-recognized allergen / regulated additive (Big-9, nitrates & nitrites, sulfites, trans fats, gluten sources) | Red-tinted |
| `advisory` | Commonly-avoided additives / sugars (dyes, MSG, artificial sweeteners, sugar alcohols, synthetic preservatives, hidden sugars) | Amber/gold |
| `preference` | Dietary preference (seed oils) | Neutral grey |

Badges are display metadata only — they don't change matching logic. Keep them legible in both
modes (contrast-checked).

## Key UI components (build once, reuse)
- **Profile chip** (Home) with `[ Edit ]` affordance + `[ Add Profile + ]`.
- **Quick Pack pill** (selectable; selected = cyan-filled) — profile editor & onboarding S3.
- **Category row**: name, "N names · tap for details", classification badge, on/off switch;
  expandable to individual-ingredient toggles.
- **Meter pill** (Scan): `Scans Remaining: N / 10`.
- **Result header** (cyan clean / red flagged) + **breakdown card** (charcoal).
- **Pantry card** (thumbnail, brand, product) + **recheck checklist row** + **undo row**.
- **Paywall card** ($24.99/yr, framed as "$0.07/day").

## Accessibility
- Respect Dynamic Type / font scaling; layouts must reflow.
- Meet WCAG AA contrast in both modes (the palettes above are chosen with this in mind).
- Don't rely on color alone — pair red/cyan states with icons and text labels.
