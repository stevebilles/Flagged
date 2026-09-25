import { explainMatch, formatDateTime, formatDayOrToday } from "../domain/recheckExplain";
import type { AttributedMatch } from "../domain/recheckEngine";

// The explanation a user reads when a rescan flags something (docs/07 §7.1): it must say WHEN they
// saved the item and, for a profile change, WHEN they made it — and must never present a
// "reformulation" as a fact (a clean scan can miss things).
const SAVED = Date.UTC(2026, 8, 25, 15, 47); // Sep 25, 2026
const CHANGED = Date.UTC(2026, 9, 20, 19, 12); // Oct 20, 2026

const base = { token: "sodium benzoate", term: "sodium benzoate", kind: "exact" as const, score: 1 };
const category = (attribution: AttributedMatch["attribution"]): AttributedMatch => ({
  ...base,
  categoryId: "cat-preservatives",
  categoryName: "Preservatives",
  attribution,
});

describe("formatDayOrToday (the clean recheck screen's compact date fields)", () => {
  const NOW = new Date(2026, 8, 25, 13, 41).getTime();

  it("says Today for any time on the current calendar day", () => {
    expect(formatDayOrToday(new Date(2026, 8, 25, 0, 5).getTime(), NOW)).toBe("Today");
    expect(formatDayOrToday(new Date(2026, 8, 25, 23, 59).getTime(), NOW)).toBe("Today");
  });

  it("shows a dated day (with the year) for an earlier day, including yesterday", () => {
    const earlier = formatDayOrToday(new Date(2026, 7, 14, 9, 0).getTime(), NOW);
    expect(earlier).not.toBe("Today");
    expect(earlier).toMatch(/2026/);
    expect(formatDayOrToday(new Date(2026, 8, 24, 21, 39).getTime(), NOW)).not.toBe("Today");
  });
});

describe("formatDateTime", () => {
  it("includes the year and a time of day", () => {
    const s = formatDateTime(SAVED);
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("explainMatch", () => {
  it("a category the user added AFTER saving cites when they added it and when they saved", () => {
    const text = explainMatch(category({ kind: "profile_change", cause: "category_added" }), {
      savedAt: SAVED,
      changeAt: CHANGED,
    });
    expect(text).toContain("You added Preservatives to your red flags");
    expect(text).toContain(formatDateTime(CHANGED));
    expect(text).toContain(formatDateTime(SAVED));
    expect(text).toContain("That's why it's flagging now");
  });

  it("falls back to a dateless (but still saved-dated) explanation when the change log has no entry", () => {
    const text = explainMatch(category({ kind: "profile_change", cause: "category_added" }), {
      savedAt: SAVED,
      changeAt: null,
    });
    expect(text).toContain("Preservatives wasn't on your red flags");
    expect(text).toContain(formatDateTime(SAVED));
  });

  it("a re-included ingredient says the user stopped excluding it", () => {
    const text = explainMatch(
      category({ kind: "profile_change", cause: "ingredient_included", ingredientId: "ing-1" }),
      { savedAt: SAVED, changeAt: CHANGED }
    );
    expect(text).toContain("You stopped excluding Sodium benzoate");
    expect(text).toContain(formatDateTime(CHANGED));
  });

  it("a custom red flag added after saving quotes the term", () => {
    const m: AttributedMatch = {
      ...base,
      term: "carmine",
      categoryId: null,
      categoryName: "Custom ingredient",
      attribution: { kind: "profile_change", cause: "custom_added" },
    };
    const text = explainMatch(m, { savedAt: SAVED, changeAt: CHANGED });
    expect(text).toContain('You added "Carmine" to your custom red flags');
  });

  it("a reformulation is never stated as fact — it says the recipe MAY have changed or the earlier scan missed it", () => {
    const text = explainMatch(category({ kind: "reformulation" }), { savedAt: SAVED, changeAt: null });
    expect(text).toContain(formatDateTime(SAVED));
    expect(text).toContain("may have changed");
    expect(text).toContain("missed it");
    expect(text).not.toMatch(/wasn't present/i);
  });

  it("says 'last checked' instead of 'saved' when the recorded filters date from a later recheck", () => {
    const text = explainMatch(category({ kind: "profile_change", cause: "category_added" }), {
      savedAt: SAVED,
      changeAt: CHANGED,
      kept: true,
    });
    expect(text).toContain("after you last checked this on");
    expect(text).not.toContain("after you saved this on");
  });
});
