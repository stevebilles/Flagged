# Quickstart & Validation — Flagged V1 MVP

How to run the app and prove the MVP works. Detailed setup lives in
`docs/11-setup-and-run.md` and `docs/16-first-build-on-windows.md`; this file is the
acceptance guide the spec's Success Criteria are checked against.

## Prerequisites

- Node LTS + npm, this repo checked out at `C:\Users\steve\Flagged\flagged-app`.
- An Expo account and EAS CLI (`npm i -g eas-cli`) for device builds.
- A **custom dev client** build (Expo Go is not enough — VisionCamera + RevenueCat are
  native): `eas build --profile development --platform ios` (see `eas.json`).
- A physical iPhone (iOS 17+) for camera OCR, purchases, and offline checks. An emulator is
  fine for everything else.
- For real purchase testing: the non-consumable product created in App Store Connect, mapped
  in RevenueCat, and `EXPO_PUBLIC_RC_IOS_KEY` set as an EAS secret. A Sandbox tester account.

## 1. Fast feedback — pure logic (no device, runs in CI/sandbox)

```
npm install
npm run typecheck
npm test
```

Expected: type check clean; all Jest suites green, including matching, activation, diff,
stitch, and stats-math tests. **This is the merge gate** (Constitution V). A failing
missed-flag/false-clean test blocks merge (Constitution II).

## 2. Run the app on a device

```
npm start           # dev server for the custom dev client
```

Open the dev client on the device, load the project. First launch seeds the dictionary and
creates the stats + default profile rows.

## 3. Acceptance runs

### Automated / emulator-friendly
| Ref | Check |
|---|---|
| US2, SC-007 | Create two profiles with different Quick Packs; paste the same ingredient text; results differ. Deselect one of two packs sharing a category → shared category stays on. |
| US3 | Clean paste result → Save to Pantry (photo + brand + product) → appears in the grid. |
| US4 | Age a pantry item's `lastVerifiedDate` (dev toggle) → it moves to the Recheck list → run identical / changed-safe / changed-flagged rechecks → three distinct screens; Keep vs Delete behave per contract. |
| US5, SC-005 | Paste 10 legible labels → meter counts down to 0 → 11th attempt is locked. Interleave illegible pastes → count does not move. |
| US6 | Fresh install → 7 onboarding screens in order → name entered shows on Home; name skipped → graceful fallback; onboarding never reappears. |
| US7 | Stats tiles update after each scan; a recheck bumps Skimpflation / Reformulations correctly. |
| SC-008 | Set the OS text size to maximum → every screen readable, nothing truncated or overlapping. |

### Device-only (cannot be validated in the sandbox)
| Ref | Check |
|---|---|
| US1, SC-001, SC-002 | Point the camera at ~15 real printed labels (with and without targeted ingredients). Result within 10 s; ≥ 95% of legible targeted ingredients caught; **no** false "clean" on a label that contains a targeted ingredient. |
| SC-003 | Put the device in airplane mode; scan, view result, edit a profile, save to pantry, recheck, view stats — all succeed. |
| US5, SC-004 | Complete a Sandbox purchase → premium unlocks, meter/lock gone. Force-quit, enable airplane mode, relaunch → still premium, no meter, not locked. |
| US5 | `Restore Purchases` on a second device / fresh install with the same Sandbox account → premium restored. Restore with nothing purchased → "no purchases found", no error. |
| US8 | Trigger the 5th flagged ingredient then leave results → native review prompt requested once (OS may suppress it). |
| R6 | Confirm pantry thumbnails are excluded from device backup. |
| FR-031/32/33 | Atkinson Hyperlegible renders everywhere (no system-font flash); both light/dark palettes correct; flagged/clean states show icon + text, not colour alone. |

## 4. Release readiness (see `docs/12`, `docs/15`)

- `npm run typecheck && npm test` green in CI.
- Production build via EAS; store listing, screenshots, and the IAP review screenshot ready.
- Privacy Policy and Terms of Service published and linked in Settings.
- All P0/P1 spec items closed; any known P2/P3 gaps recorded in `tasks.md`.
