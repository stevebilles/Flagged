/**
 * Per-profile avatar color + initials (Figma mockups, docs/17).
 *
 * Colors are assigned by a profile's position among all profiles (creation
 * order, same order getProfiles() returns), not hashed from its id — a hash
 * mod palette-length can put two different profiles on the same color even
 * with just two profiles in the house, which defeats the point of a color
 * cue. Position-based assignment guarantees every profile gets its own color
 * for as long as there are fewer profiles than palette entries.
 *
 * Deliberately contains NO red-family or cyan-family hue (2026-09-14): the
 * Results screen's FLAGGED and CLEAN states are red and cyan respectively
 * (docs/09), and this palette is used to color that same screen's "for
 * {name}" text by profile — the original palette's "red" (#F87171) and
 * "cyan" (#22D3EE, an EXACT hex match to the dark-mode Clean color) would
 * have made some profile's name literally unreadable-from-state on their
 * own results. Every entry here stays outside both hue ranges in both
 * color modes (hue doesn't shift between light/dark, only lightness does).
 */

const PALETTE = [
  "#F59E0B", // amber
  "#A3E635", // lime
  "#4ADE80", // green
  "#34D399", // emerald
  "#818CF8", // indigo
  "#A78BFA", // violet
  "#E879F9", // fuchsia
  "#F472B6", // pink
] as const;

/** Color for the profile at this position in the household's profile list. */
export function profileColor(index: number): string {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/** Up to 2 initials from a profile's name ("Sofia" -> "SF", "Mary Jane" -> "MJ"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
