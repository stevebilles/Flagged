# 06 — The OCR Engine: Capture & Translation

The user **does not press a shutter**. They point the camera and the app does the rest.
Everything here runs **on-device, offline**. No cloud OCR.

**Implementation base:** `react-native-vision-camera` frame processors + an on-device text
recognizer (ML Kit / VisionCamera OCR). The stitching, normalization, and matching stages are pure
TypeScript so they behave identically on iOS and Android.

---

## Step 1 — The 3-second live scan (frame processing)

- **Dynamic highlighting:** draw bounding boxes (**Cyan `#22D3EE` stroke, transparent fill**) over
  recognized text paragraphs, live.
- **Deduplication & spatial sorting:** for each frame, extract recognized text blocks; prevent
  processing the *same* block twice as the camera moves (dedupe on block identity — geometry +
  text signature, the RN analogue of Vision's `RecognizedItem.id`). Sort blocks by **X/Y
  coordinates** to rebuild reading order into a coherent paragraph.
- **String merging (frame-to-frame):** implement **Longest Common Substring** (or **Levenshtein**)
  to stitch the **trailing** text of frame *N* to the **leading** text of frame *N+1*, so panning
  across a long list produces one continuous string without duplication.

## Step 2 — Quality control & normalization

At exactly **0 seconds**, stitching stops.

- **Validation:** check for start indicators (e.g., contains `"ingredients:"`). If the capture is
  illegible / no ingredient list detected → **abort and show an error**. **This does NOT consume a
  free scan** (do not increment `freeScansUsed`; see `08`).
- **Normalization:**
  - lowercase all text,
  - strip line-break hyphens (rejoin words split across lines),
  - tokenize on **commas** and **parentheses**.

## Step 3 — The matching algorithm (hybrid)

Run the normalized token list against the **effective red-flag set** for the **active profile**
(effective set = active categories' ingredients − excluded + custom; see `03`/`data-schema.md`).

1. **Regex cleaning:** sanitize common OCR errors before matching, e.g. `0`→`o`, `1`→`l`
   (and similar confusions). Keep the cleaner conservative to avoid false positives.
2. **Exact match:** compare each cleaned token against dictionary terms **and** the active profile's
   custom ingredients for a 1:1 match.
3. **Fuzzy match:** apply **Levenshtein distance**; if a token has **≥ 85% similarity** to a
   red-flag term, it triggers a flag. (Tune threshold; 85% is the spec baseline.)

Collect every matched token with the ingredient/category it hit — this drives the highlighted
paragraph and the breakdown card in `07`.

---

## Alternate inputs (same pipeline)

- **`[ Paste ]`:** text goes straight into **Step 2** (normalization) → **Step 3** (matching).
  Skip camera/stitching. Still subject to validation and scan-count rules.
- **`[ Choose Photo ]`:** run on-device OCR on the still image → **Step 2** → **Step 3**.

## Scan-count rule (reiterated — important)

Increment `freeScansUsed` (and `totalLabelsRead`) **only** when a scan **successfully extracts text
and routes to a Results Screen**. Aborted, illegible, or cancelled captures cost nothing. See `08`.

## Performance / UX notes

- Keep the frame-processor worklet lightweight; throttle OCR to a sustainable FPS.
- Provide clear affordance during the 3-second window (countdown + live boxes).
- Everything is local; there must be **no** network round-trip anywhere in this pipeline.
