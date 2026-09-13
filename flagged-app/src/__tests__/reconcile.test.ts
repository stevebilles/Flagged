import { alignWords, reconcileTexts } from "../ocr/reconcile";

describe("alignWords", () => {
  it("aligns a typo'd word with its correct counterpart instead of treating them as unrelated", () => {
    const pairs = alignWords(["Seasoning", "Milk"], ["scasoning", "Milk"]);
    expect(pairs).toEqual([
      ["Seasoning", "scasoning"],
      ["Milk", "Milk"],
    ]);
  });

  it("aligns a word missing its first letter (dropped-character misread)", () => {
    const pairs = alignWords(["Yeast", "extract"], ["east", "extract"]);
    expect(pairs).toEqual([
      ["Yeast", "east"],
      ["extract", "extract"],
    ]);
  });

  it("leaves a genuinely extra word unmatched rather than forcing a bad pairing", () => {
    const pairs = alignWords(["Maize", "Rice", "Salt"], ["Maize", "Rice", "Extra", "Salt"]);
    expect(pairs).toEqual([
      ["Maize", "Maize"],
      ["Rice", "Rice"],
      [null, "Extra"],
      ["Salt", "Salt"],
    ]);
  });

  it("identical sequences align position-for-position", () => {
    expect(alignWords(["a", "b", "c"], ["a", "b", "c"])).toEqual([
      ["a", "a"],
      ["b", "b"],
      ["c", "c"],
    ]);
  });
});

describe("reconcileTexts", () => {
  it("recovers a dropped-character misread via a 3rd confirmation read (real device case)", () => {
    // Reproduces "Yeast" -> "east" (2026-09-13): 2 of 3 reads got it right.
    const out = reconcileTexts("Onion powder, Yeast extract", "Onion powder, east extract", "Onion powder, Yeast extract");
    expect(out).toBe("Onion powder, Yeast extract");
  });

  it("recovers an equal-length letter substitution via majority vote across 3 reads", () => {
    // "Flayour" vs "Flavour" — same length, so a 2-read tiebreak has no
    // signal to prefer one over the other; a 3rd read breaks the tie.
    const out = reconcileTexts("Flayour (Natural)", "Flavour (Natural)", "Flavour (Natural)");
    expect(out).toBe("Flavour (Natural)");
  });

  it("with only 2 reads and no majority possible, falls back to the longer (more complete) candidate", () => {
    // A dropped character always shortens a word — "east" (4) vs "Yeast" (5).
    const out = reconcileTexts("Onion powder, east extract", "Onion powder, Yeast extract");
    expect(out).toBe("Onion powder, Yeast extract");
  });

  it("does not merge two genuinely different words that just happen to be similar length", () => {
    const out = reconcileTexts("Maize, Rice, Salt", "Maize, Corn, Salt");
    // Neither word wins a majority and they're similar enough to align, but
    // clearly different ingredients — the reconciler should not silently
    // invent a third possibility; it keeps SOME real reading, not garbage.
    expect(["Maize, Rice, Salt", "Maize, Corn, Salt"]).toContain(out);
  });

  it("handles a single text (nothing to reconcile against)", () => {
    expect(reconcileTexts("Maize, Rice, Salt")).toBe("Maize, Rice, Salt");
  });

  it("handles an empty read among the reads without corrupting the result", () => {
    expect(reconcileTexts("Maize, Rice, Salt", "")).toBe("Maize, Rice, Salt");
  });

  it("returns '' when every read is empty", () => {
    expect(reconcileTexts("", "", "")).toBe("");
  });

  it("reconciles a realistic multi-word ingredient clause across 3 noisy reads", () => {
    const read1 = "Maize, Rice. Seasoning [Milk solics, Salt, favour east extract";
    const read2 = "Maize, Rice, scasoning [Milk solids, Salt, Flavour Yeast extract";
    const read3 = "Maize, Rice, Seasoning [Milk solids, Salt, Flayour Yeast extract";
    const out = reconcileTexts(read1, read2, read3);
    expect(out).toContain("Seasoning");
    expect(out).toContain("Milk solids");
    expect(out).toContain("Yeast extract");
  });
});
