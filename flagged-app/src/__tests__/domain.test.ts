import { levenshtein, similarity } from "../matching/levenshtein";
import { normalizeParagraph, tokenize, looksLikeIngredientList } from "../matching/normalize";
import { matchParagraph } from "../matching/matcher";
import { diffIngredients, evaluateRecheck } from "../domain/diffEngine";
import {
  deselectPack,
  isPackActive,
  selectPack,
  effectiveRedFlagTerms,
} from "../domain/activation";
import type { Category, Profile, QuickPack } from "../domain/types";

describe("levenshtein / similarity", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("red 40", "red 40")).toBe(0);
  });
  it("fuzzy similarity crosses 85% for near-typos", () => {
    expect(similarity("aspartame", "aspartame")).toBe(1);
    expect(similarity("sucralose", "sucraloze")).toBeGreaterThanOrEqual(0.85);
  });
});

describe("normalize + tokenize", () => {
  it("lowercases, rejoins hyphenated line breaks, tokenizes", () => {
    const p = normalizeParagraph("Ingredients: Sug-\nar, Red 40 (color).");
    expect(p).toContain("sugar");
    const toks = tokenize(p);
    expect(toks).toContain("red 40");
  });
});

describe("looksLikeIngredientList", () => {
  it("accepts a clean or garbled header, and the French spelling", () => {
    expect(looksLikeIngredientList("INGREDIENTS: water, salt")).toBe(true);
    expect(looksLikeIngredientList("dients: water, salt")).toBe(true);
    expect(looksLikeIngredientList("Contains: milk")).toBe(true);
    expect(looksLikeIngredientList("Ingrédients : eau, sel")).toBe(true);
  });
  it("accepts a long comma-dense capture when the header OCR'd away", () => {
    expect(
      looksLikeIngredientList("water, skim milk, monterey jack cheese, vegetable oil, corn starch, salt")
    ).toBe(true);
  });
  it("rejects a short scrap of label art", () => {
    expect(looksLikeIngredientList("MEDIUM SALSA CON QUESO")).toBe(false);
  });
});

describe("matcher", () => {
  const terms = ["red 40", "high fructose corn syrup", "aspartame"];
  it("finds exact matches", () => {
    const r = matchParagraph("Ingredients: water, red 40, salt.", terms);
    expect(r.isClean).toBe(false);
    expect(r.matches.some((m) => m.term === "red 40")).toBe(true);
  });
  it("clean when nothing matches", () => {
    const r = matchParagraph("Ingredients: oats, honey, almonds.", terms);
    expect(r.isClean).toBe(true);
  });

  it("matches a term inside a longer label phrase", () => {
    // real label: "milk" appears inside "skim milk" / "contains: milk"
    const r = matchParagraph("Ingredients: water, skim milk, cheese. Contains: milk", ["milk"]);
    expect(r.isClean).toBe(false);
    expect(r.matches.map((m) => m.term)).toEqual(["milk"]);
  });

  it("matches a multi-word term even when OCR glues punctuation to it", () => {
    const r = matchParagraph("Water, vegetable oil. tomato juice, salt", ["vegetable oil"]);
    expect(r.matches.some((m) => m.term === "vegetable oil")).toBe(true);
  });

  it("does not match across a word boundary (buttermilk is not butter)", () => {
    const r = matchParagraph("Ingredients: buttermilk, salt", ["butter"]);
    expect(r.isClean).toBe(true);
  });

  it("longer phrase wins: peanut butter does not also report butter", () => {
    const r = matchParagraph("Ingredients: peanut butter, sugar", ["butter", "peanut butter"]);
    expect(r.matches.map((m) => m.term)).toEqual(["peanut butter"]);
  });

  it("reports each matched term once", () => {
    const r = matchParagraph("milk, water, milk solids, more milk", ["milk"]);
    expect(r.matches).toHaveLength(1);
  });

  it("recovers a fuzzy single-word match from OCR garble", () => {
    const r = matchParagraph("Ingredients: water, aspertame, salt", ["aspartame"]);
    expect(r.matches.some((m) => m.term === "aspartame" && m.kind === "fuzzy")).toBe(true);
  });
});

describe("pack activation + shared categories", () => {
  const packs: QuickPack[] = [
    { id: "focus", name: "Focus & ADHD", type: "composite", categoryIds: ["dyes", "synth"] },
    { id: "pres", name: "Preservatives", type: "composite", categoryIds: ["nitrates", "sulfites", "synth"] },
  ];
  const base: Profile = {
    profileId: "p1", name: "x", activeCategoryIds: [], excludedIngredientIds: [], customIngredients: [], createdAt: 0,
  };

  it("selecting a pack activates all its categories", () => {
    const p = selectPack(base, packs[0]);
    expect(new Set(p.activeCategoryIds)).toEqual(new Set(["dyes", "synth"]));
    expect(isPackActive(p, packs[0])).toBe(true);
  });

  it("deselecting a pack keeps a shared category needed by another active pack", () => {
    let p = selectPack(base, packs[0]); // dyes, synth
    p = selectPack(p, packs[1]); // + nitrates, sulfites
    p = deselectPack(p, packs[1], packs); // remove Preservatives
    // synth is shared with Focus & ADHD (still active) → must remain
    expect(p.activeCategoryIds).toContain("synth");
    expect(p.activeCategoryIds).not.toContain("nitrates");
    expect(p.activeCategoryIds).not.toContain("sulfites");
  });
});

describe("effective red-flag set", () => {
  const categories: Category[] = [
    { id: "dyes", name: "Artificial dyes", parentGroup: "Additives", classification: "advisory", ingredientIds: ["i-red40", "i-yellow5"] },
  ];
  const termById = new Map([["i-red40", "red 40"], ["i-yellow5", "yellow 5"]]);
  it("union of active categories minus excluded plus custom", () => {
    const profile: Profile = {
      profileId: "p", name: "x", activeCategoryIds: ["dyes"], excludedIngredientIds: ["i-yellow5"], customIngredients: ["carrageenan"], createdAt: 0,
    };
    const terms = effectiveRedFlagTerms(profile, categories, termById);
    expect(terms).toContain("red 40");
    expect(terms).not.toContain("yellow 5");
    expect(terms).toContain("carrageenan");
  });
});

describe("diff engine (pantry recheck)", () => {
  it("detects identical", () => {
    const d = diffIngredients(["a", "b", "c"], ["a", "b", "c"]);
    expect(d.changed).toBe(false);
  });
  it("detects additions/removals", () => {
    const d = diffIngredients(["a", "b"], ["a", "b", "red 40"]);
    expect(d.added).toContain("red 40");
    expect(d.changed).toBe(true);
  });
  it("detects order shift among survivors", () => {
    const d = diffIngredients(["a", "b", "c"], ["a", "c", "b"]);
    expect(d.orderShifted).toBe(true);
  });
  it("changed + flagged when a new red flag appears", () => {
    const outcome = evaluateRecheck(["oats", "honey"], ["oats", "honey", "red 40"], ["red 40"]);
    expect(outcome.kind).toBe("changed_flagged");
  });
  it("changed but safe when no red flags", () => {
    const outcome = evaluateRecheck(["oats", "honey"], ["oats", "honey", "salt"], ["red 40"]);
    expect(outcome.kind).toBe("changed_safe");
  });
});
