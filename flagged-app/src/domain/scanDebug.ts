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
export function logScanDebug(
  source: "camera" | "paste" | "photo" | "recheck",
  raw: string,
  filtered: string,
  verdict: string
): void {
  if (!__DEV__) return;
  const clip = (s: string, n = 600) => (s.length > n ? `${s.slice(0, n)}… (+${s.length - n})` : s);
  // eslint-disable-next-line no-console
  console.log(
    `\n━━━ SCAN [${source}] ${new Date().toLocaleTimeString()} ━━━\n` +
      `raw:      ${JSON.stringify(clip(raw))}\n` +
      `filtered: ${JSON.stringify(clip(filtered))}\n` +
      `result:   ${verdict}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}
