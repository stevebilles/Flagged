import type { RecognizedBlock } from "./stitch";
import type { VisionOcrResult } from "vision-ocr";

/**
 * Adapter between `vision-ocr` (our own local native module, Apple's Vision
 * framework — see `modules/vision-ocr`, docs/06, 2026-09-13) and our pure-TS
 * OCR pipeline (`src/ocr/stitch.ts`).
 *
 * Replaces Google ML Kit entirely (`react-native-vision-camera-text-
 * recognition`): ML Kit's iOS port treats iOS as a secondary target behind
 * Android, and its raw letter-level accuracy on small, dense, glossy print
 * proved poor independent of any app-level fusion/voting logic layered on
 * top of it — no amount of post-processing can fix wrong letters at the
 * source. One engine now runs both the live-preview readiness check and the
 * actual photo analysis (see CameraScanner.tsx), not two different OCR
 * stacks glued together.
 *
 * Unlike the old ML Kit adapter, there's no defensive shape-guessing here:
 * `vision-ocr` is OUR OWN native module (modules/vision-ocr), so its output
 * shape is a contract we control, not a third-party plugin's undocumented
 * runtime shape. It also already returns blocks in plain top-left-origin
 * pixel coordinates of the upright photo — Vision's own normalized,
 * bottom-left-origin convention is converted once, at the native boundary
 * (see VisionOcrPhotoModule.swift), from Apple's own documented coordinate
 * contract rather than reverse-engineered from device evidence the way
 * ML Kit's rotation bug had to be (docs/06, 2026-09-13).
 */

/** A recognized block plus its full geometry (docs/06) — needed to reason
 * about reading order and the vertical gap to the next block (see
 * sortByPosition/completeness.ts), which plain x/y can't do. */
export interface SpatialBlock extends RecognizedBlock {
  height: number;
  width: number;
}

function toSpatialBlocks(result: VisionOcrResult): SpatialBlock[] {
  return result.blocks.map((b, i) => ({
    id: `${i}:${Math.round(b.x)}:${Math.round(b.y)}`,
    text: b.text,
    x: b.x,
    y: b.y,
    height: b.height,
    width: b.width,
  }));
}

/**
 * Reading order for a still photo's blocks, built from their own measured
 * positions — top-to-bottom, left-to-right within a row — rather than
 * trusting the plugin's own concatenated text order, which isn't guaranteed
 * to reflect true visual layout for a dense, multi-line, nested (bracketed)
 * list. Row grouping uses a tolerance relative to the blocks' own typical
 * height rather than a fixed pixel number, since raw coordinates scale with
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
 * Convert a still-photo Vision result into a paragraph string. Used by the
 * "Choose Photo" path and the burst-photo scanner (docs/06/14). Built from
 * position-sorted blocks (see sortByPosition) rather than the plugin's own
 * concatenated text — see that function's doc comment for why.
 */
export function photoResultToParagraph(result: VisionOcrResult): string {
  const blocks = toSpatialBlocks(result);
  if (blocks.length > 0) {
    return sortByPosition(blocks)
      .map((b) => b.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  // No individual blocks at all (rare) — fall back to whatever flat text
  // Vision offered; there's no position data to sort by either way.
  return result.text ?? "";
}

export { toSpatialBlocks };
