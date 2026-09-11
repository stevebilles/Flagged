/**
 * Deterministic per-profile avatar color + initials (Figma mockups, docs/17).
 * Derived from the profileId — no DB column, no migration, stable across renders.
 */

const PALETTE = ["#22D3EE", "#A78BFA", "#34D399", "#F59E0B", "#F472B6", "#60A5FA"] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Stable color for a profile, picked from a small fixed palette by id hash. */
export function profileColor(profileId: string): string {
  return PALETTE[hashString(profileId) % PALETTE.length];
}

/** Up to 2 initials from a profile's name ("Sofia" -> "SF", "Mary Jane" -> "MJ"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
