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

  it("doesn't let a large-font region elsewhere on the label widen the row tolerance for small, tightly-spaced text", () => {
    // Reproduces a real device miss (2026-09-13): a Nutrition Facts panel's
    // large numbers (height ~280) sat on the same photo as a small, dense
    // ingredients paragraph whose lines are only ~50px apart (height ~60
    // each). A row tolerance based on the whole photo's median height came
    // out wide enough (~55px) to misjudge two sequential ingredient-list
    // lines as "the same row" and sort them by x instead of y — scrambling
    // their order and injecting a stray mid-list header-like fragment that
    // truncated the real list before it reached a later, genuinely
    // dangerous ingredient (a safety-critical miss, not just a cosmetic
    // ordering issue). Tolerance must come from the LOCAL pair being
    // compared, not a global figure for the whole photo.
    const bigNutritionBlock = block("Nutrition Facts", 500, 100, 300, 280);
    const line1 = block("Ingredients: water, sugar,", 460, 2099, 1300, 62);
    const line2 = block("salt, dangerous nut oil.", 460, 2149, 1300, 62);
    const out = photoResultToParagraph(result([bigNutritionBlock, line2, line1]));
    expect(out).toBe("Nutrition Facts Ingredients: water, sugar, salt, dangerous nut oil.");
  });

  it("orders sequential paragraph lines by y even when their gap-to-height ratio varies between photos", () => {
    // Two real device captures (2026-09-13), same content, cropped with the
    // corner tool at slightly different tightness — proved a HEIGHT-derived
    // row tolerance is fundamentally unstable, not just mistunable: on one
    // capture the line gap (81px) cleared the tolerance (61px) and sorted
    // correctly; on the next, near-identical capture the gap (65px) fell
    // just under a slightly higher tolerance (68px, from slightly taller
    // text) and got misjudged as "the same row," scrambling two lines and
    // wrongly showing "CLEAN" for a label that actually contains a flagged
    // ingredient. Horizontal overlap is stable at ~99% in both captures
    // regardless of the gap/height ratio, which is why that's the signal
    // used now instead.
    const failingCapture = [
      block("Ingredients: Maize, Rice, seasoning [Milk solids, Salt, Flavour", 186, 50, 1576, 114),
      block("(Natural, contains soy flour), Sugar, Cheese powder (milk),", 175, 115, 1569, 114),
      block("Yeast extract, Onion powder, Food acid (270, 327, 330)", 183, 178, 1399, 122),
      block("Anti-caking agent (551)], Sunflower oil, Herb extract", 189, 243, 1316, 107),
    ];
    const out = photoResultToParagraph(result(failingCapture));
    expect(out).toBe(
      "Ingredients: Maize, Rice, seasoning [Milk solids, Salt, Flavour " +
        "(Natural, contains soy flour), Sugar, Cheese powder (milk), " +
        "Yeast extract, Onion powder, Food acid (270, 327, 330) " +
        "Anti-caking agent (551)], Sunflower oil, Herb extract"
    );
  });
});
