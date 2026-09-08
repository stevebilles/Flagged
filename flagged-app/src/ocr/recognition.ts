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

/**
 * Convert a still-photo result (PhotoRecognizer) into a paragraph string.
 * Used by the "Choose Photo" path (docs/06/14).
 */
export function photoResultToParagraph(result: MLKitText | MLKitText[]): string {
  const direct = resultTextOf(result as RawResult);
  if (direct) return direct;
  return toRecognizedBlocks(result as RawResult)
    .map((b) => b.text)
    .join(" ")
    .trim();
}
