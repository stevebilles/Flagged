/**
 * Dev-only scan tracing.
 *
 * Prints one compact, greppable block per scan to the Metro console (the terminal
 * running `npx expo start`) so the raw OCR text, the filtered ingredient list,
 * and the match verdict can be inspected without screenshotting the phone.
 *
 * No-op unless `__DEV__`, so it is stripped from production builds.
 * Grep the terminal for `SCAN [` to find these.
 */
/**
 * "Where did that red flag come from?" — one line per match: the dictionary term, the exact word in the
 * scanned text that matched it (how — exact or fuzzy — and its score) and ~30 characters either side of
 * it. Used in the dev log's verdict so a surprising flag can be traced to the words that caused it.
 */
export function describeMatches(
  text: string,
  matches: readonly { term: string; token: string; kind: string; score: number; categoryName?: string }[]
): string {
  if (matches.length === 0) return "no matches";
  return matches
    .map((m) => {
      const at = text.toLowerCase().indexOf(m.token.toLowerCase());
      const around =
        at >= 0 ? `…${text.slice(Math.max(0, at - 30), at + m.token.length + 30).replace(/\s+/g, " ")}…` : "(not found in text)";
      return `\n  - ${m.term}${m.categoryName ? ` [${m.categoryName}]` : ""} ← "${m.token}" (${m.kind}, ${m.score.toFixed(2)}) ${around}`;
    })
    .join("");
}

export function logScanDebug(
  source: "camera" | "paste" | "photo" | "recheck",
  raw: string,
  filtered: string,
  verdict: string
): void {
  if (!__DEV__) return;
  // Long enough for a whole ingredient list (600 used to cut off the end — where a surprise match
  // often hides). Dev-only, so the length costs nothing in a release build.
  const clip = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n)}… (+${s.length - n})` : s);
  // eslint-disable-next-line no-console
  console.log(
    `\n━━━ SCAN [${source}] ${new Date().toLocaleTimeString()} ━━━\n` +
      `raw:      ${JSON.stringify(clip(raw))}\n` +
      `filtered: ${JSON.stringify(clip(filtered))}\n` +
      `result:   ${verdict}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}
