import type { RecognizedBlock } from "./stitch";

/**
 * Adapter between `react-native-vision-camera-text-recognition` (ML Kit, v3) and
 * our pure-TS OCR pipeline (`src/ocr/stitch.ts`).
 *
 * The plugin does NOT export its result types, so we mirror them structurally
 * here (verified against the installed v3.1.1 type defs). Each recognized
 * `MLKitText` has a `resultText` and a `blocks` tuple whose first element is the
 * block frame (x/y/width/height). We map each into our `RecognizedBlock`.
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

/**
 * The plugin returns `blocks` as a positional tuple:
 *   [blockFrame, blockCornerPoints, lines, blockLanguages, blockText]
 * We only need index 0 (frame) and index 4 (text) — but we read defensively in
 * case a future version returns an object instead of a tuple.
 */
export type MLKitBlock = any;

export interface MLKitText {
  blocks: MLKitBlock[] | MLKitBlock;
  resultText: string;
}

function frameOf(block: MLKitBlock): MLKitFrame | null {
  // Tuple form: index 0 is the block frame.
  const candidate = Array.isArray(block) ? block[0] : block?.frame ?? block?.blockFrame;
  if (candidate && typeof candidate.x === "number" && typeof candidate.y === "number") {
    return candidate as MLKitFrame;
  }
  return null;
}

function textOf(block: MLKitBlock): string {
  if (Array.isArray(block)) return typeof block[4] === "string" ? block[4] : "";
  return block?.blockText ?? block?.text ?? "";
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
 * Convert a single frame's `scanText` result (MLKitText[]) into our
 * RecognizedBlock[]. Empty/whitespace blocks are dropped.
 */
export function toRecognizedBlocks(result: MLKitText[] | null | undefined): RecognizedBlock[] {
  if (!result || !Array.isArray(result)) return [];
  const out: RecognizedBlock[] = [];
  for (const item of result) {
    const blocks: MLKitBlock[] = Array.isArray(item.blocks) ? item.blocks : [item.blocks];
    if (blocks.length > 0 && (Array.isArray(blocks[0]) || typeof blocks[0] === "object")) {
      // Per-block granularity (better for spatial sort of a multi-line paragraph).
      for (const b of blocks) {
        const text = textOf(b).trim();
        if (!text) continue;
        const frame = frameOf(b);
        out.push({
          id: blockId(frame, text),
          text,
          x: frame?.x ?? 0,
          y: frame?.y ?? 0,
        });
      }
    } else if (item.resultText?.trim()) {
      // Fallback: only the full resultText is usable.
      out.push({ id: blockId(null, item.resultText), text: item.resultText.trim(), x: 0, y: 0 });
    }
  }
  return out;
}

/**
 * Convert a still-photo result (PhotoRecognizer returns a single MLKitText) into
 * a paragraph string. Used by the "Choose Photo" path (docs/06/14).
 */
export function photoResultToParagraph(result: MLKitText): string {
  return (result?.resultText ?? "").trim();
}
