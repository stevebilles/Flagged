# 14 — Camera & OCR Integration

> **Status: IMPLEMENTED — rewritten 2026-09-23 to match the code.** The authoritative capture
> design is the doc comment at the top of `src/ocr/CameraScanner.tsx`. History: the first
> implementation was a hands-free 3-second live scan (ML Kit, live bounding boxes, frame-to-frame
> stitching); it was replaced on 2026-09-13 by Apple Vision OCR (`modules/vision-ocr`) and then by
> the manual-shutter, fixed-frame still-photo capture described below. The pipeline downstream of a
> captured paragraph (normalize → match → results → stats) is built and tested (docs/06, `07`,
> `13`).

## The chosen stack

- **`react-native-vision-camera` `4.5.1`** — live preview and still-photo capture (`takePhoto`).
  The JS code no longer runs a **frame processor**: `enableFrameProcessors` is still `true` in
  `app.config.ts`, `react-native-worklets-core` `1.3.3` is still installed and its babel plugin is
  still in `babel.config.js`, and the native module still ships a frame-processor plugin, but
  nothing in `src/` or `app/` calls or imports any of them.
- **`modules/vision-ocr`** (local native module, iOS) — Apple's own on-device Vision framework
  (`VNRecognizeTextRequest`) called directly. JS API: `recognizeText(uri)` (still-photo OCR),
  `getImageSize`, `detectDocumentCorners`, `correctPerspective`. Replaced
  `react-native-vision-camera-text-recognition` (Google ML Kit, 2026-09-13) — see `docs/02`'s "one
  real tradeoff" for why. Fully offline; iOS only for now (Android, not yet built, would need its
  own engine).
- **`expo-image-picker`** (Choose Photo) and **`expo-clipboard`** (Paste).

`app.config.ts` adds the image-picker photo-permission string and the camera permission text.

## How capture works (as implemented)

`src/ocr/CameraScanner.tsx` exports `useCameraCapture`, which returns two pieces of UI —
`boxContent` and `footer` — that `app/(tabs)/scan.tsx` drops into its own viewfinder box and button
slots. The camera renders **inline**, never full-screen.

Phases: **waiting** (live feed + dashed cyan guide box + `[ 📸 Capture ]`) → **processing** →
**shotDone** (`[ Done ]` / `[ Scan More ]` / `[ Cancel ]`). If camera permission is missing it shows
`[ Grant camera access ]` / `[ Back ]`; `scan.tsx` also offers Paste / Choose Photo as alternates.

On **Capture** (`handleCapture`):

1. `camera.takePhoto()` → still image.
2. `getImageSize` + `guideBoxToPhotoCorners` (`src/ocr/guideBox.ts`) map the on-screen guide box
   into the photo's pixel space.
3. `correctPerspective` hard-crops (and de-skews) the photo to those corners.
4. `recognizeText` runs Apple Vision on the corrected image.
5. `photoResultToParagraph(result, { dropEdgeClippedText: true })` (`src/ocr/recognition.ts`)
   assembles the blocks into one paragraph, dropping any line the guide box's edge sliced through
   (so a nutrition-facts footnote or second-language repeat from just outside the box can't bleed
   in).
6. `stitch(accumulated, text)` (`src/ocr/stitch.ts`) joins it onto any earlier capture from this
   session — that is what makes **Scan More** work for a list that wraps a curved can/jar or is too
   wide for one frame.

**Done** hands the assembled paragraph to `runScan(paragraph, "camera")` in `scan.tsx`. A failed
read shows "Couldn't read that photo. Try again." and returns to *waiting*. There is no manual crop
step and no raw-text proofreading step — the Results screen shows only each matched term's correct
spelling (`docs/06`).

## The other two input paths

- **Paste** — `expo-clipboard` `getStringAsync()` → `runScan(text, "paste")`; an empty clipboard
  shows a friendly error.
- **Choose Photo** — `expo-image-picker` → `recognizeText(uri)` → `photoResultToParagraph` →
  `runScan(..., "photo")`.

All three funnel a `paragraph: string` into `runScan()`, which calls `evaluateScan()` (or
`evaluateScanForAll()` in "All profiles" mode) and routes to the Results screen.

## Validation & stats rules (already enforced)

`evaluateScan()` checks for an ingredient-list indicator and returns `aborted: "illegible"` on
illegible captures, which **commits nothing** to stats (docs/06). Don't duplicate this logic in the
camera layer; just pass the assembled paragraph through. Stats are committed on the Results screen
(`docs/06` "Stats rule").

## Testing

- **Automated:** `src/__tests__/recognition.test.ts` (block → paragraph adapter),
  `stitch.test.ts`, and `guideBox.test.ts` cover the pure logic here; `npm test` runs the whole
  suite (9 suites, 120 tests as of 2026-09-23). None of it can exercise the native camera or Vision
  module.
- **Device-only (cannot be automated in CI/sandbox):**
  - OCR **accuracy** on real printed labels of varying quality (glossy, **curved cans/jars**, small
    type, handwritten bakery labels per docs/01).
  - The guide-box crop lines up with what the user aimed at (a `__DEV__` log in `handleCapture`
    prints the crop corners and recognized blocks for checking this).
  - Camera permission prompt copy + denial handling.
  - Fully offline behavior (airplane mode).

## Definition of done

- [x] `CameraScanner` renders the live feed inline with a dashed guide box and a Capture button.
- [x] Capture → perspective-corrected crop → Apple Vision OCR → paragraph handed to `runScan()`.
- [x] Scan More joins a second capture onto the first.
- [x] Paste + Choose Photo produce real paragraphs via clipboard / `recognizeText`.
- [x] Illegible capture → friendly error, nothing committed to stats (via `evaluateScan`).
- [x] Typechecks; pure logic unit-tested.
- [ ] **Device verification** of OCR accuracy, guide-box alignment, and offline behavior (above).
