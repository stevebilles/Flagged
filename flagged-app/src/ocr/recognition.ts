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
 * list.
 *
 * Two real device captures (2026-09-13) — near-identical content, only
 * slightly different line spacing from the crop — proved that deciding
 * "same row?" from a HEIGHT-derived vertical tolerance is fundamentally
 * unstable: one photo's gap-to-height ratio landed just above the tuned
 * threshold (sorted correctly), the very next one landed just below it
 * (two sequential lines wrongly judged "the same row" and sorted
 * left-to-right instead of top-to-bottom, scrambling the list). No
 * threshold constant fixes this — the signal itself is the problem.
 *
 * The fix uses a geometric signal that doesn't depend on any tuned
 * constant: HORIZONTAL overlap. Two lines of the same wrapped paragraph
 * almost always share nearly the same left-right span (same column,
 * wrapping downward) — measured at ~99% overlap in both the passing and
 * failing real captures above, stable regardless of their very different
 * gap-to-height ratios. Two genuinely side-by-side values on one row (a
 * nutrient label and its own "4%") occupy disjoint columns instead. So:
 * blocks whose x-ranges substantially overlap are NEVER the same row,
 * regardless of any y-overlap/gap their boxes report — they're sequential
 * lines, ordered by y. Blocks whose x-ranges DON'T substantially overlap
 * are grouped into a row when their y-ranges are close, ordered by x.
 *
 * An earlier attempt at this exact approach (2026-09-13) was reverted
 * after it broke a much messier photo — a full, uncropped label mixing a
 * dense Nutrition Facts grid (many small side-by-side value/% pairs) with
 * the ingredients paragraph, where transitively grouping "same row" pairs
 * over-merged several actually-different rows into one clump. The
 * fixed-guide-box crop added since then (guideBox.ts) means the photo
 * handed to this function is now always just the cropped ingredient panel —
 * plain stacked paragraph lines, never a dense multi-column grid — which is
 * exactly the case this approach handles well and the earlier one didn't.
 *
 * Grouping uses union-find (not a single pairwise sort comparator) so the
 * result is a proper partition into rows rather than a possibly
 * inconsistent, non-transitive ad hoc ordering.
 */
const X_OVERLAP_SAME_COLUMN = 0.3; // above this fraction, two blocks are the same paragraph column, never the same row
const Y_GAP_SAME_ROW_RATIO = 0.5; // vertical gap allowed (relative to the smaller block's height) to still count as one row

function xOverlapFraction(a: SpatialBlock, b: SpatialBlock): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  if (overlap <= 0) return 0;
  return overlap / Math.min(a.width, b.width);
}

function looksLikeSameRow(a: SpatialBlock, b: SpatialBlock): boolean {
  if (xOverlapFraction(a, b) > X_OVERLAP_SAME_COLUMN) return false;
  const yGap = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  return yGap <= Math.min(a.height, b.height) * Y_GAP_SAME_ROW_RATIO;
}

function sortByPosition(blocks: SpatialBlock[]): SpatialBlock[] {
  if (blocks.length === 0) return blocks;

  const parent = blocks.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (looksLikeSameRow(blocks[i], blocks[j])) union(i, j);
    }
  }

  const rows = new Map<number, SpatialBlock[]>();
  blocks.forEach((b, i) => {
    const root = find(i);
    if (!rows.has(root)) rows.set(root, []);
    rows.get(root)!.push(b);
  });

  return [...rows.values()]
    .map((row) => ({ row: [...row].sort((a, b) => a.x - b.x), y: Math.min(...row.map((b) => b.y)) }))
    .sort((a, b) => a.y - b.y)
    .flatMap((r) => r.row);
}

/**
 * A hard pixel crop (see `correctPerspective`) can slice straight through
 * the MIDDLE of a text line that sits just outside the box the user
 * actually drew — a Nutrition Facts footnote sitting right above it, a
 * second-language repeat sitting right below it. Vision still recognizes
 * whatever sliver of that line survived the cut (2026-09-13, real device
 * capture: "5% or less is a little, 15% or more is a lot" and a French
 * ingredient repeat both bled into a crop the user drew well inside them).
 *
 * The fix relies on how a hard crop necessarily behaves: a line the user
 * genuinely meant to include sits somewhere INSIDE the box, with real
 * margin on every side, because nobody drags a crop edge to land exactly on
 * a letter's own boundary pixel. A line the crop sliced through has no such
 * margin — Vision can only draw a box around the pixels that actually
 * survived the cut, so that box's edge lands flush against the image's own
 * edge (y at ~0, or the opposite edge at ~imageHeight, same for x). That's
 * a purely geometric fact about how the crop was made, not a guess tuned
 * against any one photo — so it holds regardless of language, font, or
 * how tight the crop is.
 */
const EDGE_TOUCH_FRACTION = 0.006; // how close to the image's own edge counts as "cut off", as a fraction of that dimension

function touchesEdge(value: number, dimension: number): boolean {
  const margin = Math.max(2, dimension * EDGE_TOUCH_FRACTION);
  return value <= margin || value >= dimension - margin;
}

function isEdgeClipped(block: SpatialBlock, imageWidth: number, imageHeight: number): boolean {
  return (
    touchesEdge(block.y, imageHeight) ||
    touchesEdge(block.y + block.height, imageHeight) ||
    touchesEdge(block.x, imageWidth) ||
    touchesEdge(block.x + block.width, imageWidth)
  );
}

/**
 * Convert a still-photo Vision result into a paragraph string. Used by the
 * "Choose Photo" path and the crop-confirm scanner (docs/06/14). Built from
 * position-sorted blocks (see sortByPosition) rather than the plugin's own
 * concatenated text — see that function's doc comment for why.
 *
 * `dropEdgeClippedText`: pass true ONLY when `result` came from a hard-
 * cropped image (`correctPerspective`'s output) — see `isEdgeClipped`
 * above. The "Choose Photo" path runs on the original, uncropped picture,
 * where a real line legitimately sitting at the edge of the FRAME (not a
 * crop) is common and must not be dropped.
 */
export function photoResultToParagraph(result: VisionOcrResult, options?: { dropEdgeClippedText?: boolean }): string {
  let blocks = toSpatialBlocks(result);
  if (options?.dropEdgeClippedText) {
    blocks = blocks.filter((b) => !isEdgeClipped(b, result.imageWidth, result.imageHeight));
  }
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
