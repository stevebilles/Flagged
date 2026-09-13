import type { RecognizedBlock } from "./stitch";

/**
 * Adapter between `react-native-vision-camera-text-recognition` (ML Kit, v3) and
 * our pure-TS OCR pipeline (`src/ocr/stitch.ts`).
 *
 * Shape verified on-device (iOS, plugin v3.x). `useTextRecognition().scanText`
 * hands back a single object:
 *
 *   {
 *     resultText?: string,
 *     blocks: [
 *       {
 *         blockText: string,
 *         blockFrame: { x, y, width, height, boundingCenterX, boundingCenterY },
 *         blockCornerPoints: [{ x, y }, ...],
 *         lines: [ { elements: [ { elementText, elementFrame, ... } ], ... } ]
 *       },
 *       ...
 *     ]
 *   }
 *
 * `PhotoRecognizer` returns the same shape for a still image. Older docs assumed
 * a positional tuple / an array of these — we read defensively so either works.
 */

/** The block frame reported by ML Kit (origin + size in frame coordinates). */
export interface MLKitFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  boundingCenterX: number;
  boundingCenterY: number;
}

/** A single recognized block. Fields are read defensively (see `textOf`/`frameOf`). */
export type MLKitBlock = any;

/** One OCR result object. `scanText`/`PhotoRecognizer` return this (not an array). */
export interface MLKitText {
  blocks?: MLKitBlock[] | MLKitBlock;
  resultText?: string;
}

/** What `scanText` may hand us: the object, an array of them, or a bare block list. */
type RawResult = MLKitText | MLKitText[] | MLKitBlock[] | null | undefined;

/** Flatten whatever shape we got into a flat list of block objects. */
function collectBlocks(result: RawResult): MLKitBlock[] {
  if (!result) return [];
  const items: any[] = Array.isArray(result) ? result : [result];
  const out: MLKitBlock[] = [];
  for (const item of items) {
    if (!item) continue;
    if (Array.isArray(item.blocks)) {
      out.push(...item.blocks);
    } else if (item.blocks) {
      out.push(item.blocks);
    } else if (textOf(item)) {
      // `item` is itself a block (bare block list, or tuple form).
      out.push(item);
    }
  }
  return out;
}

/** Best-effort block text. Handles v3 objects and the older tuple form. */
function textOf(block: MLKitBlock): string {
  if (Array.isArray(block)) {
    return typeof block[4] === "string" ? block[4].trim() : "";
  }
  const t = block?.blockText ?? block?.text ?? "";
  return typeof t === "string" ? t.trim() : "";
}

/** Best-effort block frame. Falls back to the bounding centre when x/y are absent. */
function frameOf(block: MLKitBlock): MLKitFrame | null {
  const f = Array.isArray(block) ? block[0] : block?.blockFrame ?? block?.frame;
  if (!f) return null;
  const x = typeof f.x === "number" ? f.x : f.boundingCenterX;
  const y = typeof f.y === "number" ? f.y : f.boundingCenterY;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return {
    x,
    y,
    width: typeof f.width === "number" ? f.width : 0,
    height: typeof f.height === "number" ? f.height : 0,
    boundingCenterX: typeof f.boundingCenterX === "number" ? f.boundingCenterX : x,
    boundingCenterY: typeof f.boundingCenterY === "number" ? f.boundingCenterY : y,
  };
}

