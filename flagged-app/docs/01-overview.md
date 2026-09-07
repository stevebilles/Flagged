# 01 — Product Overview & Strategy

> **For the AI builder:** This document set specifies **Flagged**, a personalized food-label
> ingredient scanner. It is the source of truth for building the app. Read `01`–`10` in order.
> The app is built with **React Native + Expo** (see `02-architecture.md` for why, and how every
> original iOS-native decision maps to a cross-platform equivalent).

## What Flagged is

Flagged is a **personalized ingredient translator**. Health-conscious consumers and allergy
parents suffer from "label fatigue" because manufacturers use dozens of confusing chemical
names to disguise ingredients.

Instead of forcing users to memorize a chemistry textbook, Flagged uses **on-device OCR** to
read the physical ingredient paragraph, cross-references it against the user's personal
**"Red Flag"** settings, and visually highlights the specific ingredients they want to avoid.

## The competitive moat

The moat is **"a 100% offline X-Ray that reads raw text on any printed label."**

- Unlike cloud competitors (Yuka, Fig) that rely on **barcodes** and arbitrary **health scores**,
  Flagged is an objective offline scanner. It reads raw printed text — even a handwritten bakery
  label.
- **The moat is the offline, on-device capability — not any single vendor SDK.** On-device OCR,
  local persistence, and locally-cached purchase entitlement are all achievable cross-platform.
  See `02-architecture.md`.

## Target user

US moms managing groceries for **multi-trigger households** (dye-free / ADHD, severe food
allergies / celiac).

## Business model

A **metered trial** of **10 free scans** leading to a **one-time lifetime fee of $24.99**.
Designed to combat subscription fatigue and prove the technology works before asking for the sale.
See `08-monetization.md`.

## Non-negotiable product principles

1. **Zero backend.** All processing and storage happen on-device. No cloud APIs for OCR or data.
2. **Offline-first.** The app must fully function with no network, including for a paid user who
   opens it in a store with no signal.
3. **No feature-gating during the trial.** Free users get every feature for 10 successful scans;
   conversion is driven by a hard usage gate, not locked features.
4. **Accessibility-first typography.** Atkinson Hyperlegible everywhere (see `09-design-system.md`).

## Platform roadmap

- **MVP:** iOS 17+ (per the original brief's target audience).
- **Near-term:** Android — enabled for near-free by the React Native + Expo choice. Nothing in
  this spec is iOS-only; all chosen libraries are cross-platform.

## Document map

| Doc | Contents |
|-----|----------|
| `02-architecture.md` | Tech stack, RN/Expo rationale, native→RN mapping, folder structure |
| `03-data-models.md` | Local DB schemas (Profile, PantryItem, Stats) + seed loading |
| `04-onboarding.md` | The 6-screen onboarding flow with exact copy |
| `05-navigation-and-tabs.md` | The 4-tab hub and every screen state |
| `06-ocr-engine.md` | Capture, frame stitching, normalization, hybrid matching |
| `07-results-and-rescan.md` | Clean/Flagged results + the Pantry recheck diff engine |
| `08-monetization.md` | 10-scan trial, hard paywall, offline entitlement |
| `09-design-system.md` | Colors (dark/light), typography, components |
| `10-aso-review.md` | In-app review request triggers |
| `data-schema.md` | The bundled `ingredients.json` shape + activation rules |
