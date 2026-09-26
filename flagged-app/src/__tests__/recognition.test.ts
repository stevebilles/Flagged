import {
  toSpatialBlocks,
  photoResultToParagraph,
  splitOffColumnBlocks,
  splitAboveListBlocks,
} from "../ocr/recognition";
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

function result(
  blocks: ReturnType<typeof block>[],
  text = "",
  imageSize = { imageWidth: 2000, imageHeight: 2000 }
): VisionOcrResult {
  return { text, blocks, ...imageSize };
}

// A REAL guide-box capture (Metro log, 2026-09-25, a bread-crumb tin): the ingredient column runs
// x ≈ 240–1450, and a recipe printed down the tin's right side ("Dip fish, …") sits at x ≈ 1440–1740.
// "fish" was matched and flagged as a new red flag. y/h/x/w are exactly as logged.
const TIN_CAPTURE = [
  block("Sodium 210mg", 235, -2, 443, 83),
  block("Potassium 60mg", 246, 111, 469, 97),
  block("Calcium 50mg", 248, 218, 398, 98),
  block("Iron / Fer 1.25mg", 251, 327, 479, 92),
  block("9%", 1353, 0, 97, 65),
  block("1%", 1353, 124, 87, 60),
  block("4%", 1345, 229, 90, 60),
  block("7%", 1343, 328, 87, 62),
  block("*5% or less is a little, 15% or more is a lot", 256, 433, 959, 122),
  block("*5% ou moins c'est peu, 15% ou plus c'est beaucoup", 257, 493, 1162, 123),
  block("Ingredients: Enriched wheat flour • Sugars (glucose-fructose,", 240, 623, 1208, 111),
  block("sugar, dextrose, fancy molasses, honey) • Yeast • Salt•", 251, 703, 1194, 103),
  block("Soybean oil, Cottonseed and/or canola oil• Wheat gluten • Soy", 253, 762, 1183, 107),
  block("flour • Malted barley flour • Whey • Soy lecithin • Whole wheat", 253, 827, 1185, 119),
  block("flour • Corn flour • Corn meal • Citric acid• Grain vinegar•", 258, 897, 1180, 111),
  block("Potato flour • Rice flour • Wheat bran • Oat bran • Rye flour •", 263, 961, 1175, 115),
  block("Skim milk powder • Calcium propionate • Sesame seeds •", 265, 1031, 1168, 122),
  block("Caraway seeds • Egg.", 262, 1090, 401, 127),
  block("Contains: Wheat • Milk • Soy • Barley • Rye • Oats • Egg • Sesame.", 271, 1157, 1111, 141),
  block("Ingrédients: Farine de blé enrichie • Sucres (glucose-fructose,", 269, 1252, 1149, 131),
  block("sucre, dextrose, melasse de fantaisie, miel) • Levure • Sel •", 278, 1324, 1142, 125),
  block("Bread", 1582, 65, 127, 87),
  block("Dip fish,", 1522, 209, 187, 114),
  block("beaten i", 1517, 328, 191, 82),
  block("Bread Cr", 1501, 401, 218, 119),
  block("desired. H", 1488, 489, 239, 138),
  block("few minut", 1491, 614, 223, 102),
  block("Poiso", 1555, 803, 158, 113),
  block("Tremper le", 1470, 922, 268, 183),
  block("dans lauf", 1458, 1019, 267, 177),
  block("dans la chu", 1453, 1115, 271, 176),
  block("une panun", 1460, 1214, 260, 192),
  block("lentement.", 1448, 1315, 248, 166),
  block("couleur do", 1442, 1381, 265, 208),
];

