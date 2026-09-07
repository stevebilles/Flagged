# 16 — First Build on Windows → Your iPhone (Zero to App)

A copy-paste checklist to get Flagged running on a **physical iPhone from a Windows PC**, with **no
Mac**. iOS apps are compiled by **EAS Build** (Expo's cloud, runs on their Macs); you install the
result on your phone via a link/QR code.

> Windows can't build iOS locally (that needs Xcode/macOS) — EAS cloud builds are the supported
> path and require no Mac. Android builds also work here the same way.

---

## How will I actually SEE my app? (read this first)

**There is no simulator on Windows.** The iPhone Simulator is Mac-only. That's not a problem here —
**your real iPhone is the preview screen**, which is the correct setup for this app anyway:
Flagged's whole job is scanning food labels with the camera, and a simulator has no real camera.

So the flow is:

1. The build runs in **Expo's cloud** (no Mac, no simulator).
2. When it finishes you get a **QR code**.
3. **Scan it with your iPhone** → the Flagged app installs on your phone like any other app.
4. **Open it on your iPhone** and use it — point the camera at a real cereal box or can.
5. While you run `npm start` on your PC, the app on your phone **live-reloads** when code changes.

Two "levels" of build, so you know the difference:
- **Development build** (what you do first): installed on your iPhone, connected to your PC for live
  reload. Best for testing + fixing.
- **Production build** (later): a standalone app that runs on any iPhone with no computer attached —
  that's the version you eventually submit to the App Store.

**Bottom line:** you won't see a phone window on your PC. You'll hold the app in your hand on your
own iPhone.

---

## 0. What you need first

- [ ] **Node.js 18+** installed on Windows ([nodejs.org](https://nodejs.org)).
- [ ] A **free Expo account** ([expo.dev](https://expo.dev)).
- [ ] An **Apple Developer account** ($99/yr, [developer.apple.com](https://developer.apple.com)) —
      required to install on a physical iPhone. (Enrollment can take a day or two to approve.)
- [ ] Your **iPhone** and its Apple ID.

> No Apple hardware is required — just the *account*. EAS handles the Mac-only signing steps in the
> cloud.

---

## 1. Get the code and install dependencies

Open **PowerShell** or **Command Prompt**:

```powershell
git clone https://github.com/stevebilles/Flagged.git
cd Flagged\flagged-app
npm install
```

Sanity check (optional but nice):

```powershell
npm run typecheck
npm test
```

Both should pass (0 type errors; tests green).

---

## 2. Install the EAS CLI and log in

```powershell
npm install -g eas-cli
eas login
```

Enter your Expo account credentials.

---

## 3. Link the project to your Expo account

```powershell
eas init
```

- If prompted to create a project, say **yes**. This writes an `extra.eas.projectId` into the app
  config and links builds to your account. Commit that change when it appears.

---

## 4. Register your iPhone as a test device

A "development" build can only install on devices Apple knows about. Run:

```powershell
eas device:create
```

Follow the prompt — it gives you a **URL/QR code**. Open it **on your iPhone**, install the small
profile it offers, and your device UDID is registered to your Apple account. (You only redo this
when adding a new test phone.)

---

## 5. Kick off the iOS development build (in the cloud)

```powershell
eas build --profile development --platform ios
```

What happens:
- EAS asks to **log in to your Apple Developer account** and will **automatically create the signing
  certificate and provisioning profile** for you (this is the Mac-only part it does in the cloud).
- Let it generate credentials when prompted (choose "let EAS handle it").
- The build runs on Expo's servers (~10–20 min). The CLI prints a **build page URL**.

> The `development` profile builds a **dev client** — a version of the app that connects to the JS
> bundle served from your PC, so you get live reload. It includes the native camera + purchases
> modules (which is why we can't use Expo Go).

---

## 6. Install the build on your iPhone

- When the build finishes, open the build page (or run `eas build:list` and open the latest).
- There's a **QR code** — scan it with your iPhone camera → install the app.
- First launch: iOS may say the developer is untrusted. Go to
  **Settings → General → VPN & Device Management**, tap your developer profile, and **Trust** it.

---

## 7. Start the dev server and connect

Back on your PC, in `flagged-app`:

```powershell
npm start
```

- A QR code appears in the terminal.
- Open the **Flagged dev app** you just installed → it should connect to your PC's dev server
  (same Wi-Fi network) and load the app. Shake the phone for the dev menu.

You're now running Flagged on your iPhone with live reload. 🎉

---

## 8. Test the real features (the device-only stuff)

These couldn't be verified before a device build — check them now:

- [ ] **Live camera scan** on a real label: point at an ingredient list, watch the cyan boxes +
      3-second countdown, confirm the result screen highlights correctly (docs/14).
- [ ] **Curved surfaces**: scan a can/jar — pan slowly across the curve during the 3 seconds and
      confirm the stitched paragraph is complete.
- [ ] **Choose Photo** and **Paste** paths.
- [ ] **Fonts**: text renders in Atkinson Hyperlegible.
- [ ] **Offline**: airplane mode — scanning, matching, and the pantry still work.
- [ ] Expect to **iterate** on camera/OCR tuning (box alignment, FPS) — that's normal for native
      camera work. Report issues back and they can be fixed against the code.

> **Purchases** will show "Trial" until RevenueCat keys + the store product are set up (docs/08,
> `12`) — that's expected and separate from getting the app running.

---

## Optional: build an Android version too

Same flow, no device registration step needed for an APK:

```powershell
eas build --profile preview --platform android
```

Download the `.apk` from the build page and install it on an Android phone (enable "install unknown
apps").

---

## Troubleshooting

- **Dev app won't connect to `npm start`** → ensure phone and PC are on the **same Wi-Fi**; try
  `npx expo start --tunnel` (works across networks/firewalls).
- **"Untrusted Developer"** → Settings → General → VPN & Device Management → Trust (step 6).
- **Build fails on credentials** → re-run `eas build ...`; when asked, let EAS **generate** the
  certificate/profile rather than supplying your own.
- **Apple account not enrolled yet** → device builds need active enrollment; wait for approval.
- **Camera is black / OCR does nothing** → confirm you're in the **dev build** (not Expo Go), and
  that camera permission was granted; see docs/14 tuning notes.

## Where this maps in the repo

- Build profiles: [`eas.json`](../eas.json)
- Running locally / scripts: [`docs/11-setup-and-run.md`](11-setup-and-run.md)
- Full release + store submission: [`docs/12-build-and-release.md`](12-build-and-release.md)
- Camera/OCR details + what to verify: [`docs/14-camera-ocr-integration.md`](14-camera-ocr-integration.md)
