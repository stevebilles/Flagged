import { levenshtein, similarity } from "../matching/levenshtein";
import {
  normalizeParagraph,
  tokenize,
  looksLikeIngredientList,
  extractIngredientList,
} from "../matching/normalize";
import { matchParagraph } from "../matching/matcher";
import { diffIngredients, evaluateRecheck } from "../domain/diffEngine";
import {
  deselectPack,
  isPackActive,
  selectPack,
  effectiveRedFlagTerms,
  effectiveRedFlagMetaForAll,
} from "../domain/activation";
import type { Category, Profile, QuickPack } from "../domain/types";

/** Per-profile dashboard counters (docs/17) — zeroed for fixtures that don't care. */
const zeroProfileStats = {
  totalLabelsRead: 0,
  totalRedFlagsCaught: 0,
  totalCleanScans: 0,
  totalSkimpflationCaught: 0,
  totalReformulationsCaught: 0,
};

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

describe("extractIngredientList", () => {
  // The real back panel of a bilingual bread-crumb can: nutrition panel + "5%"
  // disclaimer above, English list, allergen line, French list, serving note.
  const breadCan =
    "Protein / Protéines 4g Cholesterol / Cholestérol 0mg Sodium 210mg 9% " +
    "Potassium 60mg 1% Calcium 50mg 4% Iron / Fer 1.25mg 7% " +
    "*5% or less is a little, 15% or more is a lot *5% ou moins c'est peu, 15% ou plus c'est beaucoup " +
    "Ingredients: Enriched wheat flour • Sugars (glucose-fructose, sugar, dextrose, fancy molasses, honey) • " +
    "Yeast • Salt • Soybean oil, cottonseed and/or canola oil • Wheat gluten • Soy flour • Malted barley flour • " +
    "Whey • Soy lecithin • Whole wheat flour • Corn flour • Corn meal • Citric acid • Grain vinegar • " +
    "Potato flour • Rice flour • Wheat bran • Oat bran • Rye flour • Skim milk powder • Calcium propionate • " +
    "Sesame seeds • Caraway seeds • Egg. Contains: Wheat • Milk • Soy • Barley • Rye • Oats • Egg • Sesame. " +
    "Ingrédients: Farine de blé enrichie • Sucres (glucose-fructose, sucre) • Levure • Sel " +
    "Serving Suggestion Présentation suggérée";

  it("keeps only the English list + allergen line from a bilingual label", () => {
    const out = extractIngredientList(breadCan);
    expect(out).toMatch(/^Enriched wheat flour/);
    expect(out).toContain("Soybean oil, cottonseed and/or canola oil");
    expect(out).toContain("Calcium propionate");
    expect(out).toMatch(/Contains: Wheat, Milk, Soy, Barley, Rye, Oats, Egg, Sesame\.$/);
    expect(out).not.toMatch(/Farine|Serving Suggestion/); // French + marketing gone
    expect(out).not.toMatch(/210\s*mg|5\s*%\s*or less/i); // nutrition panel gone
  });

  it("recovers when OCR mangles the header word itself ('Ingredlents:')", () => {
    const raw =
      "Dip fish, dip in beaten egg then Bread Crumbs. Fry a few minutes per side. " +
      "MEAT BM CASSEROLED BOU Ingredlents: Enriched wheat flour• Sugars (glucose-fructose) • " +
      "Yeast• Salt Soybean oil • Wheat gluten • Whey • Egg. Contains: Wheat • Milk • Soy • Sesame. " +
      "Ihgrédients: Farine de blé enrichie• Sucres • Levure • Sel " +
      "*5% or less is a little, 15% or more is a lot % Daily Value* Cholesterol / Cholestérol 0mg Sodium 210mg";
    const out = extractIngredientList(raw);
    expect(out).toMatch(/^Enriched wheat flour/);
    expect(out).not.toMatch(/Dip fish|CASSEROLED|Farine|Cholesterol/);
    expect(out).toMatch(/Contains: Wheat, Milk, Soy, Sesame\.$/);
  });

  it("re-inserts separators the OCR dropped between items", () => {
    const runOn =
      "Ingredients: Enriched wheat flour Sugars (glucose-fructose, sugar) Yeast Salt " +
      "Soybean oil Wheat gluten Soy lecithin Egg. Contains: Wheat Milk Soy.";
    const out = extractIngredientList(runOn);
    expect(out).toContain("wheat flour, Sugars");
    expect(out).toContain("Yeast, Salt, Soybean oil, Wheat gluten, Soy lecithin");
    expect(out).toMatch(/Contains: Wheat, Milk, Soy\.$/);
  });

  it("splits items the OCR ran together with no space ('flourCorn meal')", () => {
    const out = extractIngredientList("Ingredients: whole wheat flourCorn meal, citric acid, salt");
    expect(out).toContain("wheat flour, Corn meal");
  });

  it("does NOT split a Title-Case label into single words", () => {
    const out = extractIngredientList("Ingredients: Enriched Wheat Flour, Water, Sugar, Yeast, Soybean Oil");
    expect(out).toBe("Enriched Wheat Flour, Water, Sugar, Yeast, Soybean Oil");
  });

  it("keeps nutrient words that are real ingredients (Sodium phosphate)", () => {
    const out = extractIngredientList(
      "Ingredients: water, maltodextrin, salt, sodium phosphate, mono- and diglycerides, spices"
    );
    expect(out).toContain("sodium phosphate");
    expect(out).toContain("spices");
  });

  it("stops at a nutrition amount when there is no allergen line", () => {
    const out = extractIngredientList("Ingredients: oats, honey, salt Sodium 210mg 9% Potassium 60mg");
    expect(out).toBe("oats, honey, salt");
  });

  it("returns the raw text unchanged when there is no header", () => {
    expect(extractIngredientList("just some words, no header here")).toBe(
      "just some words, no header here"
    );
  });

  it("handles empty input", () => {
    expect(extractIngredientList("")).toBe("");
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

  it("regression: regexClean never corrupts a digit-bearing term (red 40 ↛ red 4o)", () => {
    // The '0'→'o' OCR cleanup must not be applied to terms containing digits,
    // or a real dye code would stop matching. See docs/13 (earlier bug).
    const clean = matchParagraph("Ingredients: sugar, red 40, citric acid", ["red 40"]);
    expect(clean.matches.map((m) => m.term)).toEqual(["red 40"]);

    // And a label whose "40" was OCR'd as "4o" should NOT false-match "red 40"
    // (we don't invent digits); it just stays clean.
    const garbled = matchParagraph("Ingredients: sugar, red 4o, citric acid", ["red 40"]);
    expect(garbled.isClean).toBe(true);
  });

  it("digit dye codes match independently (yellow 5, blue 1)", () => {
    const r = matchParagraph("color added (yellow 5, blue 1)", ["yellow 5", "blue 1", "red 40"]);
    expect(r.matches.map((m) => m.term).sort()).toEqual(["blue 1", "yellow 5"]);
  });
});

describe("pack activation + shared categories", () => {
  const packs: QuickPack[] = [
    { id: "focus", name: "Focus & ADHD", type: "composite", categoryIds: ["dyes", "synth"] },
    { id: "pres", name: "Preservatives", type: "composite", categoryIds: ["nitrates", "sulfites", "synth"] },
  ];
  const base: Profile = {
    profileId: "p1", name: "x", activeCategoryIds: [], excludedIngredientIds: [], customIngredients: [], createdAt: 0,
    ...zeroProfileStats,
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
      ...zeroProfileStats,
    };
    const terms = effectiveRedFlagTerms(profile, categories, termById);
    expect(terms).toContain("red 40");
    expect(terms).not.toContain("yellow 5");
    expect(terms).toContain("carrageenan");
  });
});

