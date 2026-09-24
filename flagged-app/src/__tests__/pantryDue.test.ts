import { countDuePantryItems } from "../domain/pantryDue";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const item = (daysAgo: number) => ({ lastVerifiedDate: NOW - daysAgo * DAY });

describe("countDuePantryItems — Pantry items due for a recheck", () => {
  it("is zero for an empty Pantry", () => {
    expect(countDuePantryItems([], NOW)).toBe(0);
  });

  it("is zero when every item was verified within 30 days", () => {
    expect(countDuePantryItems([item(0), item(10), item(29)], NOW)).toBe(0);
  });

  it("does not count an item at exactly 30 days (it must be MORE than 30)", () => {
    expect(countDuePantryItems([item(30)], NOW)).toBe(0);
  });

  it("counts an item verified more than 30 days ago", () => {
    expect(countDuePantryItems([item(30.01)], NOW)).toBe(1);
    expect(countDuePantryItems([item(45)], NOW)).toBe(1);
  });

  it("counts only the due items in a mixed list", () => {
    expect(countDuePantryItems([item(2), item(31), item(90), item(29)], NOW)).toBe(2);
  });

  it("never counts an item whose date is in the future (clock moved backwards)", () => {
    expect(countDuePantryItems([item(-5)], NOW)).toBe(0);
  });
});
