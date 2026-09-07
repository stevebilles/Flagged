import { toRecognizedBlocks, photoResultToParagraph, MLKitText } from "../ocr/recognition";
import { assembleParagraph } from "../ocr/stitch";

/**
 * Tests for the ML Kit → RecognizedBlock adapter (src/ocr/recognition.ts).
 * Uses the plugin's documented tuple shape:
 *   blocks: [blockFrame, cornerPoints, lines, languages, blockText]
 */

function block(text: string, x: number, y: number) {
  const frame = { x, y, width: 100, height: 20, boundingCenterX: x + 50, boundingCenterY: y + 10 };
  return [frame, [{ x, y }], [], [], text];
}

describe("toRecognizedBlocks", () => {
  it("maps tuple blocks to {id,text,x,y} and drops empties", () => {
    const result: MLKitText[] = [
      { resultText: "water sugar", blocks: [block("water", 10, 20), block("  ", 10, 40), block("sugar", 10, 60)] },
    ];
    const out = toRecognizedBlocks(result);
    expect(out.map((b) => b.text)).toEqual(["water", "sugar"]);
    expect(out[0]).toMatchObject({ x: 10, y: 20 });
    expect(out.every((b) => typeof b.id === "string" && b.id.length > 0)).toBe(true);
  });

  it("gives the same id for the same block position+text (dedup across frames)", () => {
    const a = toRecognizedBlocks([{ resultText: "red 40", blocks: [block("red 40", 12, 30)] }]);
    const b = toRecognizedBlocks([{ resultText: "red 40", blocks: [block("red 40", 13, 31)] }]);
    // rounded to an 8px grid → stable id when the camera nudges slightly
    expect(a[0].id).toBe(b[0].id);
  });

  it("falls back to resultText when blocks are unusable", () => {
    const out = toRecognizedBlocks([{ resultText: "ingredients: salt", blocks: [] as any }]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("ingredients: salt");
  });

  it("handles null/garbage input safely", () => {
    expect(toRecognizedBlocks(null)).toEqual([]);
    expect(toRecognizedBlocks(undefined)).toEqual([]);
  });
});

describe("adapter feeds the stitch pipeline", () => {
  it("assembles a paragraph from multiple frames with dedup", () => {
    const frame1 = toRecognizedBlocks([{ resultText: "", blocks: [block("ingredients: water", 0, 0), block("sugar", 0, 20)] }]);
    // second frame re-sees "sugar" (same spot) and adds "salt"
    const frame2 = toRecognizedBlocks([{ resultText: "", blocks: [block("sugar", 0, 20), block("salt", 0, 40)] }]);
    const paragraph = assembleParagraph([frame1, frame2]);
    expect(paragraph).toContain("ingredients: water");
    expect(paragraph).toContain("salt");
    // "sugar" should appear once (deduped by stable id)
    expect(paragraph.match(/sugar/g)?.length).toBe(1);
  });
});

describe("photoResultToParagraph", () => {
  it("returns trimmed resultText", () => {
    expect(photoResultToParagraph({ resultText: "  ingredients: oats  ", blocks: [] } as any)).toBe(
      "ingredients: oats"
    );
  });
});
