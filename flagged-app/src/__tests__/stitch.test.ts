import { frameText, pickBestFrameText, assembleParagraph, sortBlocks, RecognizedBlock } from "../ocr/stitch";

const b = (id: string, text: string, x = 0, y = 0): RecognizedBlock => ({ id, text, x, y });

describe("sortBlocks", () => {
  it("orders top-to-bottom then left-to-right", () => {
    const out = sortBlocks([b("1", "c", 0, 100), b("2", "a", 0, 0), b("3", "b", 50, 0)]);
    expect(out.map((x) => x.text)).toEqual(["a", "b", "c"]);
  });
});

describe("frameText", () => {
  it("joins a frame's blocks in reading order and collapses whitespace", () => {
    expect(frameText([b("1", "Water,", 0, 0), b("2", "Salt", 0, 20), b("3", "  Sugar ", 0, 40)])).toBe(
      "Water, Salt Sugar"
    );
  });
});

describe("pickBestFrameText", () => {
  const good =
    "Ingredients: Water, Skim milk, Monterey jack cheese, Modified corn starch, Jalapeno peppers. Contains: Milk";

  it("returns the longest frame that looks like an ingredient list", () => {
    const frames = [
      [b("a", "ARACHIDES YENNE MEDIUM")],
      [b("b", good)],
      [b("c", "Ingredients: Water")],
    ];
    expect(pickBestFrameText(frames)).toBe(good);
  });

  it("returns '' when frames are all short fragments (caller stitches instead)", () => {
    expect(pickBestFrameText([[b("a", "TOSTITOS MEDIUM")], [b("b", "SALSA AU")]])).toBe("");
  });

  it("falls back to the fullest frame when the header OCR'd badly", () => {
    const garbledHeader =
      "dients: Water, Skim milk, Monterey jack cheese, able oil, Modified corn starch, Diced tomatoes, Maltodextrin, Salt";
    const frames = [[b("a", "TOSTITOS MEDIUM SALSA CON QUESO")], [b("b", garbledHeader)]];
    expect(pickBestFrameText(frames)).toBe(garbledHeader);
  });

  it("matches the French header too", () => {
    const fr = "Ingredients : Eau, Lait ecreme, Fromage monterey jack, Huile vegetale";
    expect(pickBestFrameText([[b("a", fr)]])).toBe(fr);
  });

  it("uses the fullest substantial frame even with no header word at all", () => {
    const noHeader = "Water, Skim milk, Monterey jack cheese, Vegetable oil, Modified corn starch, Salt";
    expect(pickBestFrameText([[b("a", "MEDIUM SALSA")], [b("b", noHeader)]])).toBe(noHeader);
  });
});

describe("assembleParagraph (curved-surface fallback)", () => {
  it("stitches frames and dedups repeated blocks by id", () => {
    const f1 = [b("x", "ingredients: water", 0, 0), b("y", "sugar", 0, 20)];
    const f2 = [b("y", "sugar", 0, 20), b("z", "salt", 0, 40)];
    const out = assembleParagraph([f1, f2]);
    expect(out).toContain("ingredients: water");
    expect(out).toContain("salt");
    expect(out.match(/sugar/g)?.length).toBe(1);
  });
});
