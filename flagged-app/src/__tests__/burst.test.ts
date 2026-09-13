import { looksSpatiallyComplete, looksTextuallyComplete } from "../ocr/completeness";
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

  it("false: a small block nested inside an earlier, taller block's bounding box doesn't manufacture a fake boundary", () => {
    // Reproduces a real risk with "compare only to the immediately preceding
    // block": a tiny block (B) sorts right after a much taller block (A) but
    // ends far sooner than A actually does, since B sits INSIDE A's real
    // visual extent. Comparing the next block (C) only to B's short end
    // makes C look like it's past a big gap, when C is actually still well
    // within A's real footprint — a false "complete" while still mid-panel.
    // Tracking the running max end (the furthest bottom edge seen so far)
    // instead means a small nested block can't hide how far the panel
    // actually extends.
    const blocks = [
      block("Ingredients:", 50, 20), // short header — sets baseline = 20, threshold = 40
      block("water, sugar, salt, yeast extract, onion powder", 100, 300), // tall block, real extent 100..400
      block("(a footnote mark)", 110, 10), // tiny block nested inside the tall block's range (110..120)
      block("Contains: none.", 350, 20), // still within the tall block's real range (100..400) — NOT a real boundary
    ];
    expect(looksSpatiallyComplete(blocks)).toBe(false);
  });
});

describe("looksTextuallyComplete", () => {
  it("true: brackets the list actually uses are fully balanced", () => {
    const text = "Ingredients: Maize, Rice, Seasoning [Milk solids, Salt, Flavour (Natural, contains soy flour)].";
    expect(looksTextuallyComplete(text)).toBe(true);
  });

  it("false: a genuinely truncated capture leaves an opening bracket unclosed", () => {
    // Reproduces the real device miss (2026-09-13): "[Milk solids ...
    // Anti-caking agent (551)" cut off before its own closing "]".
    const text = "Ingredients: Maize, Rice, Seasoning [Milk solids, Salt, Anti-caking agent (551)";
    expect(looksTextuallyComplete(text)).toBe(false);
  });

  it("true: a dropped opening-bracket character leaves an extra unmatched close, but that's not truncation", () => {
    // Reproduces the real device miss (2026-09-13): ML Kit read straight from
    // "Seasoning" into "Milk solids" as plain text, dropping the "[" itself
    // (squareOpens=0), while still correctly reading the later closing "]"
    // after "(551)" (squareCloses=1) and continuing all the way to a clean
    // period at the end. Requiring exact bracket-count equality wrongly
    // rejected this as "incomplete" — but an unmatched CLOSE can never be
    // produced by cutting text off at the end (that can only ever strand an
    // unmatched OPEN), so this must read as complete.
    const text =
      "Ingredients: Maize, Rice, Seasoning, Milk solids, Salt, Flavour (Natural, contains soy flour), Sugar, Cheese powder (milk), Yeast extract, Onion powder, Foodaid (270,327,330), Anti-caking agent (551)], Sunflower oil, Herb extract.";
    expect(looksTextuallyComplete(text)).toBe(true);
  });

  it("false: a list with no brackets at all — nothing to check, so no false 'complete'", () => {
    // Zero opens/zero closes is trivially "balanced" regardless of whether
    // the list was actually cut off at a plain comma — this must NOT read
    // as complete just because there's nothing to unbalance.
    const text = "Ingredients: water, sugar, salt, yeast extract, onion powder, and more to come";
    expect(looksTextuallyComplete(text)).toBe(false);
  });

  it("false: too short to be a real capture", () => {
    expect(looksTextuallyComplete("Ingredients: [a]")).toBe(false);
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
