import { toRecognizedBlocks, photoResultToParagraph, MLKitText } from "../ocr/recognition";
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

describe("photoResultToParagraph", () => {
  it("returns trimmed resultText", () => {
    expect(photoResultToParagraph({ resultText: "  ingredients: oats  ", blocks: [] })).toBe(
      "ingredients: oats"
    );
  });

  it("joins block text when resultText is missing", () => {
    expect(photoResultToParagraph(result([block("ingredients: oats", 0, 0), block("salt", 0, 20)]))).toBe(
      "ingredients: oats\nsalt"
    );
  });
});
