import type { DocumentCorners } from "vision-ocr";

/**
 * How much of the viewfinder box the dashed guide covers.
 *
 * Bumped UP to 90%/80% earlier (2026-09-13) per feedback that the box
 * should comfortably fit a whole list without precise aiming — then
 * brought back DOWN, smaller than the original 82%/70%, after real
 * captures showed the bigger box was regularly pulling in the Nutrition
 * Facts panel and BOTH language sections in one shot. That's not just
 * cosmetic: it caused two real failures. (1) OCR sometimes renders the
 * French header identically to the English one once accents get dropped
 * ("Ingrédients" -> "Ingredients") — with both sections in frame, the
 * extractor had no reliable way to tell them apart and picked the wrong
 * one. (2) full-width ingredient lines routinely ran right up to the
 * (large) box's own edge, which the edge-clip filter (recognition.ts,
 * built for a user-drawn, deliberately-tight manual crop) then discarded
 * as if it were unwanted bleed-in — including the "Ingredients:" header
 * line itself. A smaller box makes it much likelier only the intended
 * list is ever in frame at all, which is more valuable than fitting more
 * text in one shot — "Scan More" already exists for a list that doesn't
 * fit. Exported so the Scan tab's idle placeholder (its dashed box shown
 * before the camera opens) can match exactly — same guide, same size,
 * whether or not the camera is live.
 */
export const GUIDE_WIDTH_FRACTION = 0.72;
export const GUIDE_HEIGHT_FRACTION = 0.5;

/**
 * Maps the dashed guide box's fixed on-screen position (centered, a set
 * fraction of the viewfinder) to pixel coordinates in the photo that was
 * just captured — so OCR only ever sees what was actually framed inside the
 * dashed lines, without any user drag-to-crop step (removed 2026-09-13).
 *
 * The live preview fills the viewfinder box via a "cover" fit — the same
 * way every native camera app's live preview behaves, and how VisionCamera
 * renders its preview surface: the photo is scaled up just enough that it
 * completely covers the box, centered, with anything beyond the box's own
 * edges never shown on screen at all. To go from a point on screen back to
 * the matching point in the actual photo, this inverts that exact
 * scale-and-center — same idea as the old corner-adjust tool's screen<->image
 * mapping, just for a "cover" fit instead of a "contain" one.
 *
 * NOT YET VERIFIED against a real capture (2026-09-13) — if the OCR'd
 * region doesn't match what was visibly framed inside the dashed lines on
 * the first real test, the fix is almost certainly `Math.max` -> `Math.min`
 * below (i.e. the preview is actually "contain", not "cover").
 */
export function guideBoxToPhotoCorners(
  boxWidth: number,
  boxHeight: number,
  photoWidth: number,
  photoHeight: number
): DocumentCorners {
  const coverScale = Math.max(boxWidth / photoWidth, boxHeight / photoHeight);
  const offsetX = (boxWidth - photoWidth * coverScale) / 2;
  const offsetY = (boxHeight - photoHeight * coverScale) / 2;
  const toPhoto = (sx: number, sy: number) => ({
    x: (sx - offsetX) / coverScale,
    y: (sy - offsetY) / coverScale,
  });

  const guideWidth = boxWidth * GUIDE_WIDTH_FRACTION;
  const guideHeight = boxHeight * GUIDE_HEIGHT_FRACTION;
  const left = (boxWidth - guideWidth) / 2;
  const top = (boxHeight - guideHeight) / 2;

  return {
    topLeft: toPhoto(left, top),
    topRight: toPhoto(left + guideWidth, top),
    bottomLeft: toPhoto(left, top + guideHeight),
    bottomRight: toPhoto(left + guideWidth, top + guideHeight),
  };
}
