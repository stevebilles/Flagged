/**
 * Per-profile avatar color + initials (Figma mockups, docs/17).
 *
 * Colors are assigned by a profile's position among all profiles (creation
 * order, same order getProfiles() returns), not hashed from its id — a hash
 * mod palette-length can put two different profiles on the same color even
 * with just two profiles in the house, which defeats the point of a color
 * cue. Position-based assignment guarantees every profile gets its own color
 * for as long as there are fewer profiles than palette entries. The palette
 * itself is spread evenly around the hue wheel so no two entries read as
 * "close" to each other.
 */

const PALETTE = [
  "#F87171", // red
  "#F59E0B", // amber
  "#A3E635", // lime
  "#34D399", // green
  "#22D3EE", // cyan
  "#60A5FA", // blue
  "#A78BFA", // purple
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
