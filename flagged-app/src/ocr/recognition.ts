import type { RecognizedBlock } from "./stitch";
import { similarity } from "../matching/levenshtein";
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
 * fixed-guide-box crop (guideBox.ts) narrows that risk — a smaller box
 * makes it much less likely the Nutrition Facts grid is in frame at all —
 * but unlike the old manually-drawn crop, it can't GUARANTEE the photo is
 * only the ingredient paragraph, since the user aims it live rather than
 * confirming the exact captured content afterward. If a dense grid does
 * end up in frame, this approach's over-merge risk is still there.
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
 * The fix relies on how a hard crop necessarily behaves VERTICALLY: a line
 * genuinely meant to be included sits somewhere INSIDE the box top-to-
 * bottom, with real margin above and below, because nobody drags a crop
 * edge to land exactly on a letter's own boundary pixel. A line the crop
 * sliced through has no such margin — Vision can only draw a box around
 * the pixels that actually survived the cut, so that box's top or bottom
 * edge lands flush against the image's own edge. That holds regardless of
 * language, font, or how tight the crop is.
 *
 * ONLY the y-axis (top/bottom) is checked — an earlier version also
 * checked x (left/right), which caused a real regression once cropping
 * became automatic (the fixed guide box, guideBox.ts) instead of a
 * precisely user-drawn rectangle: a wrapped paragraph's lines naturally
 * run close to the crop's left/right edges just because that's how text
 * wraps to fill the available width, not because anything got cut off.
 * That check discarded a real, fully-intact "Ingredients:" line (and every
 * word after it) simply because the guide box wasn't wide enough to leave
 * horizontal margin — the opposite of what this filter is for. Vertically,
 * a genuinely separate section (a footnote above, a repeat below) is a
 * completely different line with its own real top/bottom margin, so that
 * check stays.
 */
const EDGE_TOUCH_FRACTION = 0.006; // how close to the image's own edge counts as "cut off", as a fraction of that dimension

function touchesEdge(value: number, dimension: number): boolean {
  const margin = Math.max(2, dimension * EDGE_TOUCH_FRACTION);
  return value <= margin || value >= dimension - margin;
}

function isEdgeClipped(block: SpatialBlock, imageHeight: number): boolean {
  return touchesEdge(block.y, imageHeight) || touchesEdge(block.y + block.height, imageHeight);
}

/**
 * Text that sits in a different COLUMN from the ingredient paragraph — a recipe printed down the side of
 * a tin, a second panel — isn't part of the ingredient list and must not be matched (owner, 2026-09-25).
 * Real capture that caused this: a bread-crumb tin whose right-hand strip read "Dip fish, …"; it sat at
 * x ≈ 1440–1740 while every ingredient line ran x ≈ 240–1450, and "fish" was flagged as a NEW red flag.
 * Nothing checked position, so it was matched like everything else.
 *
 * How: the "body" lines are the long ones (≥ 60% of the widest block's width) — the ingredient
 * paragraph, any repeat of it in another language, footnotes. (Position only — nothing here depends on a
 * label having French, or any second language, on it.) Their combined left–right span is the main column. A block
 * with less than half of its own width inside that span is off to the side and is dropped. Deliberately
 * cautious, so it does nothing rather than guess: with fewer than 3 body lines (a tiny capture, or one
 * huge block skewing the widths) every block is kept. Multi-column ingredient lists are safe — each
 * column's lines are "long" too, so the span covers them all. Horizontal only; text above/below the
 * paragraph is a separate problem.
 */
const BODY_LINE_MIN_WIDTH_FRACTION = 0.6;
const MIN_BODY_LINES = 3;
const MIN_INSIDE_COLUMN_FRACTION = 0.5;

export function splitOffColumnBlocks<T extends SpatialBlock>(blocks: T[]): { kept: T[]; dropped: T[] } {
  if (blocks.length === 0) return { kept: blocks, dropped: [] };
  const widest = Math.max(...blocks.map((b) => b.width));
  const body = blocks.filter((b) => b.width >= widest * BODY_LINE_MIN_WIDTH_FRACTION);
  if (body.length < MIN_BODY_LINES) return { kept: blocks, dropped: [] };
  const left = Math.min(...body.map((b) => b.x));
  const right = Math.max(...body.map((b) => b.x + b.width));
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const b of blocks) {
    const inside = Math.min(b.x + b.width, right) - Math.max(b.x, left);
    (b.width > 0 && inside / b.width < MIN_INSIDE_COLUMN_FRACTION ? dropped : kept).push(b);
  }
  return { kept, dropped };
}