describe("splitOffColumnBlocks (text in a different column from the ingredient paragraph)", () => {
  it("drops the recipe strip down the side of the tin — the block that caused the false 'fish' flag", () => {
    const { dropped } = splitOffColumnBlocks(toSpatialBlocks(result(TIN_CAPTURE, "", { imageWidth: 1800, imageHeight: 1700 })));
    expect(dropped.map((b) => b.text)).toEqual([
      "Bread", "Dip fish,", "beaten i", "Bread Cr", "desired. H", "few minut",
      "Poiso", "Tremper le", "dans lauf", "dans la chu", "une panun", "lentement.", "couleur do",
    ]);
  });

  it("keeps the whole ingredient list, the Contains line, the French repeat and the nutrition % values", () => {
    const text = photoResultToParagraph(result(TIN_CAPTURE, "", { imageWidth: 1800, imageHeight: 1700 }), {
      dropOffColumnText: true,
    });
    for (const kept of ["Ingredients:", "Enriched wheat flour", "Sesame seeds", "Contains: Wheat", "Ingrédients:", "9%", "Sodium 210mg"]) {
      expect(text).toContain(kept);
    }
    expect(text).not.toMatch(/fish|Bread|desired|Poiso/i);
  });

  it("without the option nothing is dropped (the Choose Photo path is unchanged)", () => {
    const text = photoResultToParagraph(result(TIN_CAPTURE, "", { imageWidth: 1800, imageHeight: 1700 }));
    expect(text).toContain("Dip fish,");
  });

  it("does nothing when there are too few long lines to define a column", () => {
    const few = [block("water", 0, 0, 100), block("salt", 500, 40, 100), block("sugar", 900, 80, 100)];
    expect(splitOffColumnBlocks(toSpatialBlocks(result(few))).dropped).toEqual([]);
    expect(splitOffColumnBlocks([]).dropped).toEqual([]);
  });

  it("keeps a two-column ingredient list — both columns' lines are long, so both are in the main span", () => {
    const twoCol = [
      block("water, sugar, salt", 0, 0, 400), block("flour, yeast, oil", 0, 40, 400), block("milk, egg, soy", 0, 80, 400),
      block("corn, rice, oat", 450, 0, 400), block("barley, rye, malt", 450, 40, 400), block("honey, butter", 450, 80, 400),
    ];
    expect(splitOffColumnBlocks(toSpatialBlocks(result(twoCol))).dropped).toEqual([]);
  });

  it("keeps a line that is mostly inside the column even if it pokes past the edge", () => {
    const lines = [0, 40, 80, 120].map((y) => block("a long ingredient line goes here", 100, y, 800));
    const poking = block("water, salt, sugar", 700, 160, 400); // 200 of 400 inside = exactly half
    const out = splitOffColumnBlocks(toSpatialBlocks(result([...lines, poking])));
    expect(out.dropped).toEqual([]);
  });
});

