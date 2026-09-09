import { matchParagraph, Match, ScanResult } from "../matching/matcher";
import { looksLikeIngredientList } from "../matching/normalize";
import { effectiveRedFlagMeta, RedFlagMeta } from "./activation";
import type { RecheckOutcome } from "./diffEngine";
import { getCategories, getIngredientTermMap, getStats, saveStats } from "../db/repositories";
import { FREE_SCAN_LIMIT, type Profile } from "./types";

/**
 * Orchestrates a scan (docs/06/07/08).
 *  - validates the capture
 *  - matches against the active profile's effective red-flag set
 *  - attributes each match to the filter that caught it (docs/07 breakdown)
 *  - updates stats ONLY on a successful scan that routes to a result
 */

export type ScanEvaluation =
  | { status: "aborted"; reason: "illegible" } // does NOT consume a free scan
  | { status: "result"; result: ScanResult };

/** Attach the catching filter's name to each match (docs/07 breakdown card). */
export function attributeMatches(matches: Match[], meta: Map<string, RedFlagMeta>): Match[] {
  return matches.map((m) => ({
    ...m,
    categoryName: m.categoryName ?? meta.get(m.term)?.categoryName,
  }));
}

/** Evaluate a captured paragraph for a profile. Pure (no stats writes). */
export function evaluateScan(rawParagraph: string, profile: Profile): ScanEvaluation {
  const meta = effectiveRedFlagMeta(profile, getCategories(), getIngredientTermMap());
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
 * Commit stats for a successful scan (docs/03/08).
 * Increments freeScansUsed (unless premium) + totalLabelsRead, and the
 * clean/flagged counters.
 */
export function commitScanStats(result: ScanResult, isPremium: boolean): void {
  const stats = getStats();
  stats.totalLabelsRead += 1;
  if (!isPremium) {
    stats.freeScansUsed = Math.min(FREE_SCAN_LIMIT, stats.freeScansUsed + 1);
  }
  if (result.isClean) {
    stats.totalCleanScans += 1;
  } else {
    stats.totalRedFlagsCaught += result.matches.length;
  }
  saveStats(stats);
}

/**
 * Commit stats for a completed pantry recheck (docs/03/07).
 * A recheck is a successful scan → always a label read, and consumes a free
 * scan when not premium. The two recheck-specific counters only move when the
 * recipe actually changed; both can move on one recheck.
 */
export function commitRecheckStats(outcome: RecheckOutcome, isPremium: boolean): void {
  const stats = getStats();
  stats.totalLabelsRead += 1;
  if (!isPremium) {
    stats.freeScansUsed = Math.min(FREE_SCAN_LIMIT, stats.freeScansUsed + 1);
  }
  if (outcome.kind !== "identical") {
    const { diff } = outcome;
    if (diff.added.length > 0 || diff.removed.length > 0) {
      stats.totalReformulationsCaught += 1;
    }
    if (diff.orderShifted) {
      stats.totalSkimpflationCaught += 1;
    }
    if (outcome.kind === "changed_flagged") {
      stats.totalRedFlagsCaught += outcome.matches.length;
    }
  }
  saveStats(stats);
}

/** Trial/paywall gate (docs/08). */
export function canScan(isPremium: boolean): boolean {
  if (isPremium) return true;
  return getStats().freeScansUsed < FREE_SCAN_LIMIT;
}

export function scansRemaining(): number {
  return Math.max(0, FREE_SCAN_LIMIT - getStats().freeScansUsed);
}
