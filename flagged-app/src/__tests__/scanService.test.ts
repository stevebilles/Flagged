/**
 * Trial gate + scan/recheck stats math (docs/03/06/08).
 * Constitution II & V: this accounting must be covered — a mis-count either
 * charges a user for a scan they didn't get, or gives away scans for free.
 *
 * `src/db/repositories` is mocked so these stay pure (it pulls in expo-sqlite).
 */
jest.mock("../db/repositories", () => ({
  getCategories: jest.fn(() => []),
  getIngredientTermMap: jest.fn(() => new Map<string, string>()),
  getStats: jest.fn(),
  saveStats: jest.fn(),
}));

import * as repo from "../db/repositories";
import {
  canScan,
  scansRemaining,
  commitScanStats,
  commitRecheckStats,
  evaluateScan,
} from "../domain/scanService";
import type { Stats, Profile } from "../domain/types";
import type { ScanResult } from "../matching/matcher";
import type { DiffResult } from "../domain/diffEngine";

const zeroStats = (): Stats => ({
  statsId: "s1",
  freeScansUsed: 0,
  totalLabelsRead: 0,
  totalRedFlagsCaught: 0,
  totalCleanScans: 0,
  totalSkimpflationCaught: 0,
  totalReformulationsCaught: 0,
});

/** Wire getStats/saveStats to a mutable in-memory row. */
function withStats(initial: Partial<Stats> = {}) {
  let row: Stats = { ...zeroStats(), ...initial };
  (repo.getStats as jest.Mock).mockImplementation(() => ({ ...row }));
  (repo.saveStats as jest.Mock).mockImplementation((s: Stats) => {
    row = { ...s };
  });
  return () => row;
}

const clean: ScanResult = { tokens: [], matches: [], isClean: true };
const flagged = (n: number): ScanResult => ({
  tokens: [],
  matches: Array.from({ length: n }, (_, i) => ({
    token: `t${i}`,
    term: `t${i}`,
    kind: "exact" as const,
    score: 1,
  })),
  isClean: false,
});

const emptyProfile: Profile = {
  profileId: "p",
  name: "x",
  activeCategoryIds: [],
  excludedIngredientIds: [],
  customIngredients: [],
  createdAt: 0,
};

beforeEach(() => jest.clearAllMocks());

describe("canScan / scansRemaining", () => {
  it("premium can always scan", () => {
    withStats({ freeScansUsed: 10 });
    expect(canScan(true)).toBe(true);
  });
  it("trial can scan while under the limit, not at it", () => {
    withStats({ freeScansUsed: 9 });
    expect(canScan(false)).toBe(true);
    withStats({ freeScansUsed: 10 });
    expect(canScan(false)).toBe(false);
  });
  it("scansRemaining floors at 0", () => {
    withStats({ freeScansUsed: 3 });
    expect(scansRemaining()).toBe(7);
    withStats({ freeScansUsed: 12 });
    expect(scansRemaining()).toBe(0);
  });
});

describe("commitScanStats", () => {
  it("a clean trial scan: +1 label, +1 free scan, +1 clean", () => {
    const read = withStats();
    commitScanStats(clean, false);
    expect(read()).toMatchObject({ totalLabelsRead: 1, freeScansUsed: 1, totalCleanScans: 1 });
  });

  it("a flagged trial scan: +1 label, +1 free scan, +N red flags", () => {
    const read = withStats();
    commitScanStats(flagged(3), false);
    expect(read()).toMatchObject({ totalLabelsRead: 1, freeScansUsed: 1, totalRedFlagsCaught: 3 });
    expect(read().totalCleanScans).toBe(0);
  });

  it("premium never increments freeScansUsed", () => {
    const read = withStats({ freeScansUsed: 4 });
    commitScanStats(clean, true);
    expect(read().freeScansUsed).toBe(4);
    expect(read().totalLabelsRead).toBe(1);
  });

  it("freeScansUsed caps at 10", () => {
    const read = withStats({ freeScansUsed: 10 });
    commitScanStats(clean, false);
    expect(read().freeScansUsed).toBe(10);
  });
});

describe("evaluateScan — illegible abort does not touch stats", () => {
  it("gibberish → aborted:illegible", () => {
    const e = evaluateScan("x y z qwable", emptyProfile);
    expect(e.status).toBe("aborted");
    expect(repo.saveStats).not.toHaveBeenCalled();
  });

  it("a comma-dense capture → result (clean, no active filters)", () => {
    const e = evaluateScan(
      "water, skim milk, cheddar cheese, vegetable oil, corn starch, salt",
      emptyProfile
    );
    expect(e.status).toBe("result");
  });
});

describe("commitRecheckStats", () => {
  const diff = (over: Partial<DiffResult> = {}): DiffResult => ({
    added: [],
    removed: [],
    orderShifted: false,
    changed: true,
    ...over,
  });

  it("identical: +1 label, +1 free scan, no change counters", () => {
    const read = withStats();
    commitRecheckStats({ kind: "identical" }, false);
    expect(read()).toMatchObject({
      totalLabelsRead: 1,
      freeScansUsed: 1,
      totalReformulationsCaught: 0,
      totalSkimpflationCaught: 0,
    });
  });

  it("reformulation (add/remove): +1 reformulations", () => {
    const read = withStats();
    commitRecheckStats({ kind: "changed_safe", diff: diff({ added: ["red 40"], changed: true }) }, false);
    expect(read().totalReformulationsCaught).toBe(1);
    expect(read().totalSkimpflationCaught).toBe(0);
  });

  it("order shift only: +1 skimpflation", () => {
    const read = withStats();
    commitRecheckStats({ kind: "changed_safe", diff: diff({ orderShifted: true, changed: true }) }, false);
    expect(read().totalSkimpflationCaught).toBe(1);
    expect(read().totalReformulationsCaught).toBe(0);
  });

  it("both at once: +1 each", () => {
    const read = withStats();
    commitRecheckStats(
      { kind: "changed_safe", diff: diff({ added: ["x"], orderShifted: true, changed: true }) },
      false
    );
    expect(read().totalReformulationsCaught).toBe(1);
    expect(read().totalSkimpflationCaught).toBe(1);
  });

  it("changed_flagged also adds red flags", () => {
    const read = withStats();
    commitRecheckStats(
      {
        kind: "changed_flagged",
        diff: diff({ added: ["red 40"], changed: true }),
        matches: [{ token: "red 40", term: "red 40", kind: "exact", score: 1 }],
      },
      false
    );
    expect(read().totalRedFlagsCaught).toBe(1);
    expect(read().totalReformulationsCaught).toBe(1);
  });

  it("premium recheck: label counts, free scan does not", () => {
    const read = withStats({ freeScansUsed: 2 });
    commitRecheckStats({ kind: "identical" }, true);
    expect(read().freeScansUsed).toBe(2);
    expect(read().totalLabelsRead).toBe(1);
  });
});
