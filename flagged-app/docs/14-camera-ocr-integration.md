# 14 — Camera & OCR Integration

> **Status: IMPLEMENTED.** The live camera OCR is now wired end-to-end (Option A). This doc
> describes the implementation and what remains **device-only** to verify. The pipeline downstream
> of a captured paragraph (normalize → match → results → stats) was already built and tested
> (docs/06, `07`, `13`).

## The chosen stack

- **`react-native-vision-camera` `4.5.1`** — camera + frame processors.
- **`react-native-vision-camera-text-recognition` `^3.x`** — ML Kit on-device OCR frame-processor
  plugin (`useTextRecognition({ language: "latin" }).scanText(frame)` + `PhotoRecognizer` for
  stills). Fully offline on iOS and Android.
- **`react-native-worklets-core` `1.3.3`** — required by the plugin's frame processor; its babel
  plugin is added in `babel.config.js` (before reanimated's, which stays last).
- **`expo-image-picker`** (Choose Photo) and **`expo-clipboard`** (Paste).

`app.config.ts` sets `enableFrameProcessors: true` on the vision-camera plugin and adds the
image-picker photo-permission string.

## What was built

- `src/ocr/recognition.ts` — adapter mapping the plugin's `Text[]` result (tuple-shaped
  `blocks`) into our `RecognizedBlock[]` (`{ id, text, x, y }`). Derives a stable dedup `id` from
  the block's 8px-grid position + a text hash (ML Kit gives no tracking id). Also
  `photoResultToParagraph()` for the still-photo path. Unit-tested in
  `src/__tests__/recognition.test.ts`.
- `src/ocr/CameraScanner.tsx` — the full-screen live scanner: camera feed, permission handling,
  a **3-second countdown**, **cyan `#22D3EE` bounding boxes** over recognized blocks, frame
  accumulation, and `assembleParagraph()` → `onCapture(paragraph)` at 0s.
- `app/(tabs)/scan.tsx` — State 3 renders `CameraScanner`; **Paste** reads the clipboard;
  **Choose Photo** picks an image and runs `PhotoRecognizer`. All three funnel into `runScan()`.

**Integration surface (unchanged):** every path still produces a `paragraph: string` handed to
`runScan()`, which runs `evaluateScan()` (validation + matching) and routes to the results screen.

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

## How the live scan works (as implemented)

`CameraScanner.tsx`, per frame during the 3-second window:

```tsx
const { scanText } = useTextRecognition({ language: "latin" });

const onFrameBlocks = useRunOnJS((blocks) => {
  framesRef.current.push(blocks); // accumulate
  setOverlay(blocks);             // draw cyan boxes
}, []);

const frameProcessor = useFrameProcessor((frame) => {
  "worklet";
  const result = scanText(frame);            // ML Kit, on-device
  const blocks = toRecognizedBlocks(result); // adapter → RecognizedBlock[]
  onFrameBlocks(blocks);                      // marshal back to JS
}, [scanText, onFrameBlocks]);

// at 0s:
const paragraph = assembleParagraph(framesRef.current);
onCapture(paragraph); // → runScan()
```

Key points (all handled):
- Frame processors run on a **worklet** thread; per-frame work is light (OCR call + a small map),
  and only the block array is marshaled to JS via `useRunOnJS` (from `react-native-worklets-core`).
- Camera permission is requested via VisionCamera's `useCameraPermission()`; usage strings live in
  `app.config.ts`.
- Curved surfaces (cans/jars): panning during the 3s window feeds multiple frames; `assembleParagraph`
  dedups (stable block ids) and stitches them into one paragraph — the reason live beats a single photo.

### Tuning knobs (device tuning, may need adjustment)
- **Overlay box size** is a fixed placeholder (`120×28`). ML Kit returns per-block width/height; map
  those into the overlay rects for pixel-accurate boxes, accounting for frame→view coordinate scaling
  and device orientation.
- **FPS throttle**: consider processing every Nth frame if CPU is high.
- **`SCAN_SECONDS`** (3) matches the spec; adjust if real-world capture needs longer.

## The other two input paths (implemented)

- **Paste** — `expo-clipboard` `getStringAsync()` → `runScan()`; empty clipboard shows a friendly error.
- **Choose Photo** — `expo-image-picker` to pick an image → `PhotoRecognizer({ uri, orientation })`
  (ML Kit still OCR) → `photoResultToParagraph()` → `runScan()`.

## Validation & scan-count rules (already enforced)

`evaluateScan()` checks for an ingredient-list indicator and returns `aborted` on illegible
captures — which does **NOT** consume a free scan (docs/06/08). Don't duplicate this logic in the
camera layer; just pass the assembled paragraph through.

## Testing

- **Automated (done):** `src/__tests__/recognition.test.ts` covers the adapter (tuple→block
  mapping, dedup-id stability, resultText fallback, null-safety) and its integration with
  `assembleParagraph`. `stitch`/`sortBlocks`/`assembleParagraph` are covered too. `npm test` is
  green (19 tests).
- **Device-only (remaining — cannot be automated in CI/sandbox):**
  - OCR **accuracy** on real printed labels of varying quality (glossy, **curved cans/jars**, small
    type, handwritten bakery labels per docs/01).
  - Dedup prevents double-processing when panning across a long ingredient list.
  - Overlay boxes align with text after coordinate/orientation mapping (see Tuning knobs).
  - Camera permission prompt copy + denial handling.
  - Fully offline (airplane mode) on both iOS and Android.

## Definition of done

- [x] `CameraScanner` renders the live feed with a 3s countdown and cyan boxes.
- [x] Frames accumulate and `assembleParagraph` produces one paragraph handed to `runScan()`.
- [x] Paste + Choose Photo produce real paragraphs via clipboard / `PhotoRecognizer`.
- [x] Illegible capture → friendly error, no scan consumed (via existing `evaluateScan`).
- [x] Typechecks; adapter unit-tested.
- [ ] **Device verification** of OCR accuracy, overlay alignment, and offline behavior (above).
