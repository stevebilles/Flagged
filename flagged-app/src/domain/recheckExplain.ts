import type { AttributedMatch } from "./recheckEngine";

/**
 * Plain-language explanations for a flagged Pantry recheck (docs/07 §7.1) — WHY a red flag is
 * showing up now, with the exact dates and times: when the item was saved, and (when the change
 * log has it) when the user changed their red flags. Pure, so it's unit-tested.
 *
 * Wording rule (CLAUDE.md "Hard rules"): a clean earlier scan only means nothing matched the
 * user's filters in the text it read — it can miss things — so a "reformulation" is never stated
 * as fact; the message says the recipe MAY have changed, or the earlier scan missed it.
 */

/** "Sep 25, 2026, 10:47 AM" — the user's locale, with the time, since two edits can be on one day. */
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "9:18 AM" — the time of day only, in the user's locale. */
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Aug 14, 2026" — the date only, in the user's locale. */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "Today" for the current calendar day, otherwise "Aug 14, 2026" — for the compact date fields on
 * the clean recheck screen. (The exact time is still stored; the flagged screen shows it.) */
export function formatDayOrToday(ms: number, nowMs: number = Date.now()): string {
  const d = new Date(ms);
  const n = new Date(nowMs);
  const sameDay =
    d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? "Today" : formatDate(ms);
}

/**
 * The short footer of the flagged rescan's "Why is this flagging now?" card (owner's mockups,
 * 2026-09-25). The pills above it already SHOW what changed, so this stays to one line — an earlier
 * version spelled out every filter change with its exact time and was cut as too much text. When the
 * profile changed, `source` picks the honest wording: "Probably not a reformulation" is only said when
 * EVERY flag comes from a filter the user added. "Likely"/"probably" on purpose: a scan can't prove a
 * recipe changed (or that an earlier scan missed nothing).
 */
export function flaggedFooter(sameFilters: boolean, source: FlagSource = "product"): string {
  if (sameFilters) return "Same red flag set — this is likely a product reformulation.";
  if (source === "profile") return "Red flags triggered by your updated profile. Probably not a product reformulation.";
  if (source === "mixed") return "Some red flags come from your updated profile; the rest are likely a product reformulation.";
  return "Your profile was updated, but these flags come from filters you already had — likely a product reformulation.";
}

/** Where a flagged rescan's flags come from, judged from each match's attribution: all from filters
 * the user ADDED since the item was last checked ("profile"), none of them ("product" — the flag is
 * from a filter that was already on), or a mix. Decides which footer is honest when the profile changed. */
export type FlagSource = "profile" | "product" | "mixed";

export function flagSource(matches: readonly Pick<AttributedMatch, "attribution">[]): FlagSource {
  const fromProfile = matches.filter((m) => m.attribution.kind === "profile_change").length;
  if (fromProfile === 0) return "product";
  return fromProfile === matches.length ? "profile" : "mixed";
}

export interface ExplainContext {
  /** When the item's filters were recorded — `PantryItem.snapshotAt`. */
  savedAt: number;
  /** When the profile change that explains this match was made (epoch ms), or null when the change
   * log has no entry for it (e.g. an edit from before change logging existed). */
  changeAt: number | null;
  /** True when `savedAt` is the time of the item's last recheck (a clean rescan, or "Keep Item" —
   * either re-records its filters), not the original save — so the wording says "last checked"
   * instead of "saved". (The field keeps its old name, `kept`.) */
  kept?: boolean;
}

function display(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

export function explainMatch(m: AttributedMatch, ctx: ExplainContext): string {
  const saved = formatDateTime(ctx.savedAt);
  const did = ctx.kept ? "last checked" : "saved";
  const a = m.attribution;

  if (a.kind === "reformulation") {
    return (
      `Not flagged when you ${did} this on ${saved}, even though you were already watching for it. ` +
      `The recipe may have changed — or the earlier scan missed it. Check the label.`
    );
  }

  const when = ctx.changeAt !== null ? formatDateTime(ctx.changeAt) : null;
  switch (a.cause) {
    case "category_added": {
      const filter = m.categoryName ?? "this filter";
      return when
        ? `You added ${filter} to your red flags on ${when}, after you ${did} this on ${saved}. That's why it's flagging now.`
        : `${filter} wasn't on your red flags when you ${did} this on ${saved}. It has been added since, which is why it's flagging now.`;
    }
    case "ingredient_included": {
      const name = display(m.term);
      return when
        ? `You stopped excluding ${name} on ${when}, after you ${did} this on ${saved}. That's why it's flagging now.`
        : `You had ${name} excluded when you ${did} this on ${saved}. It has been turned back on since, which is why it's flagging now.`;
    }
    case "custom_added": {
      const name = display(m.term);
      return when
        ? `You added "${name}" to your custom red flags on ${when}, after you ${did} this on ${saved}. That's why it's flagging now.`
        : `"${name}" wasn't one of your custom red flags when you ${did} this on ${saved}. It has been added since, which is why it's flagging now.`;
    }
  }
}
