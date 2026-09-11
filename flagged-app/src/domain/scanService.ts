import { matchParagraph, Match, ScanResult } from "../matching/matcher";
import { looksLikeIngredientList } from "../matching/normalize";
import { effectiveRedFlagMeta, effectiveRedFlagMetaForAll, RedFlagMeta, AllProfilesMeta } from "./activation";
import type { RecheckOutcome } from "./diffEngine";
import { getCategories, getIngredientTermMap, getStats, saveStats, updateProfile } from "../db/repositories";
import { FREE_SCAN_LIMIT, type Profile } from "./types";

/**
 * Orchestrates a scan (docs/06/07/08).
 *  - validates the capture
 *  - matches against the active profile's (or, in "All" mode, every profile's
 *    combined) effective red-flag set
 *  - attributes each match to the filter — and, in "All" mode, the person —
 *    that caught it (docs/07 breakdown)
 *  - updates stats ONLY on a successful scan that routes to a result
 */

export type ScanEvaluation =
  | { status: "aborted"; reason: "illegible" } // does NOT consume a free scan
  | { status: "result"; result: ScanResult };

/** Attach the catching filter's name/classification (and, in "All" mode, whose
 * filter it was) to each match (docs/07 breakdown card). */
export function attributeMatches(
  matches: Match[],
  meta: Map<string, RedFlagMeta> | Map<string, AllProfilesMeta>
): Match[] {
  return matches.map((m) => {
    const found = meta.get(m.term);
    return {
      ...m,
      categoryName: m.categoryName ?? found?.categoryName,
      classification: m.classification ?? found?.classification,
      profileNames: m.profileNames ?? (found as AllProfilesMeta | undefined)?.profileNames,
    };
  });
}

/** Evaluate a captured paragraph for a single profile. Pure (no stats writes). */
export function evaluateScan(rawParagraph: string, profile: Profile): ScanEvaluation {
  const meta = effectiveRedFlagMeta(profile, getCategories(), getIngredientTermMap());
  return runEvaluation(rawParagraph, meta);
}

/**
 * Evaluate a captured paragraph against every profile's combined filters at
 * once (docs/17 "All" mode) — one scan checks everyone's Red Flags in one
 * pass. Each match names which profile(s) it came from.
 */
export function evaluateScanForAll(rawParagraph: string, profiles: Profile[]): ScanEvaluation {
  const meta = effectiveRedFlagMetaForAll(profiles, getCategories(), getIngredientTermMap());
  return runEvaluation(rawParagraph, meta);
}

function runEvaluation(
  rawParagraph: string,
  meta: Map<string, RedFlagMeta> | Map<string, AllProfilesMeta>
): ScanEvaluation {
  const result = matchParagraph(rawParagraph, [...meta.keys()]);
  // A match means it's unambiguously a label. Otherwise fall back to the
  // heuristic — a garbled header shouldn't discard an otherwise-clean scan.
  if (result.matches.length === 0 && !looksLikeIngredientList(rawParagraph)) {
    return { status: "aborted", reason: "illegible" };
  }
  return {
    status: "result",
    result: { ...result, matches: attributeMatches(result.matches, meta) },
  };
}

/**
 * Consume one credit from the shared, account-wide trial pool (docs/08). This
 * stays a singleton on purpose — the free-scan limit does NOT multiply with
 * the number of profiles, even for an "All profiles" scan (one scan = one
 * credit, regardless of how many profiles it checked).
 */
function bumpTrialCounter(isPremium: boolean): void {
  if (isPremium) return;
  const stats = getStats();
  stats.freeScansUsed = Math.min(FREE_SCAN_LIMIT, stats.freeScansUsed + 1);
  saveStats(stats);
}

/**
 * Commit stats for a successful single-profile scan (docs/03/08, docs/17).
 * The Scans/Clean/Flags counters shown on that profile's Home dashboard now
 * live on the profile itself — only the shared trial counter is account-wide.
 */
export function commitScanStats(result: ScanResult, profile: Profile, isPremium: boolean): void {
  bumpTrialCounter(isPremium);
  const updated: Profile = { ...profile, totalLabelsRead: profile.totalLabelsRead + 1 };
  if (result.isClean) {
    updated.totalCleanScans += 1;
  } else {
    updated.totalRedFlagsCaught += result.matches.length;
  }
  updateProfile(updated);
}

/**
 * Commit stats for an "All profiles" scan (docs/17): the trial counter moves
 * once, and EVERY real profile gets its own Scans/Clean/Flags counters
 * updated based on whether that specific profile's filters were among the
 * matches — not whether the combined result was clean overall. A label that
 * flags Sofia's dye filter but nothing of Steve's is a "clean" scan on
 * Steve's dashboard and a "flagged" one on Sofia's.
 */
export function commitScanStatsForAll(result: ScanResult, profiles: Profile[], isPremium: boolean): void {
  bumpTrialCounter(isPremium);
  for (const profile of profiles) {
    const mine = result.matches.filter((m) => m.profileNames?.includes(profile.name));
    const updated: Profile = { ...profile, totalLabelsRead: profile.totalLabelsRead + 1 };
    if (mine.length === 0) {
      updated.totalCleanScans += 1;
    } else {
      updated.totalRedFlagsCaught += mine.length;
    }
    updateProfile(updated);
  }
}

/**
 * Commit stats for a completed pantry recheck (docs/03/07) — recheck stays
 * tied to a single profile (docs/17 scoped "All" to Home/Scan/Results only).
 * A recheck is always a label read, and consumes a trial credit when not
 * premium. The two recheck-specific counters only move when the recipe
 * actually changed; both can move on one recheck.
 */
export function commitRecheckStats(outcome: RecheckOutcome, profile: Profile, isPremium: boolean): void {
  bumpTrialCounter(isPremium);
  const updated: Profile = { ...profile, totalLabelsRead: profile.totalLabelsRead + 1 };
  if (outcome.kind !== "identical") {
    const { diff } = outcome;
    if (diff.added.length > 0 || diff.removed.length > 0) {
      updated.totalReformulationsCaught += 1;
    }
    if (diff.orderShifted) {
      updated.totalSkimpflationCaught += 1;
    }
    if (outcome.kind === "changed_flagged") {
      updated.totalRedFlagsCaught += outcome.matches.length;
    }
  }
  updateProfile(updated);
}

/** Trial/paywall gate (docs/08). */
export function canScan(isPremium: boolean): boolean {
  if (isPremium) return true;
  return getStats().freeScansUsed < FREE_SCAN_LIMIT;
}

export function scansRemaining(): number {
  return Math.max(0, FREE_SCAN_LIMIT - getStats().freeScansUsed);
}
