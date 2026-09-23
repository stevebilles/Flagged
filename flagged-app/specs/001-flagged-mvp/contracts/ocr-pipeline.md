# Contract — OCR Capture Pipeline (`src/ocr/`, `modules/vision-ocr`)

Capture is native (`react-native-vision-camera` for the photo, the local `modules/vision-ocr`
module — Apple Vision, iOS only — for OCR); assembly is pure TypeScript. No network at any step.

> **Rewritten 2026-09-23 to match the code.** The original contract described a hands-free
> ~3-second live scan with a countdown, live bounding boxes, and frame-to-frame stitching. That
> design is gone; the JS code no longer runs a frame processor. Authoritative design: the doc
> comment at the top of `src/ocr/CameraScanner.tsx` (see also `docs/06`, `docs/14`).

## Capture (`CameraScanner.tsx`, `guideBox.ts`)
- **Manual shutter, fixed frame**, rendered inline in the Scan tab's viewfinder box. A dashed cyan
  (`#22D3EE`) **guide box** marks what will be read; the user aims, then taps `Capture`.
- Requires camera permission; on denial show `Grant camera access` / `Back`, and the Scan tab
  still offers Paste / Choose Photo.
- Per capture: `takePhoto` → `getImageSize` → `guideBoxToPhotoCorners` → `correctPerspective`
  (hard crop + de-skew to the guide box) → `recognizeText` (Apple Vision on the corrected image).
- **Scan More** repeats the capture; **Done** hands the paragraph on. There is no manual crop step
  and the raw OCR text is never shown to the user.

## Blocks → paragraph (`recognition.ts`)
- `photoResultToParagraph(result, { dropEdgeClippedText: true })` assembles recognized blocks into
  one paragraph in reading order, dropping any line the guide box's edge sliced through.

## Stitching (`stitch.ts`)
- `stitch(accumulated, text)` joins a later capture onto an earlier one via overlap /
  longest-common-substring search, with no duplicated or dropped runs across the seam. This is
  what lets a list that wraps a curved package (or is too wide for one frame) be read in two shots.

## Alternate inputs (same downstream path)
- **Paste Text**: clipboard text → `runScan`. No camera/stitch.
- **Choose Photo**: image picker → `recognizeText` → `photoResultToParagraph` → `runScan`.

## Output
- A single raw paragraph string → `evaluateScan()` (see the purchases-gating / matching
  contracts): `looksLikeIngredientList` validation, `extractIngredientList`, normalize, match.

**Acceptance checks** (→ tests, mostly pure-logic unit + device manual)
- Overlapping reads merge on the seam without duplication (`stitch.test.ts`).
- The guide box maps to the correct photo-pixel corners (`guideBox.test.ts`).
- Blocks assemble into reading order and edge-clipped lines are dropped (`recognition.test.ts`).
- Illegible capture → `evaluateScan` returns `aborted` → friendly error, nothing committed to
  stats (unit on `evaluateScan`; device manual for the camera path).
- Device manual: the crop lines up with the dashed guide box; permission-denied path offers
  Paste / Choose Photo; a long list read in two shots yields one clean paragraph.
