# Flagged — Claude Code

This is a React Native + Expo app. Read the docs in order before writing any code.

## Documentation

All architecture, design, and implementation specs live in `docs/`:

- `docs/01-overview.md` — what the app does
- `docs/02-architecture.md` — folder structure and stack decisions
- `docs/03-data-models.md` — TypeScript interfaces
- `docs/04-onboarding.md` — onboarding flow
- `docs/05-navigation-and-tabs.md` — Expo Router structure and tab bar
- `docs/06-ocr-engine.md` — camera + Claude vision API integration
- `docs/07-results-and-rescan.md` — scan results and recheck flow
- `docs/08-monetization.md` — paywall and pricing ($24.99/yr)
- `docs/09-design-system.md` — colors, typography, component patterns
- `docs/11-setup-and-run.md` — how to run locally
- `docs/14-camera-ocr-integration.md` — camera implementation detail
- `docs/17-mockup-screens.md` — **screen-by-screen visual reference with screenshots**

## Mockup screenshots

Every screen has been designed in Figma. Screenshots are in `docs/screenshots/`.
See `docs/17-mockup-screens.md` for the full index — which files map to which screens,
and how numbered variants (e.g. `_2`, `_3`) are scroll continuations of the same screen.

## Stack

- React Native + Expo SDK (latest stable)
- Expo Router for file-based navigation
- TypeScript
- React Native StyleSheet only — no Tailwind, no CSS, no className
- @shopify/flash-list for lists
- expo-camera for the viewfinder
- expo-linear-gradient for gradients
- Atkinson Hyperlegible font via @expo-google-fonts/atkinson-hyperlegible

## Hard rules

- No HTML elements (div, span, button, img, p) — use View, Text, Pressable, Image
- No className, no CSS strings
- No web APIs (localStorage, document, window)
- Always check docs/09-design-system.md and docs/screenshots/ before writing UI
- Always check docs/03-data-models.md before defining types
