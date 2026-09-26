# 06 — The OCR Engine: Capture & Translation

The user aims a guide box at the ingredient list and **taps a shutter button** to capture.
Everything here runs **on-device, offline**. No cloud OCR.

**Implementation base:** `react-native-vision-camera` (live preview + still photo) and
`modules/vision-ocr`, a local native module wrapping Apple's on-device Vision framework directly
(replaced Google ML Kit, 2026-09-13 — ML Kit's iOS accuracy on small/dense/glossy print was not
good enough for a safety-critical ingredient match; see `docs/02`). The stitching, normalization,
and matching stages are pure TypeScript so they behave identically across platforms; the OCR
engine itself is per-platform (Android, not yet built, would need its own).

**Note:** this doc was updated 2026-09-23 to match the code. The capture flow has changed twice
since it was first written: the original hands-free **3-second live scan** (frame processing, live
bounding boxes, frame-to-frame stitching) is gone — the JS code no longer runs a frame processor
at all. Capture is now a **manual-shutter, fixed-frame** still photo (2026-09-13). See the doc
comment at the top of `src/ocr/CameraScanner.tsx` for the authoritative design.

---

## Step 1 — Capture (manual shutter, guide box)

- **Guide box:** the live preview shows a **dashed cyan (`#22D3EE`) guide box**; the user aims it
  at the ingredient list. OCR is automatically restricted to what's inside the box
  (`guideBoxToPhotoCorners`, `src/ocr/guideBox.ts`) — there is no manual crop step.
- **Shutter:** tapping `[ 📸 Capture ]` takes a still photo, which `modules/vision-ocr` reads
  (`recognizeText`; perspective correction via `correctPerspective`).
- **Scan More:** an optional second capture (e.g. a list that wraps around a curved can/jar or is
  too wide for one frame). The two reads are joined by `stitch` (`src/ocr/stitch.ts`, overlap /
  longest-common-substring search) so nothing is duplicated or dropped across the seam.
- **Reading order:** recognized blocks are assembled into one paragraph in reading order
  (`photoResultToParagraph`, `src/ocr/recognition.ts`).
- **No raw OCR text is shown to the user.** OCR can't be typo-free on glossy print, and the matcher
  tolerates letter noise; the Results screen shows only each matched red-flag term's correct
  spelling.

## Step 2 — Quality control & normalization

Once the capture (or pasted text) has been assembled into one paragraph:

