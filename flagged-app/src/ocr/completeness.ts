import type { SpatialBlock } from "./recognition";
import { extractIngredientList } from "../matching/normalize";

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

  // Track the furthest true visual extent seen so far, not just the
  // immediately preceding block's own end. Without this, a SMALL block
  // nested inside an earlier, taller block's bounding box (its own end is
  // short even though a much taller block already reaches further down)
  // could make the gap to the NEXT block look artificially large — a false
  // POSITIVE, calling the panel complete while still mid-panel. Comparing
  // against the running max end instead means a small nested block can't
  // manufacture a boundary that isn't really there.
  //
  // Note this does NOT help the opposite failure (a real boundary hidden by
  // overlap) — a running max can only ever shrink the measured gap versus
  // comparing to the immediate predecessor, never grow it, so it can't turn
  // a false "incomplete" into "complete". That failure mode (confirmed from
  // a real device capture, 2026-09-13, where every block in a dense
  // bilingual nutrition+ingredients+allergen panel overlapped the next with
  // no gap ever registering) is instead why looksTextuallyComplete exists as
  // an independent second signal below.
  let runningEnd = sorted[headerIdx].y + sorted[headerIdx].height;
  for (let i = headerIdx + 1; i < sorted.length; i++) {
    const gap = sorted[i].y - runningEnd;
    if (gap > baseline * GAP_RATIO) return true;
    runningEnd = Math.max(runningEnd, sorted[i].y + sorted[i].height);
  }
  return false;
}

/**
 * A second, independent completeness signal: does this text's extracted
 * ingredient body have no UNCLOSED opening bracket — an "[" or "(" with no
 * later matching close? A capture that's genuinely cut off mid-list reliably
 * ends this way (a real device miss, 2026-09-13: "[Milk solids ...
 * Anti-caking agent (551)" truncated before its own closing "]") — cutting
 * text off at the end can only ever leave an OPEN bracket dangling, never
 * manufacture an extra CLOSE, so an unmatched open is truncation's real
 * signature.
 *
 * Deliberately NOT the same as exact open/close equality: a single misread
 * character (ML Kit dropping the "[" itself, reading straight from
 * "Seasoning" into "Milk solids" as if it were plain text) leaves the count
 * as closes > opens — a transcription slip, not a truncation, since the
 * capture still ran all the way to its own closing "]" and beyond (confirmed
 * from a real device capture, 2026-09-13: squareOpens=0, squareCloses=1, yet
 * the capture demonstrably continued through the rest of the label and
 * ended cleanly at a period). Requiring exact equality there was a bug —
 * it wrongly rejected complete captures over one dropped character. Only
 * "opens > closes" (a bracket started but never closed) is treated as
 * evidence of truncation; "closes >= opens" is not, for either bracket kind.
 *
 * This complements looksSpatiallyComplete above rather than replacing it —
 * that check can be thrown off on a dense, multi-line layout where ML Kit
 * segments one printed panel into several blocks with overlapping or
 * near-zero bounding-box gaps between them. Since that failure mode is about
 * block GEOMETRY, checking the extracted TEXT's own bracket balance is a
 * genuinely independent second vote — either signal being true is enough to
 * call a photo complete.
 *
 * Only meaningful when the list actually USES brackets: a list with none at
 * all (e.g. "water, sugar, salt") has zero opens and zero closes, which is
 * trivially "not truncated" regardless of whether it was cut off mid-list at
 * a plain comma — so this deliberately returns false rather than a
 * false-positive "complete" when there's nothing to check in the first
 * place, deferring to the spatial signal for that case instead.
 */
export function looksTextuallyComplete(rawText: string): boolean {
  const body = extractIngredientList(rawText);
  if (body.length < 30) return false;
  const squareOpens = (body.match(/\[/g) ?? []).length;
  const squareCloses = (body.match(/\]/g) ?? []).length;
  const parenOpens = (body.match(/\(/g) ?? []).length;
  const parenCloses = (body.match(/\)/g) ?? []).length;
  if (squareOpens + parenOpens === 0) return false;
  return squareOpens <= squareCloses && parenOpens <= parenCloses;
}

