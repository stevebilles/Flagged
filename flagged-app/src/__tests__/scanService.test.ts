/**
 * Trial gate + scan/recheck stats math (docs/03/06/08).
 * Constitution II & V: this accounting must be covered — a mis-count either
 * charges a user for a scan they didn't get, or gives away scans for free.
 *
 * `src/db/repositories` is mocked so these stay pure (it pulls in expo-sqlite).
 */
import * as repo from "../db/repositories";
import {
  canScan,
  scansRemaining,
  commitScanStats,
  commitScanStatsForAll,
  commitRecheckStats,
  evaluateScan,
  evaluateScanForAll,
} from "../domain/scanService";
import type { Stats, Profile, Category } from "../domain/types";
import type { ScanResult, Match } from "../matching/matcher";
import type { RecheckOutcome, AttributedMatch, MatchAttribution } from "../domain/recheckEngine";

jest.mock("../db/repositories", () => ({
  getCategories: jest.fn(() => []),
  getIngredientTermMap: jest.fn(() => new Map<string, string>()),
  getStats: jest.fn(),
  saveStats: jest.fn(),
  updateProfile: jest.fn(),
}));

const zeroStats = (): Stats => ({
  statsId: "s1",
  freeScansUsed: 0,
  totalLabelsRead: 0,
  totalRedFlagsCaught: 0,
  totalCleanScans: 0,
  totalReformulationsCaught: 0,
});

/** Wire getStats/saveStats to a mutable in-memory row (the shared trial counter). */
function withStats(initial: Partial<Stats> = {}) {
  let row: Stats = { ...zeroStats(), ...initial };
  (repo.getStats as jest.Mock).mockImplementation(() => ({ ...row }));
  (repo.saveStats as jest.Mock).mockImplementation((s: Stats) => {
    row = { ...s };
  });
  return () => row;
}

/** The Profile object(s) passed to updateProfile — the per-profile counters
 * (docs/17) are committed by calling updateProfile with the whole updated row. */
function lastUpdatedProfile(): Profile {
  const calls = (repo.updateProfile as jest.Mock).mock.calls;
  return calls[calls.length - 1][0];
}
function allUpdatedProfiles(): Profile[] {
  return (repo.updateProfile as jest.Mock).mock.calls.map((c) => c[0] as Profile);
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
  totalLabelsRead: 0,
  totalRedFlagsCaught: 0,
  totalCleanScans: 0,
  totalReformulationsCaught: 0,
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
  it("a clean trial scan: +1 shared free scan, +1 label and +1 clean on the profile", () => {
    const readStats = withStats();
    commitScanStats(clean, emptyProfile, false);
    expect(readStats().freeScansUsed).toBe(1);
    expect(lastUpdatedProfile()).toMatchObject({ totalLabelsRead: 1, totalCleanScans: 1 });
  });

  it("a flagged trial scan: +1 shared free scan, +N red flags on the profile", () => {
    const readStats = withStats();
    commitScanStats(flagged(3), emptyProfile, false);
    expect(readStats().freeScansUsed).toBe(1);
    const p = lastUpdatedProfile();
    expect(p.totalLabelsRead).toBe(1);
    expect(p.totalRedFlagsCaught).toBe(3);
    expect(p.totalCleanScans).toBe(0);
  });

  it("premium never increments the shared trial counter; the profile still updates", () => {
    const readStats = withStats({ freeScansUsed: 4 });
    commitScanStats(clean, emptyProfile, true);
    expect(readStats().freeScansUsed).toBe(4);
    expect(lastUpdatedProfile().totalLabelsRead).toBe(1);
  });

  it("the shared freeScansUsed caps at 10", () => {
    const readStats = withStats({ freeScansUsed: 10 });
    commitScanStats(clean, emptyProfile, false);
    expect(readStats().freeScansUsed).toBe(10);
  });

  it("doesn't touch other profiles — each accumulates independently across calls", () => {
    withStats();
    commitScanStats(clean, emptyProfile, false);
    commitScanStats(flagged(2), { ...emptyProfile, profileId: "p2", name: "y" }, false);
    const [p1, p2] = allUpdatedProfiles();
    expect(p1.profileId).toBe("p");
    expect(p1.totalCleanScans).toBe(1);
    expect(p2.profileId).toBe("p2");
    expect(p2.totalRedFlagsCaught).toBe(2);
  });
});

