import { looksSpatiallyComplete } from "../ocr/completeness";
import { combineBurst } from "../ocr/burst";
import type { SpatialBlock } from "../ocr/recognition";

const block = (text: string, y: number, height = 20, x = 0, width = 100): SpatialBlock => ({
  id: `${x}:${y}:${text.length}`,
  text,
  x,
  y,
  height,
  width,
});

describe("looksSpatiallyComplete", () => {
  it("true: a clear gap after the ingredients block, before an unrelated section", () => {
    // Ingredients header + body sit close together (normal line spacing),
    // then a much bigger gap before the next, visually separate block
    // (e.g. a Nutrition Facts table or marketing text below it).
    const blocks = [
      block("Ingredients: water, sugar, salt.", 100, 60), // one fused panel block
      block("Manufactured for Real Foods Pty Ltd", 400, 20), // far below — different section
    ];
    expect(looksSpatiallyComplete(blocks)).toBe(true);
  });

  it("false: no header block found at all", () => {
    const blocks = [block("Nutrition Facts", 0, 20), block("Calories 50", 30, 20)];
    expect(looksSpatiallyComplete(blocks)).toBe(false);
  });

  it("false: header is the last/only block (photo ended mid-panel, nothing after it to compare)", () => {
    const blocks = [block("Ingredients: water, sug", 100, 20)];
    expect(looksSpatiallyComplete(blocks)).toBe(false);
  });

  it("false: the next block sits right up against the header, same normal spacing (likely still mid-panel)", () => {
    const blocks = [
      block("Ingredients:", 0, 20),
      block("water, sugar, salt.", 22, 20), // normal ~2px line gap
      block("Contains: none.", 44, 20), // still normal spacing — part of the same panel
    ];
    expect(looksSpatiallyComplete(blocks)).toBe(false);
  });
});

describe("combineBurst", () => {
  it("returns '' for an empty burst", () => {
    expect(combineBurst([])).toBe("");
  });

  it("returns the only shot's text when just one photo came back with content", () => {
    expect(combineBurst([{ text: "water, sugar", blocks: [] }])).toBe("water, sugar");
  });

  it("picks the single complete shot and discards near-duplicate others (the common flat-label case)", () => {
    const completeText = "Ingredients: water, sugar, salt. Contains: none.";
    const completeBlocks = [block(completeText, 0, 60), block("Best before 2027", 400, 20)];
    const shots = [
      { text: completeText, blocks: completeBlocks },
      { text: "Ingredients: water, sugar", blocks: [block("Ingredients: water, sugar", 0, 20)] }, // a blurrier, partial shot of the same label
      { text: completeText, blocks: completeBlocks },
    ];
    expect(combineBurst(shots)).toBe(completeText);
  });

  it("stitches genuinely different, overlapping partial shots when none alone is complete (a long/curved label)", () => {
    const shot1 = { text: "Ingredients: water, sugar, salt, yeast extract", blocks: [block("x", 0, 20)] };
    const shot2 = { text: "yeast extract, onion powder, sunflower oil.", blocks: [block("x", 0, 20)] };
    const result = combineBurst([shot1, shot2]);
    expect(result).toContain("water, sugar, salt, yeast extract, onion powder, sunflower oil.");
  });

  it("drops shots whose content is entirely subsumed by a longer one instead of duplicating it", () => {
    const long = {
      text: "Ingredients: water, sugar, salt, yeast extract, onion powder, sunflower oil",
      blocks: [block("x", 0, 20)],
    };
    // A realistic-length (not trivially short) capture whose entire content
    // is one contiguous run also present in `long` — e.g. a slightly
    // blurrier shot of the same portion of the label.
    const short = { text: "water, sugar, salt, yeast extract, onion powder", blocks: [block("x", 0, 20)] };
    const result = combineBurst([long, short]);
    expect(result).toBe(long.text);
  });
});