- **Validation:** check that it looks like an ingredient list (`looksLikeIngredientList`, e.g.
  contains `"ingredients:"`, or a long comma-dense capture when the header OCR'd away). If the
  capture is illegible / no ingredient list detected → **abort and show an error**;
  `evaluateScan` returns `aborted: "illegible"` and **nothing is committed to stats**.
- **List extraction:** `extractIngredientList` keeps just the ingredient list (and allergen line)
  from the raw text — e.g. only the English list on a bilingual label.
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

- **`[ Paste Text ]`:** text goes straight into **Step 2** (normalization) → **Step 3** (matching).
  Skip camera/stitching. Still subject to the same validation rules.
- **`[ Choose Photo ]`:** run on-device OCR on the still image → **Step 2** → **Step 3**.

## Off-column text is dropped from a camera capture (owner, 2026-09-25)
A rescan of a bread-crumb tin flagged **Fish** as a new red flag. The ingredient list has no fish: the
camera frame also caught a recipe printed down the tin's right side ("Dip fish, chicken…"), and nothing
checked *where* text was, so it was matched like the ingredients. The Metro log's block geometry showed
it plainly — ingredient lines at x ≈ 240–1450, the recipe strip at x ≈ 1440–1740, a separate column.
- **Rule** (`splitOffColumnBlocks`, `src/ocr/recognition.ts`) — **position only; nothing may depend on a
  label having French (or any second language) on it** (owner, 2026-09-25: most users, e.g. in the US,
  never see French; the French on this tin is just what the capture happened to contain): the long
  lines (≥ 60% of the widest block) define the main column; a block with less than half its width inside that column is dropped.
  Applied to guide-box **camera** captures only (`dropOffColumnText`), not Choose Photo (a whole,
  uncropped label). Cautious by design: with fewer than 3 long lines it drops nothing; multi-column
  ingredient lists are safe (each column's lines are long, so the span covers both).
- **Tested on the real capture's positions** (`recognition.test.ts`): the 13 side-strip blocks are
  dropped; the ingredient list, "Contains" line, French repeat and nutrition % values are kept.
- **Text up high, above the list is dropped too** (`splitAboveListBlocks`, same file; owner: "if the OCR
  has identified the ingredient list, everything up high in the corners that isn't in the general
  vicinity should be ignored"). The anchor is the topmost block whose first word looks like
  "ingredient(s)" (fuzzy, colon not required); only if there is none, the topmost block starting with
  "contains" ("ingredient(s)" preferred so a trailing "Contains:" allergen line can't cut the list
  above it). A block whose bottom is more than one header-height above the header's top is dropped, so
  a footnote directly above stays, but a nutrition panel in the corner ("Sodium 210mg", "9%") goes —
  and so would "Dip fish," on the real capture, on its own. No anchor found → nothing dropped. Nothing
  here changes matching or the extraction rules (`extractIngredientList`), and nothing may rely on a
  "Contains" line at the end or a French header.
- **Not covered:** text *below* the list (e.g. a distributor line); nothing needed yet.
- **Decided against (owner, 2026-09-25): finding the list's edges from image colors** (white label →
  black tin, white space). It would need new native pixel-reading code and a new build, and breaks on
  glossy/curved packaging, glare and colored backgrounds. Any further edge-finding uses the OCR's own
  block positions instead (e.g. growing from the guide box's top-left corner, stopping at a bigger
  vertical gap or a shift in the left edge). Don't re-propose color detection.
- **Two-photo scans:** the "above the header" rule is first-photo-only and drops only short blocks, so a
  "Scan More" continuation can't be cut (see `splitAboveListBlocks`); stitching stays text-only.
- **Dev log:** each camera capture also prints `OFF-COLUMN TEXT DROPPED` with what was removed and
  where; the scan log now prints the full text (was cut at 600 characters) and, for every red flag, the
  exact word that matched and its surroundings (`describeMatches`, `src/domain/scanDebug.ts`).

## Language check — warn when the scan isn't English (owner, 2026-09-25)
The dictionary only has English ingredient names. A real test on a bilingual label: the English side
gave 7 red flags, the French side gave 1 (TBHQ is spelled the same) — and nothing on screen said the
scan had read the wrong side. That's a false-negative risk, so both scan entry points (the Scan tab —
camera, Paste, Choose Photo — and the recheck capture screen) check the language **before** evaluating.
- **Rule** (`src/matching/language.ts`, `looksLikeNonEnglish`): if the bulk of the words aren't English —
  at least 3 words that are unmistakably another language (words like "farine", "harina", "zutaten", or
  any word with a letter English doesn't use, or a non-Latin script) **and** more of those than
  recognisably-English words — an alert appears. It is **not French-specific**: it doesn't name a
  language (a Portuguese product can carry a Portuguese and an English list). An English list with a
  couple of "crème"/"purée" words, a chemical name we don't know, or a capture containing both sides
  roughly evenly doesn't trip it. On-device, no language service.
- **The warning** (`src/design/LanguageWarning.tsx`): drawn by the app in its own style — a card with a
  language icon over a dimmed background, **not** the phone's native alert (owner, 2026-09-25: the native
  one felt like an iOS notification, not part of Flagged). "Check the language — Most of the words in
  this scan don't look like English. Flagged only checks English ingredient names, so a scan in another
  language can miss red flags. Please scan the English ingredient list." It has **one button, Scan
  again**, which returns to the standby screen. There is deliberately **no "continue anyway"** and it
  can't be dismissed by tapping outside it: a scan in the wrong language can't be trusted.
- Nothing is stored or counted for a scan that hits the warning, and no result is shown.

## Temporary photos are deleted after ~20 minutes (owner, 2026-09-25)
Scanning writes several full-size photos to the phone's temp/cache folders and nothing used to delete
them: the camera's original, the cropped copy the OCR reads (`correctPerspective`, a full-resolution
JPEG in the temp folder), and the image picker's copy for **Choose Photo**. A heavy user would collect
hundreds. Now each one is registered when it's created (`src/domain/tempPhotos.ts`, persisted in
`app_meta` key `tempScanPhotos`) and deleted **20 minutes** after capture — long enough that the user
has finished whatever they were doing with the scan. Sweeps run at launch, whenever the app returns to
the foreground, and ~20 min after each capture while it stays open (`runCleanup` in `bootstrap/init.ts`).
- **Safe by construction** (`tempPhotoRules.ts`, tested): only files the app itself registered, inside
  its own temp/cache folders, are ever deleted — never the photo library, never a path with `..`.
- **The product photo saved with a Pantry card is NOT part of this.** It's the compressed thumbnail in
  the documents folder (`pantry/`), never registered, refused by the safety check, and kept until the
  card is permanently deleted (24h undo, then removed). Only the phone camera's temporary *original*
  that the thumbnail is made from (a separate cache copy) is cleaned up.
- Nothing is ever stored from the ingredient-list photos — only the text read from them is used.

## Stats rule (reiterated — important)

A scan's per-profile counters (`totalLabelsRead`, `totalRedFlagsCaught`, `totalCleanScans`) are
committed **only** when a scan **successfully extracts text and routes to a Results Screen**
(`commitScanStats`, called from `app/results.tsx`). Aborted, illegible, or cancelled captures
commit nothing. There is no free-scan counter any more — the trial is a store entitlement (`08`).

## Performance / UX notes

- Keep the live preview responsive; after the shutter tap show a clear processing state
  (`waiting → processing → shotDone` in `CameraScanner.tsx`).
- Give the user a clear aiming affordance (the dashed guide box) — OCR only reads inside it.
- Everything is local; there must be **no** network round-trip anywhere in this pipeline.