describe("effectiveRedFlagMetaForAll (docs/17 'All' mode)", () => {
  const categories: Category[] = [
    { id: "dyes", name: "Artificial Dyes", parentGroup: "Additives", classification: "advisory", ingredientIds: ["i-red40"] },
    { id: "milk", name: "Milk", parentGroup: "Allergens", classification: "regulated", ingredientIds: ["i-milk"] },
    { id: "nuts", name: "Tree Nuts", parentGroup: "Allergens", classification: "regulated", ingredientIds: ["i-almond"] },
  ];
  const termById = new Map([
    ["i-red40", "red 40"],
    ["i-milk", "milk"],
    ["i-almond", "almond"],
  ]);
  const sofia: Profile = {
    profileId: "sofia", name: "Sofia", activeCategoryIds: ["dyes", "milk"], excludedIngredientIds: [], customIngredients: [], createdAt: 0,
    ...zeroProfileStats,
  };
  const steve: Profile = {
    profileId: "steve", name: "Steve", activeCategoryIds: ["milk", "nuts"], excludedIngredientIds: [], customIngredients: [], createdAt: 0,
    ...zeroProfileStats,
  };

  it("unions every profile's terms", () => {
    const meta = effectiveRedFlagMetaForAll([sofia, steve], categories, termById);
    expect(new Set(meta.keys())).toEqual(new Set(["red 40", "milk", "almond"]));
  });

  it("a term only one profile has names just that profile", () => {
    const meta = effectiveRedFlagMetaForAll([sofia, steve], categories, termById);
    expect(meta.get("red 40")?.profileNames).toEqual(["Sofia"]);
    expect(meta.get("almond")?.profileNames).toEqual(["Steve"]);
  });

  it("a term shared by two profiles names both, without duplicates", () => {
    const meta = effectiveRedFlagMetaForAll([sofia, steve], categories, termById);
    expect(meta.get("milk")?.profileNames).toEqual(["Sofia", "Steve"]);
  });

  it("carries the classification through for badges", () => {
    const meta = effectiveRedFlagMetaForAll([sofia, steve], categories, termById);
    expect(meta.get("milk")?.classification).toBe("regulated");
    expect(meta.get("red 40")?.classification).toBe("advisory");
  });

  it("returns an empty set for an empty profile list", () => {
    expect(effectiveRedFlagMetaForAll([], categories, termById).size).toBe(0);
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
