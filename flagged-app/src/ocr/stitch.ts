import { longestCommonSubstringLength } from "../matching/levenshtein";

/**
 * Frame-to-frame string merging (docs/06 Step 1).
 * Stitches the trailing text of the accumulated string with the leading text of
 * the next frame using the longest common substring as the overlap seam.
 *
 * This is the pure-TS core; the live camera frame processor (native, VisionCamera)
 * feeds recognized-and-spatially-sorted text into this on each frame. See the
 * camera screen for where the native plugin plugs in.
 */
export function stitch(accumulated: string, nextFrame: string): string {
  const a = accumulated.trim();
  const b = nextFrame.trim();
  if (!a) return b;
  if (!b) return a;
  if (b.length && a.endsWith(b)) return a;

  // Find the largest suffix of `a` that is a prefix of `b`.
  const maxOverlap = Math.min(a.length, b.length);
  for (let len = maxOverlap; len > 0; len--) {
    if (a.slice(a.length - len) === b.slice(0, len)) {
      return a + b.slice(len);
    }
  }

  // No clean seam: only append if there's meaningful shared substring signal,
  // otherwise concatenate with a separator (spatial sort already ordered them).
  const lcs = longestCommonSubstringLength(a.slice(-40), b.slice(0, 40));
  if (lcs >= 4) {
    // fall back to naive append; dedup handled upstream by block ids.
    return a + " " + b;
  }
  return a + " " + b;
}

export interface RecognizedBlock {
  id: string; // stable-ish id for dedup (native RecognizedItem analogue)
  text: string;
  x: number;
  y: number;
}

/** Spatial sort (top-to-bottom, left-to-right) to rebuild reading order (docs/06). */
export function sortBlocks(blocks: RecognizedBlock[]): RecognizedBlock[] {
  const rowTolerance = 12;
  return [...blocks].sort((a, b) => {
    if (Math.abs(a.y - b.y) > rowTolerance) return a.y - b.y;
    return a.x - b.x;
  });
}

/** Merge a set of frames' sorted, deduped blocks into a single paragraph. */
export function assembleParagraph(frames: RecognizedBlock[][]): string {
  const seen = new Set<string>();
  let acc = "";
  for (const frame of frames) {
    const ordered = sortBlocks(frame);
    for (const block of ordered) {
      if (seen.has(block.id)) continue; // dedup (docs/06)
      seen.add(block.id);
      acc = stitch(acc, block.text);
    }
  }
  return acc;
}