describe("splitAboveListBlocks (text up high, above the ingredient list)", () => {
  const tin = () => toSpatialBlocks(result(TIN_CAPTURE, "", { imageWidth: 1800, imageHeight: 1700 }));

  it("drops the nutrition panel well above the header, keeps the footnotes right above it and everything below", () => {
    const { dropped } = splitAboveListBlocks(tin());
    expect(dropped.map((b) => b.text)).toEqual([
      "Sodium 210mg", "Potassium 60mg", "Calcium 50mg", "Iron / Fer 1.25mg", "9%", "1%", "4%", "7%",
      // The recipe strip's upper lines sit well above the header too — including "Dip fish," itself, so
      // this rule alone would also have prevented the false flag (the column filter drops the rest).
      "Bread", "Dip fish,", "beaten i",
    ]);
  });

  it("with both filters on, the real capture yields just the list area — no fish, no nutrition panel", () => {
    const text = photoResultToParagraph(result(TIN_CAPTURE, "", { imageWidth: 1800, imageHeight: 1700 }), {
      dropOffColumnText: true,
      dropTextAboveList: true,
    });
    expect(text).toContain("Ingredients: Enriched wheat flour");
    expect(text).toContain("Sesame seeds");
    expect(text).toContain("*5% or less is a little"); // directly above the header — kept
    expect(text).not.toMatch(/fish|Bread|Sodium|Potassium|Calcium 50|Iron \/ Fer|9%/i);
  });

  it("finds the header without a colon, and with OCR garble", () => {
    const list = (header: string) => [
      block("Sodium 210mg", 0, 0, 300, 40), // well above
      block(`${header} water, sugar, salt`, 0, 300, 800, 40),
      block("flour, yeast, oil", 0, 350, 800, 40),
    ];
    for (const header of ["Ingredients", "Ingredient", "INGREDIENTS:", "Ingredlents:", "Ingrédients :"]) {
      const { dropped } = splitAboveListBlocks(toSpatialBlocks(result(list(header))));
      expect(dropped.map((b) => b.text)).toEqual(["Sodium 210mg"]);
    }
  });

  it("uses a 'Contains' start only when there is no ingredient header — and prefers the ingredient header", () => {
    const onlyContains = [
      block("Sodium 210mg", 0, 0, 300, 40),
      block("Contains: milk, wheat, soy", 0, 300, 800, 40),
    ];
    expect(splitAboveListBlocks(toSpatialBlocks(result(onlyContains))).dropped.map((b) => b.text)).toEqual([
      "Sodium 210mg",
    ]);
    // "Contains:" lower down must NOT become the start when an ingredient header exists above it.
    const both = [
      block("Sodium 210mg", 0, 0, 300, 40),
      block("Ingredients: water, sugar", 0, 300, 800, 40),
      block("flour, yeast", 0, 350, 800, 40),
      block("Contains: wheat", 0, 400, 800, 40),
    ];
    expect(splitAboveListBlocks(toSpatialBlocks(result(both))).dropped.map((b) => b.text)).toEqual(["Sodium 210mg"]);
  });

  it("does nothing when no ingredient header can be found", () => {
    const noHeader = [block("Sodium 210mg", 0, 0, 300, 40), block("water, sugar, salt, flour", 0, 300, 800, 40)];
    expect(splitAboveListBlocks(toSpatialBlocks(result(noHeader))).dropped).toEqual([]);
    expect(splitAboveListBlocks([]).dropped).toEqual([]);
  });

  // A second photo ("Scan More") of a list too wide for one photo: the English continuation, its short
  // last line, then a LATER header (a second-language "Ingrédients:") and its list. Realistic geometry:
  // block height ≈ 110, line spacing ≈ 65 (boxes overlap). Nothing of the English list may be dropped,
  // even if this filter were applied to it.
  const SECOND_PHOTO = [
    block("Potato flour • Rice flour • Wheat bran • Oat bran • Rye flour •", 260, 0, 1170, 110),
    block("Skim milk powder • Calcium propionate • Sesame seeds •", 262, 65, 1160, 110),
    block("Caraway seeds • Egg.", 262, 130, 401, 110), // short last line of the English list
    block("Contains: Wheat • Milk • Soy • Barley • Rye • Oats • Egg • Sesame.", 270, 400, 1110, 110),
    block("Ingrédients: Farine de blé enrichie • Sucres (glucose-fructose,", 268, 560, 1149, 110),
    block("sucre, dextrose, melasse de fantaisie, miel) • Levure • Sel •", 278, 625, 1142, 110),
  ];

  it("never eats the continuation of the list on a second photo, even when a later header is in frame", () => {
    const { dropped } = splitAboveListBlocks(toSpatialBlocks(result(SECOND_PHOTO)));
    // The anchor here is the LATER header at y=560 — the long lines above it are kept (rule 1). Only the
    // short last line, far above that header, is a candidate; it must not be lost either, so the
    // caller never applies this filter to a second photo (CameraScanner: first photo only).
    expect(dropped.map((b) => b.text)).not.toContain("Skim milk powder • Calcium propionate • Sesame seeds •");
    expect(dropped.map((b) => b.text)).not.toContain("Potato flour • Rice flour • Wheat bran • Oat bran • Rye flour •");
  });

  it("with the filter off (a second photo) every line of the continuation is kept and stitched text is complete", () => {
    const text = photoResultToParagraph(result(SECOND_PHOTO), { dropOffColumnText: true, dropTextAboveList: false });
    for (const part of ["Potato flour", "Skim milk powder", "Caraway seeds • Egg.", "Contains: Wheat", "Ingrédients:"]) {
      expect(text).toContain(part);
    }
  });

  it("never drops anything below the header", () => {
    const { kept } = splitAboveListBlocks(tin());
    const headerY = 623;
    expect(kept.filter((b) => b.y >= headerY).length).toBe(TIN_CAPTURE.filter((b) => b.y >= headerY).length);
  });
});

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

  it("drops text sliced off by the crop boundary when dropEdgeClippedText is set", () => {
    // Real device capture (2026-09-13): the user's crop box sat well inside
    // the Nutrition Facts footnote above and a French repeat below, but
    // Vision still recognized the slivers of those lines that survived the
    // hard crop, bleeding "a plus c'est beaucoup" and the French repeat into
    // the result. Both clipped lines are flush against the cropped image's
    // own top/bottom edge (no margin) — a real included line never is,
    // since nobody drags a crop edge to land exactly on a letter's pixel.
    const imageWidth = 1200;
    const imageHeight = 800;
    const clippedTop = block("a plus cest beaucoup", 50, 0, 900, 15);
    const line1 = block("Ingredients: Maize, Rice, seasoning", 100, 50, 900, 60);
    const line2 = block("Milk solids, Salt, Sunflower oil", 100, 115, 900, 60);
    const clippedBottom = block("Ingredients: Mais, Riz. Assairor", 50, 780, 900, 20);
    const withoutFilter = photoResultToParagraph(
      result([clippedTop, line1, line2, clippedBottom], "", { imageWidth, imageHeight })
    );
    expect(withoutFilter).toContain("beaucoup");
    expect(withoutFilter).toContain("Assairor");

    const filtered = photoResultToParagraph(
      result([clippedTop, line1, line2, clippedBottom], "", { imageWidth, imageHeight }),
      { dropEdgeClippedText: true }
    );
    expect(filtered).toBe("Ingredients: Maize, Rice, seasoning Milk solids, Salt, Sunflower oil");
  });

  it("keeps a full-width line that merely runs close to the crop's left/right edge (real device miss, 2026-09-13)", () => {
    // Real regression once cropping became automatic (a fixed guide box,
    // not a precisely user-drawn rectangle): a genuine, fully-intact
    // "Ingredients:" line ran right up to the crop's own right edge simply
    // because that's how a wrapped paragraph fills the available width —
    // nothing was actually cut off. An earlier version of this filter also
    // checked left/right edges and discarded the entire line (header
    // included), losing the whole ingredient list. Only top/bottom
    // (vertical) edge-touching means real clipping now.
    const imageWidth = 2138;
    const imageHeight = 2498;
    const fullWidthLine = block("Ingredients: Maize, Rice, Seasoning, Milk solids, Salt, Flavour", 199, 1271, 1936, 113);
    const out = photoResultToParagraph(result([fullWidthLine], "", { imageWidth, imageHeight }), {
      dropEdgeClippedText: true,
    });
    expect(out).toBe("Ingredients: Maize, Rice, Seasoning, Milk solids, Salt, Flavour");
  });
});
