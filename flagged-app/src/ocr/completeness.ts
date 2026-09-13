import type { SpatialBlock } from "./recognition";

/**
 * Does one photo's OWN blocks show a self-contained, complete ingredients
 * panel — visually separated from whatever comes after it — rather than
 * running off into another section or off the edge of the frame?
 *
 * A text keyword like "Contains:" is a fragile completeness signal because
 * OCR can misspell the very word we'd search for ("Contains:" -> "Contais:",
 * a real device capture, 2026-09-13). A sturdier signal is the label's own
 * printed layout: a real ingredients panel sits inside a whitespace margin
 * or a printed border that visually separates it from neighbouring sections
 * (the Nutrition Facts table above it, marketing text elsewhere on the
 * package) — and ML Kit's own block detector already respects that kind of
 * visual separation when it groups recognized text into blocks.
 *
 * So: find the block that looks like the ingredients header, then look at
 * the vertical gap between that block (or whichever comes right after it)
 * and the NEXT block below it, compared to the gaps seen so far within the
 * panel itself. A gap clearly bigger than the panel's own internal spacing
 * means something visually different starts there — the panel ended
 * cleanly before it. Uses a RATIO against the panel's own spacing rather
 * than a fixed pixel number, since raw ML Kit coordinates vary with photo
 * resolution and label size — a fixed pixel threshold wouldn't transfer
 * from one phone/photo to another.
 */
const HEADER_HINT = /ingr[ée]?d|dients/i;
const GAP_RATIO = 2; // a boundary gap must be at least this many times the panel's own line spacing

export function looksSpatiallyComplete(blocks: SpatialBlock[]): boolean {
  if (blocks.length < 2) return false;
  const sorted = [...blocks].sort((a, b) => a.y - b.y);

  const headerIdx = sorted.findIndex((b) => HEADER_HINT.test(b.text));
  if (headerIdx === -1 || headerIdx === sorted.length - 1) return false;

  // The panel's own internal line-to-line spacing, up to and including the
  // header — what "normal" looks like inside this panel.
  const innerGaps: number[] = [];
  for (let i = 1; i <= headerIdx; i++) {
    innerGaps.push(Math.max(0, sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height)));
  }
  const avgInner = innerGaps.length ? innerGaps.reduce((s, g) => s + g, 0) / innerGaps.length : 0;
  // A panel that's one fused block (no internal gaps to measure) falls back
  // to comparing against its own line height instead of a zero baseline.
  const baseline = avgInner > 0 ? avgInner : sorted[headerIdx].height;
  if (baseline <= 0) return false;

  for (let i = headerIdx + 1; i < sorted.length; i++) {
    const gap = sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height);
    if (gap > baseline * GAP_RATIO) return true;
  }
  return false;
}

