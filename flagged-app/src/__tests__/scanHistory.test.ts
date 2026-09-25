import { scanCountLabel, scanEntryLabel } from "../domain/scanHistory";

describe("scanCountLabel (the running total on the item screen)", () => {
  it("is singular for one scan and plural otherwise", () => {
    expect(scanCountLabel(1)).toBe("1 scan");
    expect(scanCountLabel(2)).toBe("2 scans");
    expect(scanCountLabel(12)).toBe("12 scans");
  });
});

describe("scanEntryLabel (the line under each history entry's date)", () => {
  it("labels the save, in the positive tone", () => {
    expect(scanEntryLabel({ kind: "saved", outcome: null })).toEqual({ text: "Saved to Pantry", tone: "cyan" });
  });

  it("labels a rescan by what it found — reporting, never a safety claim", () => {
    expect(scanEntryLabel({ kind: "rescan", outcome: "no_red_flags" })).toEqual({
      text: "Rescanned — no red flags found",
      tone: "cyan",
    });
    expect(scanEntryLabel({ kind: "rescan", outcome: "flagged" })).toEqual({
      text: "Rescanned — red flags found",
      tone: "red",
    });
  });
});
