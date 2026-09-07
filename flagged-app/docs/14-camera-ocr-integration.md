# 14 — Camera & OCR Integration

This is the **one native piece** the skeleton leaves stubbed. Everything downstream of a captured
paragraph (normalize → match → results → stats) is already built and tested (docs/06, `07`, `13`).
This doc explains how to replace the stub with a real on-device live scanner.

## What's already built (don't rebuild)

- `src/ocr/stitch.ts` — pure TS: `sortBlocks()` (spatial sort), `stitch()` (seam merge via longest
  common substring), `assembleParagraph()` (dedup by block id + stitch frames).
- `src/matching/*` — normalize, regex-clean, exact + fuzzy Levenshtein matcher.
- `src/domain/scanService.ts` — `evaluateScan()` and `commitScanStats()` (trial/stats rules).
- `app/(tabs)/scan.tsx` — the Scan tab with standby / paywall / (to build) live states. The stub is
  `startCameraScanner()`, which currently feeds sample text into `runScan(paragraph)`.

**Your job:** produce a `paragraph: string` from the live camera and pass it to the existing
`runScan()`. That's the entire integration surface.

## The contract

The camera layer must, over a ~3-second window (docs/06 Step 1):

1. Recognize text blocks per frame **on-device** (no network).
2. Convert each into the existing `RecognizedBlock` shape:
   ```ts
   interface RecognizedBlock { id: string; text: string; x: number; y: number; }
   ```
   - `id`: a stable-ish identifier so a block isn't counted twice as the camera moves (the RN
     analogue of Vision's `RecognizedItem.id`). Derive from block frame + text hash if the OCR lib
     doesn't provide tracking ids.
   - `x`, `y`: block origin in a consistent coordinate space (used by `sortBlocks`).
3. Collect frames as `RecognizedBlock[][]`, then call `assembleParagraph(frames)` to get the
   stitched paragraph.
4. Draw **cyan `#22D3EE`** bounding boxes (transparent fill) over live blocks, with a 3-second
   countdown; at 0s, stop and hand the paragraph to `runScan()`.

## Recommended library choice

`react-native-vision-camera` (already a dependency) provides the camera + **frame processors**.
For on-device OCR, use one of:

- **VisionCamera's text-recognition frame-processor plugin** (wraps Apple Vision on iOS / ML Kit on
  Android), or
- **`@react-native-ml-kit/text-recognition`** for a still-image OCR pass (simpler; pairs well with
  the Photo path).

Both run fully offline. ML Kit's on-device text recognizer is the cross-platform baseline and is
more than sufficient for printed labels (docs/02).

## Wiring outline (live camera)

```tsx
// app/(tabs)/scan.tsx — replace startCameraScanner() with a live capture screen.
import { Camera, useCameraDevice, useFrameProcessor } from "react-native-vision-camera";
import { runOnJS } from "react-native-reanimated";
import { assembleParagraph, RecognizedBlock } from "../../src/ocr/stitch";

// Accumulate frames captured during the 3s window.
const frames: RecognizedBlock[][] = [];

const frameProcessor = useFrameProcessor((frame) => {
  "worklet";
  // 1. Run the on-device OCR plugin on `frame` → recognized text blocks.
  //    const result = scanText(frame); // plugin call (worklet-safe)
  // 2. Map to RecognizedBlock[] { id, text, x, y }.
  // 3. Hand back to JS to accumulate + draw overlays.
  // runOnJS(pushFrame)(blocks);
}, []);

function pushFrame(blocks: RecognizedBlock[]) {
  frames.push(blocks);
}

// When the 3s countdown ends:
function finishCapture() {
  const paragraph = assembleParagraph(frames);
  frames.length = 0;
  runScan(paragraph); // existing pipeline: validate → match → results → stats
}
```

Key points:
- Frame processors run on a **worklet** thread — keep per-frame work light; do the OCR call in the
  worklet, marshal only the small block array back with `runOnJS`.
- Throttle to a sustainable FPS; you don't need every frame.
- Request camera permission first (`Camera.requestCameraPermission()`); the usage strings are set in
  `app.config.ts`.

## The other two input paths (already routed)

`scan.tsx` already calls `runScan()` from **Paste** and **Choose Photo** buttons. For real:
- **Paste**: pass the clipboard text straight to `runScan()` (no camera).
- **Choose Photo**: run a still-image OCR pass (ML Kit) on the picked image, then `runScan()` with
  the recognized text. Use `expo-image-picker` (add dependency) to pick the photo.

## Validation & scan-count rules (already enforced)

`evaluateScan()` checks for an ingredient-list indicator and returns `aborted` on illegible
captures — which does **NOT** consume a free scan (docs/06/08). Don't duplicate this logic in the
camera layer; just pass the assembled paragraph through.

## Testing the integration

- Unit tests for `stitch`/`sortBlocks`/`assembleParagraph` already exist — extend with real
  frame-sequence fixtures (docs/13).
- Camera OCR **accuracy** is device-only: verify on real printed labels of varying quality
  (glossy, curved, small type, handwritten bakery labels per docs/01).
- Confirm dedup prevents double-processing when panning across a long ingredient list.

## Definition of done

- Pointing the camera at a label for 3s produces a correctly-ordered paragraph.
- Cyan bounding boxes track text live; countdown visible.
- Illegible capture → friendly error, no scan consumed.
- Legible capture → routes to the existing Results screen with correct highlights.
- Works on both iOS and Android, fully offline (airplane mode).
