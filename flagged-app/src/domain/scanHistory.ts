import type { ScanHistoryEntry } from "./types";

/**
 * Wording for a Pantry item's scan history (docs/03 §3.2b, docs/05). Pure, so it's unit-tested.
 * Wording rule (CLAUDE.md): never a safety claim — a scan reports whether red flags were found.
 */

/** "1 scan", "2 scans" — the running total on the item screen. The save itself counts as the first
 * scan (it was scanned clean before it could be saved). */
export function scanCountLabel(count: number): string {
  return `${count} ${count === 1 ? "scan" : "scans"}`;
}

/** The line under an entry's date on the history screen, and whether it's shown as neutral/positive
 * (cyan) or as a flag (red). */
export function scanEntryLabel(entry: Pick<ScanHistoryEntry, "kind" | "outcome">): {
  text: string;
  tone: "cyan" | "red";
} {
  if (entry.kind === "saved") return { text: "Saved to Pantry", tone: "cyan" };
  if (entry.outcome === "flagged") return { text: "Rescanned — red flags found", tone: "red" };
  return { text: "Rescanned — no red flags found", tone: "cyan" };
}
