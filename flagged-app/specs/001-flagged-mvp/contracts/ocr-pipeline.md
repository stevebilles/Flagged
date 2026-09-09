# Contract — OCR Capture Pipeline (`src/ocr/`)

Capture is native (`react-native-vision-camera` + on-device recognizer); assembly is pure
TypeScript. No network at any step.

## Live capture (`CameraScanner.tsx` + `recognition.ts`)
- No shutter button. A fixed ~3-second window with a visible countdown.
- Live cyan (`#22D3EE`) bounding boxes drawn over recognized text, transparent fill.
- Per frame: emit recognized text blocks with geometry + text; throttled to a sustainable
  rate to keep preview responsive.
- Requires camera permission; on denial, show the reason and route the user to the Paste /
  Choose Photo inputs.

## Block dedupe + spatial sort (`stitch.ts`)
- Dedupe a block already seen this session by identity (geometry + text signature).
- Sort surviving blocks by Y then X to reconstruct reading order.

## Frame-to-frame stitching (`stitch.ts`)
- Merge trailing text of frame *N* with leading text of frame *N+1* via longest-common-
  substring / overlap search; no duplicated or dropped runs across the seam.
- At t=0 the assembled paragraph is frozen and passed to normalization.

## Alternate inputs (same downstream path)
- **Paste**: text → `normalizeParagraph` → `matchParagraph`. No camera/stitch.
- **Choose Photo**: single-image on-device OCR → normalize → match.

## Output
- A single raw paragraph string → `evaluateScan()` (see purchases-gating / matching
  contracts).

**Acceptance checks** (→ tests, mostly `stitch.ts` unit + device manual)
- Overlapping frames merge on the seam without duplication (unit).
- Deduped block ids are not re-added (unit).
- Spatial sort rebuilds reading order from shuffled blocks (unit).
- Illegible capture → `evaluateScan` returns `aborted` → error screen, no scan consumed
  (unit on `evaluateScan`; device manual for the camera path).
- Device manual: live boxes + countdown visible; permission-denied path offers alternates;
  long list panned across several frames yields one clean paragraph.
