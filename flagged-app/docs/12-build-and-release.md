# 12 — Build & Release

How to produce store-ready builds and submit Flagged to the App Store and Google Play, using
**EAS Build/Submit**. Assumes setup from `11-setup-and-run.md`.

## Identifiers (single source of truth)

| What | Value |
|---|---|
| iOS bundle identifier | `com.billesappcoinc.flaggedingredientscanner` |
| Android package | `com.billesappcoinc.flaggedingredientscanner` |
| IAP product ID | `flagged_annual` (auto-renewing subscription, $24.99/yr) |
| RevenueCat entitlement | `premium` |
| RevenueCat offering | `default` |

These live in `app.config.ts` and `src/purchases/purchases.ts`. Change in one place only.

## Versioning

- `version` in `app.config.ts` = the **marketing version** (e.g. `1.0.0`) shown in stores.
- Build numbers (`ios.buildNumber`, `android.versionCode`) are auto-incremented by EAS when
  `autoIncrement` is set in `eas.json`.
- Follow semver for `version`; bump the patch for fixes, minor for features.

## EAS configuration

Install and log in once:

```bash
npm i -g eas-cli
eas login
eas init            # links the project to your Expo account (writes projectId)
```

The build + submit profiles live in **[`eas.json`](../eas.json)** (already committed). Profiles:

- **development** — dev client for a physical device (live reload; includes native modules).
- **development-simulator** — dev client for an iOS Simulator (Mac only).
- **preview** — internal distribution build (TestFlight / Android internal track).
- **production** — store submission build.

> **New to EAS / on Windows?** Follow the step-by-step in
> [`16-first-build-on-windows.md`](16-first-build-on-windows.md) to get the app on an iPhone with
> no Mac.

## Secrets (RevenueCat keys)

Public SDK keys are read from `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY` (docs/08).
For cloud builds, set them as EAS environment values so they're injected at build time:

```bash
eas env:create --name EXPO_PUBLIC_RC_IOS_KEY --value appl_xxxx --environment production
eas env:create --name EXPO_PUBLIC_RC_ANDROID_KEY --value goog_xxxx --environment production
```

> These are *public* keys (safe in the binary); using env keeps them out of source control. Never
> put the RevenueCat **secret** key in the app.

## Building

```bash
# Dev client (for local development against Metro)
eas build --profile development --platform ios
eas build --profile development --platform android

# Internal preview (TestFlight / internal testing track)
eas build --profile preview --platform all

# Production (store submission)
eas build --profile production --platform all
```

Builds run in the cloud; the CLI prints a URL to download the artifact / view logs.

## Submitting

### iOS → App Store / TestFlight

Prereqs (done once in App Store Connect):
- App record created with bundle ID `com.billesappcoinc.flaggedingredientscanner`.
- **Agreements, Tax, and Banking** = Active (required for paid IAP — docs/08).
- IAP `flagged_annual` created (auto-renewing subscription, 1-year, $24.99) and submitted with the app.
- Store listing metadata + screenshots (see `15-store-listing.md`).

```bash
eas submit --profile production --platform ios --latest
```

Then in App Store Connect: attach the build, complete **App Privacy** answers (see
`15-store-listing.md` — everything is on-device), add the IAP to the version, and submit for review.

### Android → Google Play

Prereqs:
- App created in Play Console with package `com.billesappcoinc.flaggedingredientscanner`.
- Subscription product `flagged_annual` created + activated ($24.99/yr).
- A **Google service account JSON** with Play Developer API access (for `eas submit`).
- Data safety form completed (on-device; no collection).

```bash
eas submit --profile production --platform android --latest
```

Upload to **internal testing** first, validate IAP with a license tester, then promote to
production.

## Release checklist

- [ ] `npm run typecheck` and `npm test` pass
- [ ] `version` bumped in `app.config.ts`
- [ ] Atkinson Hyperlegible fonts present (docs/11) — UI renders as designed
- [ ] RevenueCat keys set as EAS env; entitlement `premium` maps to `flagged_annual`
- [ ] IAP created + priced in both stores; iOS Agreements Active
- [ ] `diagnosePurchases()` run on a device build → offering found, product resolves, entitlement OK
- [ ] Store listings complete (`15-store-listing.md`), Privacy Policy + Terms URLs live (`legal/`)
- [ ] Sandbox/license-tester purchase + **Restore Purchases** verified on a real device
- [ ] Offline check: airplane mode, confirm a premium user is NOT locked out (cached entitlement)
- [ ] 10-scan trial → hard paywall verified; illegible scan does not consume a scan (docs/06/08)

## CI (optional)

A GitHub Actions workflow can run `typecheck` + `test` on PRs, and trigger `eas build` on tags.
Keep store credentials in repository secrets, never in the repo.
