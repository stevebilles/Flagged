import { toRecognizedBlocks, toSpatialBlocks, photoResultToParagraph, MLKitText } from "../ocr/recognition";
import { assembleParagraph } from "../ocr/stitch";

/**
 * Tests for the ML Kit → RecognizedBlock adapter (src/ocr/recognition.ts).
 * Fixtures mirror the on-device v3 shape: `scanText` returns a single object
 * `{ resultText?, blocks: [{ blockText, blockFrame, ... }] }`.
 */

function block(text: string, x: number, y: number) {
  return {
    blockText: text,
    blockFrame: { x, y, width: 100, height: 20, boundingCenterX: x + 50, boundingCenterY: y + 10 },
    blockCornerPoints: [{ x, y }],
    lines: [],
  };
}

function result(blocks: ReturnType<typeof block>[], resultText = ""): MLKitText {
  return { resultText, blocks };
}

describe("toRecognizedBlocks", () => {
  it("maps v3 object blocks to {id,text,x,y} and drops empties", () => {
    const out = toRecognizedBlocks(
      result([block("water", 10, 20), block("  ", 10, 40), block("sugar", 10, 60)], "water sugar")
    );
    expect(out.map((b) => b.text)).toEqual(["water", "sugar"]);
    expect(out[0]).toMatchObject({ x: 10, y: 20 });
    expect(out.every((b) => typeof b.id === "string" && b.id.length > 0)).toBe(true);
  });

  it("gives the same id for the same block position+text (dedup across frames)", () => {
    const a = toRecognizedBlocks(result([block("red 40", 12, 30)]));
    const b = toRecognizedBlocks(result([block("red 40", 13, 31)]));
    // rounded to an 8px grid → stable id when the camera nudges slightly
    expect(a[0].id).toBe(b[0].id);
  });

  it("falls back to resultText when there are no usable blocks", () => {
    const out = toRecognizedBlocks({ resultText: "ingredients: salt", blocks: [] });
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("ingredients: salt");
  });

  it("derives text from blocks when resultText is absent", () => {
    const out = toRecognizedBlocks(result([block("ingredients: oats", 0, 0)]));
    expect(out[0].text).toBe("ingredients: oats");
  });

  it("still accepts the legacy array-of-results shape", () => {
    const out = toRecognizedBlocks([result([block("water", 1, 2)])] as unknown as MLKitText[]);
    expect(out.map((b) => b.text)).toEqual(["water"]);
  });

  it("reads a multi-line blockText verbatim (normalization happens downstream)", () => {
    const out = toRecognizedBlocks(result([block("INGREDIENTS: WATER\nSUGAR\nSALT", 5, 5)]));
    expect(out[0].text).toBe("INGREDIENTS: WATER\nSUGAR\nSALT");
  });

  it("handles null/garbage input safely", () => {
    expect(toRecognizedBlocks(null)).toEqual([]);
    expect(toRecognizedBlocks(undefined)).toEqual([]);
    expect(toRecognizedBlocks({} as MLKitText)).toEqual([]);
  });
});

describe("adapter feeds the stitch pipeline", () => {
  it("assembles a paragraph from multiple frames with dedup", () => {
    const frame1 = toRecognizedBlocks(result([block("ingredients: water", 0, 0), block("sugar", 0, 20)]));
    // second frame re-sees "sugar" (same spot) and adds "salt"
    const frame2 = toRecognizedBlocks(result([block("sugar", 0, 20), block("salt", 0, 40)]));
    const paragraph = assembleParagraph([frame1, frame2]);
    expect(paragraph).toContain("ingredients: water");
    expect(paragraph).toContain("salt");
    // "sugar" should appear once (deduped by stable id)
    expect(paragraph.match(/sugar/g)?.length).toBe(1);
  });
});

describe("toSpatialBlocks (landscape-sensor -> portrait-visual remap)", () => {
  it("swaps x/y and negates the horizontal axis, matching the real device evidence", () => {
    // Reproduces the exact real-world proof (2026-09-13): on the actual
    // label, "Sodium 95 mg" and its own "4%" daily-value figure print side
    // by side (same row). The raw capture had them at very close raw x
    // values and very different raw y values — Sodium's raw y LARGER than
    // 4%'s, even though Sodium (the label) prints to the LEFT of 4% (the
    // value) — which only makes sense if true-left-to-right position is
    // NEGATED raw y, and true-top-to-bottom position is raw x unchanged.
    const out = toSpatialBlocks(
      result([
        block("Sodium 95 mg", 774, 2252), // raw x≈774, raw y≈2252 (left/label)
        block("4%", 789, 1332), // raw x≈789, raw y≈1332 (right/value)
      ])
    );
    const sodium = out.find((b) => b.text === "Sodium 95 mg")!;
    const value = out.find((b) => b.text === "4%")!;
    // Same row: true y (top-to-bottom) should be very close for both.
    expect(Math.abs(sodium.y - value.y)).toBeLessThan(50);
    // Sodium (the label) must land to the LEFT of its own value.
    expect(sodium.x).toBeLessThan(value.x);
  });

  it("maps raw width/height to true height/width (swapped, not passed through)", () => {
    const out = toSpatialBlocks(result([block("Ingredients: water, salt", 100, 200)]));
    // block() fixture sets raw width=100, raw height=20 (see helper above).
    expect(out[0].height).toBe(100); // true (vertical) height <- raw width
    expect(out[0].width).toBe(20); // true (horizontal) width <- raw height
  });
});

// toSpatialBlocks (recognition.ts) remaps the plugin's raw sensor-landscape
// frame into true portrait coordinates — a real device capture (2026-09-13)
// proved the plugin's reported x/y are NOT already portrait-oriented
// despite requesting `orientation: "portrait"`: true top-to-bottom position
// comes from raw x, and true left-to-right position comes from NEGATED raw
// y. This helper lets fixtures below be authored in terms of the INTENDED
// true (row, col) position — matching how a person reading the fixture
// would expect "row 0 is above row 20" to work — instead of requiring every
// test to hand-derive the rotated raw values.
function blockAt(text: string, trueRow: number, trueCol: number) {
  return block(text, trueRow, -trueCol);
}

describe("photoResultToParagraph", () => {
  it("returns trimmed resultText", () => {
    expect(photoResultToParagraph({ resultText: "  ingredients: oats  ", blocks: [] })).toBe(
      "ingredients: oats"
    );
  });

  it("builds the paragraph from position-sorted blocks, not the plugin's own resultText", () => {
    // resultText is deliberately WRONG/scrambled here to prove blocks (with
    // real position data) win when present — the whole point of this fix
    // (2026-09-13): a real device capture showed the plugin's own resultText
    // scramble clause order on a dense layout, so it's no longer trusted
    // when position data is available to reconstruct order ourselves.
    const out = photoResultToParagraph(
      result([blockAt("ingredients: oats", 0, 0), blockAt("salt", 20, 0)], "salt ingredients: oats")
    );
    expect(out).toBe("ingredients: oats salt");
  });

  it("orders blocks top-to-bottom by measured position even when the block array arrives out of order", () => {
    const out = photoResultToParagraph(result([blockAt("salt", 100, 0), blockAt("ingredients: oats", 0, 0)]));
    expect(out).toBe("ingredients: oats salt");
  });

  it("falls back to resultText when there are no blocks to sort by position", () => {
    expect(photoResultToParagraph(result([], "ingredients: oats"))).toBe("ingredients: oats");
  });
});
