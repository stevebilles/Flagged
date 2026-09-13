import { toSpatialBlocks, photoResultToParagraph } from "../ocr/recognition";
import type { VisionOcrResult } from "vision-ocr";

/**
 * Tests for the vision-ocr → SpatialBlock adapter (src/ocr/recognition.ts).
 * Fixtures mirror our own native module's contract (modules/vision-ocr):
 * `{ text, blocks: [{ text, x, y, width, height }] }`, already in plain
 * top-left-origin pixel coordinates of the upright photo — no reverse-
 * engineered remap needed here, unlike the old ML Kit adapter.
 */

function block(text: string, x: number, y: number, width = 100, height = 20) {
  return { text, x, y, width, height };
}

function result(blocks: ReturnType<typeof block>[], text = ""): VisionOcrResult {
  return { text, blocks };
}

describe("toSpatialBlocks", () => {
  it("maps blocks to {id,text,x,y,width,height} and passes coordinates through unchanged", () => {
    const out = toSpatialBlocks(result([block("water", 10, 20), block("sugar", 10, 60)], "water sugar"));
    expect(out.map((b) => b.text)).toEqual(["water", "sugar"]);
    expect(out[0]).toMatchObject({ x: 10, y: 20, width: 100, height: 20 });
    expect(out.every((b) => typeof b.id === "string" && b.id.length > 0)).toBe(true);
  });

  it("handles an empty block list safely", () => {
    expect(toSpatialBlocks(result([]))).toEqual([]);
  });
});

describe("photoResultToParagraph", () => {
  it("falls back to the plugin's own text when there are no blocks to sort by position", () => {
    expect(photoResultToParagraph(result([], "ingredients: oats"))).toBe("ingredients: oats");
  });

  it("builds the paragraph from position-sorted blocks, not the plugin's own concatenated text", () => {
    // text is deliberately WRONG/scrambled here to prove blocks (with real
    // position data) win when present — a dense layout can scramble clause
    // order in a flat concatenated string, so position data (when available)
    // is trusted instead of reconstructing order from it.
    const out = photoResultToParagraph(
      result([block("ingredients: oats", 0, 0), block("salt", 0, 20)], "salt ingredients: oats")
    );
    expect(out).toBe("ingredients: oats salt");
  });

  it("orders blocks top-to-bottom by measured position even when the block array arrives out of order", () => {
    const out = photoResultToParagraph(result([block("salt", 0, 100), block("ingredients: oats", 0, 0)]));
    expect(out).toBe("ingredients: oats salt");
  });

  it("orders blocks left-to-right within the same row", () => {
    const out = photoResultToParagraph(result([block("value", 100, 0), block("label", 0, 0)]));
    expect(out).toBe("label value");
  });
});
