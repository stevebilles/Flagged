# 11 — Setup & Run

How to get the Flagged Expo app running locally. The app uses native modules
(`react-native-vision-camera`, `react-native-purchases`), so **Expo Go will not work** — you must
build a **custom dev client**.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ (LTS) | Use nvm to manage versions |
| npm | 9+ | Ships with Node |
| Watchman | latest | Recommended on macOS for file watching |
| Xcode | 15+ | iOS builds; iOS 17 SDK required (docs/02) |
| CocoaPods | 1.14+ | `sudo gem install cocoapods` |
| Android Studio | latest | Android SDK, platform-tools, an emulator |
| JDK | 17 | For Android builds |
| EAS CLI | latest | `npm i -g eas-cli` (for cloud builds) |
| Apple Developer account | — | To run on a physical iPhone / submit |

## First-time setup

```bash
cd flagged-app
npm install                 # installs deps + generates package-lock
cp .env.example .env        # add RevenueCat keys later; app runs in trial mode without them
```

Validate the toolchain before building anything native:

```bash
npm run typecheck           # tsc --noEmit → 0 errors
npm test                    # jest → domain logic tests pass
```

## Fonts (do this before capturing screenshots)

The UI is designed around **Atkinson Hyperlegible** (docs/09). Until the TTFs are present the app
falls back to the system font.

1. Download from the Atkinson Hyperlegible repo (OFL licensed):
   `AtkinsonHyperlegible-Regular.ttf`, `-Bold.ttf`, `-Italic.ttf`, `-BoldItalic.ttf`.
2. Place them under `flagged-app/assets/fonts/`.
3. Enable the `require(...)` lines in `src/design/useAppFonts.ts` (they're commented with
   `TODO(assets)`).

## Build & run the dev client

The dev client is a custom build of the app shell that Metro connects to.

### iOS (simulator or device)

```bash
npx expo run:ios            # builds + installs the dev client, then boots the app
# for a specific device:
npx expo run:ios --device
```

Then, for subsequent runs, just start Metro:

```bash
npm start                   # expo start --dev-client
```

> In-app purchases require a **real device** + a Sandbox tester (docs/08). The camera also needs a
> real device for meaningful OCR (the simulator has no camera).

### Android (emulator or device)

```bash
npx expo run:android
npm start                   # subsequent runs
```

## What runs without any native setup

Even before fonts/keys/camera are wired, the app boots and these work end-to-end (docs cross-refs):
- First-launch DB seed from `assets/data/ingredients.json` → SQLite (`03`)
- Onboarding, Home, Profile editor, Pantry, Settings (`04`, `05`)
- The full matching pipeline via **stubbed sample text** in `app/(tabs)/scan.tsx` (`06`)
- Results, paywall, save-to-pantry flows (`07`, `08`)

The one stubbed piece is the **live camera OCR** — see `14-camera-ocr-integration.md`.

## Troubleshooting

- **"Something went wrong" in Expo Go** → expected. Use the dev client (`expo run:ios/android`).
- **Pod install fails** → `cd ios && pod repo update && pod install`, or delete `ios/` and re-run
  `npx expo prebuild --clean`.
- **Metro cache weirdness** → `npx expo start -c` (clears the transform cache).
- **Fonts not applied** → confirm the TTF filenames match the keys in `theme.ts` `fontFamily`.
- **Purchases show "Trial" only** → no RC key in `.env` yet; this is normal (docs/08).
- **Camera permission prompt copy** → edit `NSCameraUsageDescription` / Android permission strings
  in `app.config.ts`.

## Useful scripts (package.json)

```bash
npm start          # Metro (dev client)
npm run ios        # expo run:ios
npm run android    # expo run:android
npm run typecheck  # tsc --noEmit
npm test           # jest
npm run lint       # eslint
npm run seed:build # regenerate assets/data/ingredients.json from tools/build_seed.py
```
