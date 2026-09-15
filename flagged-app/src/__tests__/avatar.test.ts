import { profileColor } from "../design/avatar";
import { DarkColors, LightColors } from "../design/theme";

/**
 * Locks in the constraint from the results-screen profile-color feature
 * (2026-09-14, docs/09): no profile color may read as "the same color" as
 * the Results screen's FLAGGED (red) or CLEAN (cyan) state in either color
 * mode — otherwise a profile's own name-color could blend into (or be
 * mistaken for) the verdict itself. Checked by hue distance rather than
 * exact hex match, since a near-miss (a slightly different red) is just as
 * confusing as an exact one.
 */

function hexToHue(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0; // grayscale — no hue to collide with
  let hue: number;
  switch (max) {
    case r:
      hue = ((g - b) / d) % 6;
      break;
    case g:
      hue = (b - r) / d + 2;
      break;
    default:
      hue = (r - g) / d + 4;
  }
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// How close (in hue degrees) is "close enough to read as the same color" —
// tuned to the actual palette entries, which sit at least ~28° from both
// danger zones (see avatar.ts) but genuinely different colors (blue vs
// cyan, pink vs red) are usually distinguished by non-experts past ~20-25°.
const MIN_SAFE_HUE_DISTANCE = 20;

describe("profile palette never collides with the Results screen's red/cyan (docs/09)", () => {
  const dangerHues = [
    ["dark red", hexToHue(DarkColors.red)],
    ["dark cyan", hexToHue(DarkColors.cyan)],
    ["light red", hexToHue(LightColors.red)],
    ["light cyan", hexToHue(LightColors.cyan)],
  ] as const;

  it("every palette entry stays a safe hue distance from every red/cyan variant", () => {
    for (let i = 0; i < 8; i++) {
      const color = profileColor(i);
      const hue = hexToHue(color);
      for (const [label, dangerHue] of dangerHues) {
        const dist = hueDistance(hue, dangerHue);
        if (dist < MIN_SAFE_HUE_DISTANCE) {
          throw new Error(
            `Palette index ${i} (${color}, hue ${hue.toFixed(0)}°) is only ${dist.toFixed(0)}° from ` +
              `${label} (hue ${dangerHue.toFixed(0)}°) — too close, would read as the same color on the ` +
              `Results screen. Pick a hue at least ${MIN_SAFE_HUE_DISTANCE}° away from all four red/cyan variants.`
          );
        }
      }
    }
  });
});
