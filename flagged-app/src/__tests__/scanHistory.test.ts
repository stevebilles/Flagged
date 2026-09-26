import { lastFlaggedTerms, scanCountLabel, scanEntryLabel } from "../domain/scanHistory";

describe("lastFlaggedTerms (what the last scan already found — newest entry first)", () => {
  it("is the terms of a flagged rescan", () => {
    const history = [
      { kind: "rescan", outcome: "flagged", matchedTerms: ["red 40"] },
      { kind: "saved", outcome: null, matchedTerms: [] },
    ] as const;
    expect(lastFlaggedTerms(history)).toEqual(["red 40"]);
  });

  it("is empty after a clean rescan, after the save, or with no history", () => {
    expect(lastFlaggedTerms([{ kind: "rescan", outcome: "no_red_flags", matchedTerms: [] }])).toEqual([]);
    expect(lastFlaggedTerms([{ kind: "saved", outcome: null, matchedTerms: [] }])).toEqual([]);
    expect(lastFlaggedTerms([])).toEqual([]);
  });

  it("only looks at the latest scan, not older flagged ones", () => {
    const history = [
      { kind: "rescan", outcome: "no_red_flags", matchedTerms: [] },
      { kind: "rescan", outcome: "flagged", matchedTerms: ["red 40"] },
    ] as const;
    expect(lastFlaggedTerms(history)).toEqual([]);
  });
});

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
