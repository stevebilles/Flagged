import { guideBoxToPhotoCorners, GUIDE_WIDTH_FRACTION, GUIDE_HEIGHT_FRACTION } from "../ocr/guideBox";

/**
 * Tests for the fixed-guide-box -> photo-pixel-space mapping (guideBox.ts),
 * introduced 2026-09-13 when the manual corner-drag crop tool was removed in
 * favor of automatically restricting OCR to whatever's inside the dashed
 * cyan guide box shown during the live preview.
 */

describe("guideBoxToPhotoCorners", () => {
  it("maps the guide box to the correct pixel rectangle when the box is narrower than the photo (cover crops top/bottom)", () => {
    // box 400x800 (portrait, taller than wide), photo 1200x1600 (same 3:4
    // ratio as the box here scaled — cover picks the larger of the two
    // per-axis scale factors, so coverScale = max(400/1200, 800/1600) = 0.5.
    const boxW = 400;
    const boxH = 800;
    const photoW = 1200;
    const photoH = 1600;
    const corners = guideBoxToPhotoCorners(boxW, boxH, photoW, photoH);
    // Guide is GUIDE_WIDTH_FRACTION x GUIDE_HEIGHT_FRACTION of the box,
    // centered. Derived from the fractions rather than hardcoded, so tuning
    // the box size (guideBox.ts) doesn't also require updating this test.
    const coverScale = 0.5;
    const guideW = boxW * GUIDE_WIDTH_FRACTION;
    const guideH = boxH * GUIDE_HEIGHT_FRACTION;
    const left = (boxW - guideW) / 2;
    const top = (boxH - guideH) / 2;
    const offsetX = (boxW - photoW * coverScale) / 2;
    const offsetY = (boxH - photoH * coverScale) / 2;
    const expectedTopLeft = { x: (left - offsetX) / coverScale, y: (top - offsetY) / coverScale };
    const expectedBottomRight = {
      x: (left + guideW - offsetX) / coverScale,
      y: (top + guideH - offsetY) / coverScale,
    };
    expect(corners.topLeft.x).toBeCloseTo(expectedTopLeft.x);
    expect(corners.topLeft.y).toBeCloseTo(expectedTopLeft.y);
    expect(corners.bottomRight.x).toBeCloseTo(expectedBottomRight.x);
    expect(corners.bottomRight.y).toBeCloseTo(expectedBottomRight.y);
  });

  it("keeps every corner within the photo's own bounds", () => {
    // A box aspect ratio that doesn't match the photo's at all — the guide
    // box mapping must never produce a corner outside [0, photoWidth] /
    // [0, photoHeight], since the guide is always fully inside the box and
    // the box is always fully covered by the (possibly overflowing) photo.
    const boxes: [number, number][] = [
      [300, 900],
      [900, 300],
      [1080, 1080],
    ];
    const photoW = 3024;
    const photoH = 4032;
    for (const [bw, bh] of boxes) {
      const c = guideBoxToPhotoCorners(bw, bh, photoW, photoH);
      for (const p of [c.topLeft, c.topRight, c.bottomLeft, c.bottomRight]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(photoW);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(photoH);
      }
    }
  });

  it("produces an axis-aligned rectangle (top/bottom edges level, left/right edges level)", () => {
    const c = guideBoxToPhotoCorners(500, 1000, 2000, 3000);
    expect(c.topLeft.y).toBe(c.topRight.y);
    expect(c.bottomLeft.y).toBe(c.bottomRight.y);
    expect(c.topLeft.x).toBe(c.bottomLeft.x);
    expect(c.topRight.x).toBe(c.bottomRight.x);
  });

  it("centers the crop when the box and photo share the same aspect ratio", () => {
    // Same ratio (2:3) at different absolute sizes — cover scale is uniform
    // on both axes, so there's no overflow to crop and the guide box maps
    // to exactly GUIDE_WIDTH_FRACTION/GUIDE_HEIGHT_FRACTION of the photo,
    // centered.
    const c = guideBoxToPhotoCorners(400, 600, 800, 1200);
    const marginXFrac = (1 - GUIDE_WIDTH_FRACTION) / 2;
    const marginYFrac = (1 - GUIDE_HEIGHT_FRACTION) / 2;
    expect(c.topLeft.x).toBeCloseTo(800 * marginXFrac);
    expect(c.topLeft.y).toBeCloseTo(1200 * marginYFrac);
    expect(c.bottomRight.x).toBeCloseTo(800 * (1 - marginXFrac));
    expect(c.bottomRight.y).toBeCloseTo(1200 * (1 - marginYFrac));
  });
});