describe("commitScanStatsForAll (docs/17 'All' mode)", () => {
  const sofia: Profile = { ...emptyProfile, profileId: "sofia", name: "Sofia" };
  const steve: Profile = { ...emptyProfile, profileId: "steve", name: "Steve" };

  it("consumes exactly ONE shared trial credit no matter how many profiles", () => {
    const readStats = withStats();
    commitScanStatsForAll(clean, [sofia, steve], false);
    expect(readStats().freeScansUsed).toBe(1);
  });

  it("a clean result marks every profile clean", () => {
    withStats();
    commitScanStatsForAll(clean, [sofia, steve], false);
    for (const p of allUpdatedProfiles()) {
      expect(p.totalLabelsRead).toBe(1);
      expect(p.totalCleanScans).toBe(1);
      expect(p.totalRedFlagsCaught).toBe(0);
    }
  });

  it("a match attributed only to Sofia flags Sofia but leaves Steve clean", () => {
    withStats();
    const result: ScanResult = {
      tokens: [],
      isClean: false,
      matches: [{ token: "milk", term: "milk", kind: "exact", score: 1, profileNames: ["Sofia"] }],
    };
    commitScanStatsForAll(result, [sofia, steve], false);
    const updatedSofia = allUpdatedProfiles().find((p) => p.profileId === "sofia")!;
    const updatedSteve = allUpdatedProfiles().find((p) => p.profileId === "steve")!;
    expect(updatedSofia.totalRedFlagsCaught).toBe(1);
    expect(updatedSofia.totalCleanScans).toBe(0);
    expect(updatedSteve.totalRedFlagsCaught).toBe(0);
    expect(updatedSteve.totalCleanScans).toBe(1);
    // both still count the scan itself as a label read
    expect(updatedSofia.totalLabelsRead).toBe(1);
    expect(updatedSteve.totalLabelsRead).toBe(1);
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

describe("evaluateScanForAll (docs/17 'All' mode)", () => {
  const categories: Category[] = [
    { id: "milk", name: "Milk", parentGroup: "Allergens", classification: "regulated", ingredientIds: ["i-milk"] },
    { id: "nuts", name: "Tree Nuts", parentGroup: "Allergens", classification: "regulated", ingredientIds: ["i-almond"] },
  ];
  const termById = new Map([
    ["i-milk", "milk"],
    ["i-almond", "almond"],
  ]);
  const sofia: Profile = { ...emptyProfile, profileId: "sofia", name: "Sofia", activeCategoryIds: ["milk"] };
  const steve: Profile = { ...emptyProfile, profileId: "steve", name: "Steve", activeCategoryIds: ["nuts"] };

  it("catches a match against any single profile's filters and names whose it was", () => {
    (repo.getCategories as jest.Mock).mockReturnValueOnce(categories);
    (repo.getIngredientTermMap as jest.Mock).mockReturnValueOnce(termById);
    const e = evaluateScanForAll("Ingredients: water, milk, salt", [sofia, steve]);
    expect(e.status).toBe("result");
    if (e.status !== "result") return;
    expect(e.result.isClean).toBe(false);
    const m = e.result.matches.find((mm) => mm.term === "milk");
    expect(m?.profileNames).toEqual(["Sofia"]);
    expect(m?.categoryName).toBe("Milk");
  });

  it("clean when nothing matches any profile's filters", () => {
    (repo.getCategories as jest.Mock).mockReturnValueOnce(categories);
    (repo.getIngredientTermMap as jest.Mock).mockReturnValueOnce(termById);
    const e = evaluateScanForAll("Ingredients: water, sugar, salt", [sofia, steve]);
    expect(e.status).toBe("result");
    if (e.status === "result") expect(e.result.isClean).toBe(true);
  });
});

describe("commitRecheckStats (docs/07 §7.1, redesigned 2026-09-14 — profile-snapshot comparison, no ingredient-order data)", () => {
  const attributedMatch = (attribution: MatchAttribution, over: Partial<Match> = {}): AttributedMatch => ({
    token: "red 40",
    term: "red 40",
    kind: "exact",
    score: 1,
    attribution,
    ...over,
  });

  it("identical: +1 shared free scan, +1 label on the profile, no reformulation", () => {
    const readStats = withStats();
    commitRecheckStats({ kind: "identical" }, emptyProfile, false);
    expect(readStats().freeScansUsed).toBe(1);
    const p = lastUpdatedProfile();
    expect(p.totalLabelsRead).toBe(1);
    expect(p.totalReformulationsCaught).toBe(0);
    expect(p.totalRedFlagsCaught).toBe(0);
  });

  it("changed_flagged with a reformulation-attributed match: +1 reformulations, red flags added", () => {
    withStats();
    const outcome: RecheckOutcome = { kind: "changed_flagged", matches: [attributedMatch({ kind: "reformulation" })] };
    commitRecheckStats(outcome, emptyProfile, false);
    const p = lastUpdatedProfile();
    expect(p.totalRedFlagsCaught).toBe(1);
    expect(p.totalReformulationsCaught).toBe(1);
  });

  it("changed_flagged with ONLY a profile-change-attributed match: red flags added, but NOT counted as a reformulation", () => {
    // A filter the user just turned on catching an unrelated, unchanged
    // product isn't evidence the product itself changed (docs/07 §7.1).
    withStats();
    const outcome: RecheckOutcome = { kind: "changed_flagged", matches: [attributedMatch({ kind: "profile_change" })] };
    commitRecheckStats(outcome, emptyProfile, false);
    const p = lastUpdatedProfile();
    expect(p.totalRedFlagsCaught).toBe(1);
    expect(p.totalReformulationsCaught).toBe(0);
  });

  it("mixed matches: reformulation counter moves once if ANY match is a reformulation", () => {
    withStats();
    const outcome: RecheckOutcome = {
      kind: "changed_flagged",
      matches: [
        attributedMatch({ kind: "profile_change" }, { term: "msg" }),
        attributedMatch({ kind: "reformulation" }, { term: "red 40" }),
      ],
    };
    commitRecheckStats(outcome, emptyProfile, false);
    const p = lastUpdatedProfile();
    expect(p.totalRedFlagsCaught).toBe(2);
    expect(p.totalReformulationsCaught).toBe(1);
  });

  it("premium recheck: profile label count still moves, shared free scan does not", () => {
    const readStats = withStats({ freeScansUsed: 2 });
    commitRecheckStats({ kind: "identical" }, emptyProfile, true);
    expect(readStats().freeScansUsed).toBe(2);
    expect(lastUpdatedProfile().totalLabelsRead).toBe(1);
  });
});
