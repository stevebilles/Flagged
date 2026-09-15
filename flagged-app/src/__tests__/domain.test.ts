import { levenshtein, similarity } from "../matching/levenshtein";
import {
  normalizeParagraph,
  tokenize,
  looksLikeIngredientList,
  extractIngredientList,
  cleanForDisplay,
} from "../matching/normalize";
import { matchParagraph, type Match } from "../matching/matcher";
import { attributeRecheckMatches, evaluateRecheck } from "../domain/recheckEngine";
import {
  selectPack,
  effectiveRedFlagTerms,
  effectiveRedFlagMetaForAll,
  snapshotFromProfile,
  diffProfileChanges,
} from "../domain/activation";
import { displayName } from "../domain/types";
import type { Category, Profile, ProfileSnapshot, QuickPack } from "../domain/types";

/** Per-profile dashboard counters (docs/17) — zeroed for fixtures that don't care. */
const zeroProfileStats = {
  totalLabelsRead: 0,
  totalRedFlagsCaught: 0,
  totalCleanScans: 0,
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

  it("recovers a fuzzy OCR-misread letter inside a MULTI-word term (real device miss, 2026-09-13)", () => {
    // "Sunfiower oil" — an l->i slip — never matched "sunflower oil" before
    // this fix, since multi-word terms were excluded from fuzzy matching
    // entirely (only single words got the fuzzy fallback).
    const r = matchParagraph("Anti-caking agent (551), Sunfiower oil, Herb extract", ["sunflower oil"]);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({ term: "sunflower oil", kind: "fuzzy" });
    expect(r.isClean).toBe(false);
  });

  it("fuzzy-matches a short word inside a multi-word term when its neighbor already matched (real device miss, 2026-09-13)", () => {
    // "Sunflower oll" — an i->l OCR slip, one of the most common OCR
    // confusions — never matched "sunflower oil" before this fix, because
    // "oil" (3 letters) was held to the same exact-match-only floor as a
    // STANDALONE short term (the "malt"/"salt" regression). But here "oil"
    // isn't standing alone: "sunflower" right next to it already matched
    // with real confidence, and coincidentally matching both a phrase's
    // words side by side for text that isn't actually about that phrase is
    // vanishingly unlikely — the neighbor's own match is a safety net a
    // standalone short word doesn't have.
    const r = matchParagraph("Anti-caking agent (551), Sunflower oll, Herb extract", ["sunflower oil"]);
    expect(r.isClean).toBe(false);
    expect(r.matches[0]).toMatchObject({ term: "sunflower oil", kind: "fuzzy" });
  });

  it("still won't fuzzy a 1-2 letter connector word, even next to a matched neighbor", () => {
    // Below the length-3 floor there's no signal left to judge similarity
    // on at all, neighbor or not.
    const r = matchParagraph("Sunflower xx", ["sunflower of"]);
    expect(r.isClean).toBe(true);
  });

  it("does not fuzzy-match a multi-word term across unrelated words", () => {
    const r = matchParagraph("Sunflower seeds and olive oil blend", ["sunflower oil"]);
    expect(r.isClean).toBe(true);
  });

  it("never fuzzes a multi-word term containing a digit (same rule as single-word dye codes)", () => {
    const r = matchParagraph("citric acit 4o", ["citric acid 40"]);
    expect(r.isClean).toBe(true);
  });

  it("does not blend adjacent words from two DIFFERENT printed ingredients into a false multi-word match", () => {
    // Steve's observation, 2026-09-13: the real separator printed between
    // ingredients (a comma here; some labels use a "•" bullet instead) marks
    // a true boundary — two words that are only adjacent because one
    // ingredient happens to end right where another begins should never be
    // read as a single two-word phrase, even if they'd otherwise score a
    // fuzzy match. "Yeast" and a typo'd "Extrbct" are separate ingredients
    // here (comma-separated), not "Yeast extract".
    const r = matchParagraph("Yeast, Extrbct powder, Salt", ["yeast extract"]);
    expect(r.isClean).toBe(true);
  });

  it("still matches a genuine multi-word phrase that itself contains no internal separator", () => {
    // Same word pair, no comma between them this time — a real occurrence
    // of "Yeast extract" as one ingredient, with the same single-letter typo.
    const r = matchParagraph("Onion powder, Yeast extrbct, Salt", ["yeast extract"]);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({ term: "yeast extract", kind: "fuzzy" });
  });

  it("recognizes a bullet-dot ingredient separator the same way as a comma", () => {
    const r = matchParagraph("Yeast • Extrbct powder • Salt", ["yeast extract"]);
    expect(r.isClean).toBe(true);
  });

  it("catches a single-letter OCR misread on a short standalone allergen word (real device miss, 2026-09-13)", () => {
    // "Neast" for "Yeast" — a real Vision misread. The OLD flat 85%-
    // similarity threshold required ~7+ letters to survive even one typo
    // (a single edit on a 5-letter word only scores 80%), so this fell
    // through the fuzzy net entirely: the red-flag term was present on the
    // label but the scan reported clean. maxAllowedEdits fixes this for
    // words of 5+ letters (still exact-only under 5 — see the "malt"/"salt"
    // regression below for why 4-letter words don't get this tolerance).
    const r = matchParagraph("Ingredients: Maize, Rice, Neast extract, Salt", ["yeast"]);
    expect(r.isClean).toBe(false);
    expect(r.matches[0]).toMatchObject({ term: "yeast", kind: "fuzzy" });
  });

  it("does not fuzzy-match a 4-letter term against unrelated words at all", () => {
    // 4-letter terms are exact-match-only (see the "malt"/"salt" regression
    // below for why) — "malt" and "bulk" must stay unmatched against "milk".
    const r = matchParagraph("Ingredients: barley malt, bulk fiber, water", ["milk"]);
    expect(r.isClean).toBe(true);
  });

  it("does not confuse two common, unrelated 4-letter words one edit apart (real device miss, 2026-09-13)", () => {
    // Real false positive: "malt" (a Gluten Sources term) fuzzy-matched
    // "salt" — present in nearly every ingredient list — because 1-edit
    // tolerance at length 4 doesn't distinguish "the same word, misread"
    // from "a completely different, extremely common word" (a single
    // substitution changes a quarter of a 4-letter word). 4-letter terms
    // are exact-match-only now specifically because of this; 5+ letter
    // words (see "yeast"/"Neast" above) keep 1-edit tolerance since real
    // collisions there are markedly rarer.
    const r = matchParagraph("Ingredients: Water, Salt, Sugar, Citric Acid", ["malt"]);
    expect(r.isClean).toBe(true);
  });

  it("does not confuse two different real ingredients that happen to be 2 edits apart (real device miss, 2026-09-13)", () => {
    // "sunflower" and "safflower" are both genuine, different oils, exactly
    // 2 letters apart. A scan of a label that only said "Sunflower oil"
    // wrongly also reported "safflower oil" as present once 9-letter words
    // were allowed 2 edits — fabricating a second ingredient that was never
    // on the label. 9-letter words are capped at 1 edit specifically
    // because of this.
    const r = matchParagraph("Ingredients: Maize, Rice, Sunflower oil, Herb extract", ["safflower oil"]);
    expect(r.isClean).toBe(true);
  });

  it("does not fuzzy-match a bilingual label's generic French 'farine' as the English term 'farina' (real device miss, 2026-09-14)", () => {
    // "farina" (Wheat) is 1 edit from "farine" — French for "flour" in
    // general, printed on every bilingual ingredient list regardless of
    // which flour is actually used. A real scan false-flagged Wheat on a
    // French section reading "Farine de soya" (soy flour) purely because
    // "farine" and "farina" are both 6 letters, 1 edit apart. "farina" is
    // exact-match-only now specifically because of this.
    const r = matchParagraph("Ingrédients: Farine de soya, Farine de riz, Sel", ["farina"]);
    expect(r.isClean).toBe(true);
  });

  it("still matches 'farina' when the label actually says it", () => {
    const r = matchParagraph("Ingredients: Farina, Sugar, Salt", ["farina"]);
    expect(r.isClean).toBe(false);
    expect(r.matches[0]).toMatchObject({ term: "farina", kind: "exact" });
  });

  it("the common-words countersignal is a general mechanism, not a one-off fix for farina specifically", () => {
    // "water" is a COMMON_LABEL_WORDS entry, unrelated to any real dictionary
    // term — this proves the guard rejects a fuzzy candidate for ANY term
    // one edit away from an ordinary word, not just the farina/farine pair
    // that motivated it. A fictional 5-letter term stands in for "some
    // future dictionary term" so this doesn't depend on today's dictionary
    // contents happening to collide with "water".
    const r = matchParagraph("Ingredients: Water, Sugar, Salt", ["watee"]);
    expect(r.isClean).toBe(true);
  });
});

