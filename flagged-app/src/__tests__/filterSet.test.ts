import { sameFilterSet, filterSetLines, checkedForLines } from "../domain/filterSet";
import type { Category, ProfileSnapshot } from "../domain/types";

// The clean recheck screen's "Profile at time of each scan" card (docs/07 §7.1): it must say the
// filter set is the SAME only when it truly is, and list what was being scanned for.
const snap = (over: Partial<ProfileSnapshot> = {}): ProfileSnapshot => ({
  activeCategoryIds: ["cat-big9", "cat-dyes"],
  excludedIngredientIds: [],
  customIngredients: [],
  ...over,
});

const categories: Category[] = [
  { id: "cat-big9", name: "Big-9 Allergens", parentGroup: "Allergens", classification: "regulated", ingredientIds: [] },
  { id: "cat-dyes", name: "Artificial Dyes", parentGroup: "Additives", classification: "advisory", ingredientIds: [] },
  { id: "cat-sugars", name: "Hidden sugars", parentGroup: "Sugars", classification: "advisory", ingredientIds: [] },
];

describe("sameFilterSet", () => {
  it("is true for identical sets, regardless of order", () => {
    expect(sameFilterSet(snap(), snap({ activeCategoryIds: ["cat-dyes", "cat-big9"] }))).toBe(true);
  });

  it("is false when a category was added or removed", () => {
    expect(sameFilterSet(snap(), snap({ activeCategoryIds: ["cat-big9", "cat-dyes", "cat-sugars"] }))).toBe(false);
    expect(sameFilterSet(snap(), snap({ activeCategoryIds: ["cat-big9"] }))).toBe(false);
  });

  it("is false when only an ingredient exclusion differs", () => {
    expect(sameFilterSet(snap(), snap({ excludedIngredientIds: ["ing-red40"] }))).toBe(false);
  });

  it("compares custom red flags case-insensitively, and notices a different one", () => {
    expect(sameFilterSet(snap({ customIngredients: ["Shellac"] }), snap({ customIngredients: ["shellac"] }))).toBe(true);
    expect(sameFilterSet(snap({ customIngredients: ["shellac"] }), snap({ customIngredients: ["carmine"] }))).toBe(false);
  });
});

// The scan result's "What we checked for" card.
describe("checkedForLines", () => {
  it("lists a single profile's categories, custom red flags and the turned-off count", () => {
    expect(
      checkedForLines([snap({ customIngredients: ["shellac"], excludedIngredientIds: ["a", "b"] })], categories)
    ).toEqual(["Big-9 Allergens", "Artificial Dyes", "Custom: shellac", "2 ingredients turned off"]);
  });

  it("is the union across several profiles (an 'All' scan), with no turned-off count", () => {
    const lines = checkedForLines(
      [
        snap({ activeCategoryIds: ["cat-big9"], customIngredients: ["Shellac"], excludedIngredientIds: ["a"] }),
        snap({ activeCategoryIds: ["cat-sugars", "cat-big9"], customIngredients: ["shellac", "carmine"] }),
      ],
      categories
    );
    expect(lines).toEqual(["Big-9 Allergens", "Hidden sugars", "Custom: Shellac", "Custom: carmine"]);
  });

  it("is empty — not a placeholder — when nothing was switched on", () => {
    expect(checkedForLines([snap({ activeCategoryIds: [], excludedIngredientIds: ["a"] })], categories)).toEqual([]);
    expect(checkedForLines([], categories)).toEqual([]);
  });
});

describe("filterSetLines", () => {
  it("lists active category names (dictionary order), not ids", () => {
    expect(filterSetLines(snap({ activeCategoryIds: ["cat-dyes", "cat-big9"] }), categories)).toEqual([
      "Big-9 Allergens",
      "Artificial Dyes",
    ]);
  });

  it("adds custom red flags and a count of turned-off ingredients", () => {
    const lines = filterSetLines(
      snap({ customIngredients: ["shellac"], excludedIngredientIds: ["a", "b"] }),
      categories
    );
    expect(lines).toEqual(["Big-9 Allergens", "Artificial Dyes", "Custom: shellac", "2 ingredients turned off"]);
    expect(filterSetLines(snap({ excludedIngredientIds: ["a"] }), categories).pop()).toBe("1 ingredient turned off");
  });

  it("never returns an empty list", () => {
    expect(filterSetLines(snap({ activeCategoryIds: [] }), categories)).toEqual(["No red flags selected"]);
  });
});