/**
 * Text up high, above the ingredient list, isn't part of it (owner, 2026-09-25): once the OCR has found
 * the list's header, anything sitting well above it — a nutrition panel in the corner, a headline — is
 * dropped. The real tin capture had "Sodium 210mg", "Potassium 60mg", "9%" … well above the header and
 * they ended up inside the scanned ingredient text.
 *
 * The anchor is the TOPMOST block whose first word looks like "ingredient(s)" (fuzzy, colon not
 * required — OCR garbles it); only if there is none, the topmost block starting with "contains" — the
 * owner's rule: a list starts with "ingredient", "ingredients" or "contains", and "ingredient(s)" is
 * preferred because a trailing "Contains:" allergen line would otherwise cut off the list above it. A
 * block is "well above" when the gap between its bottom and the header's top is bigger than the
 * header's own height, so lines directly above (a footnote) stay. Position only, and cautious: no
 * anchor found → nothing is dropped. It never touches matching or the extraction rules.
 */
const HEADER_WORD_MIN_SIMILARITY = 0.7;

function firstWord(text: string): string {
  return (text.trim().split(/[\s:;]+/)[0] ?? "").toLowerCase().replace(/[^a-zà-ÿ]/g, "");
}

function findListAnchor<T extends SpatialBlock>(blocks: T[]): T | null {
  const topmost = (matches: T[]) => matches.reduce<T | null>((top, b) => (top === null || b.y < top.y ? b : top), null);
  const isHeader = (b: T, word: string) => {
    const w = firstWord(b.text);
    return w.length >= 6 && similarity(w, word) >= HEADER_WORD_MIN_SIMILARITY;
  };
  return (
    topmost(blocks.filter((b) => isHeader(b, "ingredients") || isHeader(b, "ingredient"))) ??
    topmost(blocks.filter((b) => isHeader(b, "contains")))
  );
}

/**
 * Two safeguards so this can never eat part of the list itself (owner, 2026-09-25):
 *  1. Only SHORT blocks are dropped (under 60% of the widest block's width). Nutrition rows, "9%",
 *     corner text are short; the ingredient paragraph's lines are long. So if the anchor turns out to
 *     be a header BELOW some of the list (a second-language header, or the header of a capture that
 *     starts mid-list), the list lines above it — long — are kept.
 *  2. The caller applies it to the FIRST photo of a scan only. A second photo ("Scan More", for a list
 *     too wide for one photo) has no reason to contain the header, and its continuation lines must not
 *     be judged against some later header. Stitching joins only text, and pixel positions can't be
 *     compared between two photos (the phone moved), so nothing positional is carried over: on later
 *     photos this filter is simply off.
 */
export function splitAboveListBlocks<T extends SpatialBlock>(blocks: T[]): { kept: T[]; dropped: T[] } {
  const anchor = findListAnchor(blocks);
  if (!anchor) return { kept: blocks, dropped: [] };
  const widest = Math.max(...blocks.map((b) => b.width));
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const b of blocks) {
    const gapAbove = anchor.y - (b.y + b.height);
    const isShort = b.width < widest * BODY_LINE_MIN_WIDTH_FRACTION;
    (gapAbove > anchor.height && isShort ? dropped : kept).push(b);
  }
  return { kept, dropped };
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
export function photoResultToParagraph(
  result: VisionOcrResult,
  options?: { dropEdgeClippedText?: boolean; dropOffColumnText?: boolean; dropTextAboveList?: boolean }
): string {
  let blocks = toSpatialBlocks(result);
  if (options?.dropEdgeClippedText) {
    blocks = blocks.filter((b) => !isEdgeClipped(b, result.imageHeight));
  }
  // Only for a guide-box capture (aimed at the ingredient paragraph). "Choose Photo" is a whole,
  // uncropped label where several columns can legitimately hold wanted text, so it's left alone.
  if (options?.dropOffColumnText) {
    blocks = splitOffColumnBlocks(blocks).kept;
  }
  if (options?.dropTextAboveList) {
    blocks = splitAboveListBlocks(blocks).kept;
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
