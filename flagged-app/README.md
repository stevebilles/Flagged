# Flagged — Build Documentation & Seed Data

**Flagged** is a personalized, **100% offline** food-label ingredient scanner. Point the camera at
an ingredient list; the app reads the raw text on-device and highlights ingredients that match the
user's personal "Red Flag" filters. No barcodes, no health scores, no backend.

This folder is the **AI build handoff**: a complete spec for building the app, plus the bundled
ingredient dictionary the app ships with.

## Platform decision: React Native + Expo

The original brief targeted native Swift/SwiftUI. We build with **React Native + Expo** instead so
the app can ship to **iOS now and Android in the near future** from one codebase — while preserving
the moat (on-device OCR, local storage, offline purchase entitlement). See
[`docs/02-architecture.md`](docs/02-architecture.md) for the full native→RN mapping.

## Read the docs in order

| # | Doc | What it covers |
|---|---|---|
| 01 | [`docs/01-overview.md`](docs/01-overview.md) | Strategy, moat, target user, principles |
| 02 | [`docs/02-architecture.md`](docs/02-architecture.md) | RN/Expo stack, native→RN mapping, folders |
| 03 | [`docs/03-data-models.md`](docs/03-data-models.md) | Local DB schemas + seed loading |
| 04 | [`docs/04-onboarding.md`](docs/04-onboarding.md) | 6-screen onboarding (exact copy) |
| 05 | [`docs/05-navigation-and-tabs.md`](docs/05-navigation-and-tabs.md) | The 4-tab hub, all states |
| 06 | [`docs/06-ocr-engine.md`](docs/06-ocr-engine.md) | Capture, stitching, normalization, matching |
| 07 | [`docs/07-results-and-rescan.md`](docs/07-results-and-rescan.md) | Results + Pantry diff engine |
| 08 | [`docs/08-monetization.md`](docs/08-monetization.md) | 10-scan trial, paywall, offline entitlement |
| 09 | [`docs/09-design-system.md`](docs/09-design-system.md) | Colors, typography, components |
| 10 | [`docs/10-aso-review.md`](docs/10-aso-review.md) | In-app review triggers |
| — | [`docs/data-schema.md`](docs/data-schema.md) | Seed file shape + **activation rules** |

## The bundled dictionary

- **File:** [`assets/data/ingredients.json`](assets/data/ingredients.json)
- **Contents:** 11 Quick Packs, 20 canonical categories, **283** unique ingredients.
- **How it's used:** parsed into local SQLite on first launch; every install has identical data;
  selecting a Quick Pack activates its categories/ingredients for the active profile.
- **Regenerate:** run [`tools/build_seed.py`](../tools/build_seed.py) from the repo root (it holds
  the verbatim term lists sourced from the 11 `*/… Quick Pack.md` files, de-duplicates, applies
  classifications, and prints a per-category count verification).

```bash
python3 tools/build_seed.py     # writes flagged-app/assets/data/ingredients.json
```

## Source of truth for the dictionary

The 11 top-level folders in this repo (`Artificial Dyes/`, `Big-9 Allergens/`, …) hold the original
`.md`/`.docx` term lists and the UI reference screenshots. `ingredients.json` is the consolidated,
app-ready form of that data.