/** Top-level `resultText`, or the block texts joined, as a last resort. */
function resultTextOf(result: RawResult): string {
  if (!result) return "";
  const items: any[] = Array.isArray(result) ? result : [result];
  const joined = items
    .map((i) => (typeof i?.resultText === "string" ? i.resultText : ""))
    .join("\n")
    .trim();
  if (joined) return joined;
  return collectBlocks(result)
    .map(textOf)
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Build a stable-ish id for dedup across frames (docs/06). ML Kit doesn't give
 * us a tracking id, so we derive one from the block's rounded position + a short
 * hash of its text. Panning slightly keeps the same id; new text yields a new one.
 */
function blockId(frame: MLKitFrame | null, text: string): string {
  const gx = frame ? Math.round(frame.x / 8) : 0;
  const gy = frame ? Math.round(frame.y / 8) : 0;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${gx}:${gy}:${h}`;
}

/**
 * Convert a single frame's `scanText` result into our RecognizedBlock[].
 * Empty/whitespace blocks are dropped; if no usable blocks, fall back to the
 * flat result text so a paragraph can still be assembled.
 */
export function toRecognizedBlocks(result: RawResult): RecognizedBlock[] {
  const out: RecognizedBlock[] = [];
  for (const b of collectBlocks(result)) {
    const text = textOf(b);
    if (!text) continue;
    const frame = frameOf(b);
    out.push({
      id: blockId(frame, text),
      text,
      x: frame?.x ?? 0,
      y: frame?.y ?? 0,
    });
  }
  if (out.length === 0) {
    const fallback = resultTextOf(result);
    if (fallback) out.push({ id: blockId(null, fallback), text: fallback, x: 0, y: 0 });
  }
  return out;
}

/** A recognized block plus its full geometry (docs/06) — needed to reason
 * about reading order and the vertical gap to the next block (see
 * sortByPosition/completeness.ts), which plain x/y can't do. */
export interface SpatialBlock extends RecognizedBlock {
  height: number;
  width: number;
}

/**
 * Same as `toRecognizedBlocks`, but keeps each block's full geometry —
 * REMAPPED from the plugin's raw frame into true portrait-visual
 * coordinates, not passed through as-is.
 *
 * A real device capture (2026-09-13) proved, from the raw data itself, that
 * PhotoRecognizer's reported x/y/width/height are NOT already in visual
 * portrait orientation despite being called with `orientation: "portrait"`
 * — they're still in the camera sensor's native landscape frame, rotated
 * 90° from what a caller would reasonably assume. The proof: on the real
 * label, "Sodium 95 mg" and its own "4%" daily-value figure print side by
 * side on one row — in the raw data they instead have very close raw `x`
 * values and very different raw `y` values (confirmed across four separate
 * label/value pairs: Sodium/4%, Potassium/1%, Calcium/1%, Iron/2%). That's
 * the signature of a 90°-rotated frame, not a portrait one.
 *
 * This was previously a known but purely cosmetic issue — the old scattered
 * per-block overlay boxes never lined up with the text either (see git
 * history) — and got deferred as low priority. It became correctness-
 * critical the moment this data started deciding ingredient-list READING
 * ORDER instead of just drawing an overlay box: sorting by the raw,
 * unrotated coordinates actively scrambled text worse than trusting the
 * plugin's own resultText did.
 *
 * The remap (derived from the evidence above, not assumed): true top-to-
 * bottom position <- raw x (already ascends correctly); true left-to-right
 * position <- NEGATED raw y (raw y descends left-to-right); true vertical
 * line-thickness <- raw width; true horizontal extent <- raw height. Doing
 * this once here, at the boundary, means every consumer (sortByPosition
 * below, completeness.ts's looksSpatiallyComplete) can keep treating
 * x/y/width/height with their normal, expected meanings.
 */
export function toSpatialBlocks(result: RawResult): SpatialBlock[] {
  const out: SpatialBlock[] = [];
  for (const b of collectBlocks(result)) {
    const text = textOf(b);
    if (!text) continue;
    const frame = frameOf(b);
    out.push({
      id: blockId(frame, text),
      text,
      x: frame ? -frame.y : 0,
      y: frame?.x ?? 0,
      height: frame?.width ?? 0,
      width: frame?.height ?? 0,
    });
  }
  return out;
}

/**
 * Reading order for a still photo's blocks, built from their own measured
 * positions — top-to-bottom, left-to-right within a row — rather than
 * trusting the plugin's own resultText field or the native block array's
 * order. Neither of those is guaranteed to reflect true visual layout for a
 * dense, multi-line, nested (bracketed) list: a real device capture
 * (2026-09-13) showed resultText scramble the order of clauses inside a
 * "[...]" bracket on an otherwise perfectly legible single photo ("Food
 * acid (270,327,330)" landing before "(Natural, contains soy flour)", which
 * prints in the opposite order on the actual label) — the OCR plugin's own
 * internal text-assembly heuristic failed on this layout even though every
 * individual block's position was presumably still measured correctly.
 * Row grouping uses a tolerance relative to the blocks' own typical height
 * rather than a fixed pixel number, since raw ML Kit coordinates scale with
 * photo resolution and this needs to hold up across different phones/photos.
 */
function sortByPosition(blocks: SpatialBlock[]): SpatialBlock[] {
  if (blocks.length === 0) return blocks;
  const heights = blocks.map((b) => b.height).filter((h) => h > 0).sort((a, b) => a - b);
  const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 20;
  const rowTolerance = medianHeight * 0.6;
  return [...blocks].sort((a, b) => {
    if (Math.abs(a.y - b.y) > rowTolerance) return a.y - b.y;
    return a.x - b.x;
  });
}

/**
 * Convert a still-photo result (PhotoRecognizer) into a paragraph string.
 * Used by the "Choose Photo" path and the burst-photo scanner (docs/06/14).
 * Built from position-sorted blocks (see sortByPosition) rather than the
 * plugin's own resultText — see that function's doc comment for why.
 */
export function photoResultToParagraph(result: MLKitText | MLKitText[]): string {
  const blocks = toSpatialBlocks(result as RawResult);
  if (blocks.length > 0) {
    return sortByPosition(blocks)
      .map((b) => b.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  // No individual blocks at all (rare) — fall back to whatever flat text
  // the plugin can offer; there's no position data to sort by either way.
  return resultTextOf(result as RawResult);
}
