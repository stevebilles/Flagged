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
    const corners = guideBoxToPhotoCorners(400, 800, 1200, 1600);
    // Guide is 90%x80% of the box, centered: left=20,top=80,right=380,bottom=720.
    // Inverting the 0.5 cover scale with offsetX=-100, offsetY=0:
    expect(corners.topLeft).toEqual({ x: 240, y: 160 });
    expect(corners.bottomRight).toEqual({ x: 960, y: 1440 });
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