describe("cleanForDisplay (results-screen cosmetic OCR cleanup)", () => {
  it("fixes a leading zero-for-O misread", () => {
    expect(cleanForDisplay("Rice flour, Wheat bran, 0at bran, Rye flour")).toBe(
      "Rice flour, Wheat bran, Oat bran, Rye flour"
    );
  });

  it("fixes a lone apostrophe standing in for a dropped comma", () => {
    expect(cleanForDisplay("Salt' Soybean oil")).toBe("Salt, Soybean oil");
  });

  it("never touches a dye code, E-number, or a weight", () => {
    expect(cleanForDisplay("color added (Red 40, Yellow 5)")).toBe("color added (Red 40, Yellow 5)");
    expect(cleanForDisplay("contains E120 and E621")).toBe("contains E120 and E621");
    expect(cleanForDisplay("Sodium 40mg per serving")).toBe("Sodium 40mg per serving");
  });

  it("leaves a real possessive alone (letter right after the apostrophe, no space)", () => {
    expect(cleanForDisplay("Baker's chocolate")).toBe("Baker's chocolate");
  });
});

describe("pack activation (onboarding starting template only)", () => {
  const pack: QuickPack = { id: "focus", name: "Focus & ADHD", type: "composite", categoryIds: ["dyes", "synth"] };
  const base: Profile = {
    profileId: "p1", name: "x", activeCategoryIds: [], excludedIngredientIds: [], customIngredients: [], createdAt: 0,
    ...zeroProfileStats,
  };

  it("selecting a pack activates all its categories", () => {
    const p = selectPack(base, pack);
    expect(new Set(p.activeCategoryIds)).toEqual(new Set(["dyes", "synth"]));
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

describe("recheck engine (pantry, docs/07 §7.1 — profile-snapshot comparison, 2026-09-14)", () => {
  const snapshot = (over: Partial<ProfileSnapshot> = {}): ProfileSnapshot => ({
    activeCategoryIds: ["cat-dyes"],
    excludedIngredientIds: [],
    customIngredients: ["shellac"],
    ...over,
  });
  const match = (over: Partial<Match> = {}): Match => ({
    token: "red 40",
    term: "red 40",
    kind: "exact",
    score: 1,
    categoryId: "cat-dyes",
    categoryName: "Artificial Dyes",
    ...over,
  });

  it("evaluateRecheck: a clean rescan is identical, regardless of the old snapshot", () => {
    const outcome = evaluateRecheck(true, [], snapshot());
    expect(outcome.kind).toBe("identical");
  });

  it("evaluateRecheck: a flagged rescan carries attributed matches", () => {
    const outcome = evaluateRecheck(false, [match()], snapshot());
    expect(outcome.kind).toBe("changed_flagged");
    if (outcome.kind === "changed_flagged") {
      expect(outcome.matches[0].attribution.kind).toBe("reformulation");
    }
  });

  it("attributes a match as reformulation when its category was already being screened for", () => {
    // The old snapshot already had cat-dyes active — the product was clean
    // under that exact filter before, so the ingredient itself is presumably new.
    const [attributed] = attributeRecheckMatches([match({ categoryId: "cat-dyes" })], snapshot());
    expect(attributed.attribution.kind).toBe("reformulation");
  });

  it("attributes a match as a profile change when its category was NOT in the old snapshot", () => {
    // cat-msg was not active at save time — the filter is what's new, not
    // necessarily the ingredient (docs/07 §7.1).
    const [attributed] = attributeRecheckMatches(
      [match({ categoryId: "cat-msg", categoryName: "MSG & Glutamates" })],
      snapshot()
    );
    expect(attributed.attribution.kind).toBe("profile_change");
  });

  it("attributes a custom-ingredient match by comparing the term itself, not a category id", () => {
    const already = match({ term: "shellac", categoryId: null, categoryName: "Custom ingredient" });
    const [attributedAlready] = attributeRecheckMatches([already], snapshot());
    expect(attributedAlready.attribution.kind).toBe("reformulation");

    const newCustom = match({ term: "carmine", categoryId: null, categoryName: "Custom ingredient" });
    const [attributedNew] = attributeRecheckMatches([newCustom], snapshot());
    expect(attributedNew.attribution.kind).toBe("profile_change");
  });
});

describe("snapshotFromProfile + diffProfileChanges (docs/03 §3.2/3.2a)", () => {
  const categories: Category[] = [
    { id: "cat-dyes", name: "Artificial Dyes", parentGroup: "Additives", classification: "advisory", ingredientIds: [] },
  ];
  const baseProfile: Profile = {
    profileId: "p1",
    name: "Steve",
    activeCategoryIds: ["cat-dyes"],
    excludedIngredientIds: [],
    customIngredients: ["shellac"],
    createdAt: 0,
    ...zeroProfileStats,
  };

  it("snapshotFromProfile copies exactly the fields that determine the effective red-flag set", () => {
    const snap = snapshotFromProfile(baseProfile);
    expect(snap).toEqual({
      activeCategoryIds: ["cat-dyes"],
      excludedIngredientIds: [],
      customIngredients: ["shellac"],
    });
  });

  it("snapshotFromProfile returns independent arrays, not references into the profile", () => {
    const snap = snapshotFromProfile(baseProfile);
    snap.activeCategoryIds.push("cat-msg");
    expect(baseProfile.activeCategoryIds).toEqual(["cat-dyes"]);
  });

  it("diffProfileChanges reports nothing for an unrelated change (e.g. renaming)", () => {
    const renamed = { ...baseProfile, name: "Stacy" };
    expect(diffProfileChanges(baseProfile, renamed, categories)).toEqual([]);
  });

  it("diffProfileChanges reports a category_on entry when a category is newly activated", () => {
    const next = { ...baseProfile, activeCategoryIds: ["cat-dyes", "cat-msg"] };
    const changes = diffProfileChanges(baseProfile, next, categories);
    expect(changes).toEqual([
      { profileId: "p1", timestamp: expect.any(Number), changeType: "category_on", categoryId: "cat-msg", categoryName: "cat-msg", ingredientTerm: null },
    ]);
  });

  it("diffProfileChanges reports both a category_off and a custom_added entry from one combined save", () => {
    // Mirrors activateIngredient in profile-edit.tsx, which can persist() two
    // logical changes (a category toggle and an exclusion toggle) at once.
    const next = { ...baseProfile, activeCategoryIds: [], customIngredients: ["shellac", "carmine"] };
    const changes = diffProfileChanges(baseProfile, next, categories);
    expect(changes).toContainEqual(
      expect.objectContaining({ changeType: "category_off", categoryId: "cat-dyes" })
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ changeType: "custom_added", ingredientTerm: "carmine" })
    );
    expect(changes).toHaveLength(2);
  });
});

describe("displayName", () => {
  it("returns the real name when one is set", () => {
    expect(displayName("Sofia")).toBe("Sofia");
  });
  it("falls back to New Profile for an empty or whitespace-only name", () => {
    expect(displayName("")).toBe("New Profile");
    expect(displayName("   ")).toBe("New Profile");
  });
});

