/**
 * Design tokens — dynamic dark/light color system.
 * Source: docs/09-design-system.md. No single hex is shared between modes.
 */

export type ColorScheme = "dark" | "light";

export interface ThemeColors {
  canvas: string;
  card: string;
  textPrimary: string;
  textMuted: string;
  cyan: string; // safe / scanning affordance
  red: string; // flagged / destructive
  warning: string; // "Recipe Change Detected" (still-approved) recheck screen
  // classification badge tints (docs/09)
  badgeRegulated: string;
  badgeAdvisory: string;
  badgePreference: string;
  cardShadow: string;
}

export const DarkColors: ThemeColors = {
  canvas: "#111827",
  card: "#1F2937",
  textPrimary: "#F9FAFB",
  textMuted: "#9CA3AF",
  cyan: "#22D3EE",
  red: "#EF4444",
  warning: "#F59E0B",
  badgeRegulated: "#EF4444",
  badgeAdvisory: "#F59E0B",
  badgePreference: "#9CA3AF",
  cardShadow: "transparent",
};

export const LightColors: ThemeColors = {
  canvas: "#F1F5F9",
  card: "#FFFFFF",
  textPrimary: "#0F172A",
  textMuted: "#475569",
  cyan: "#0E7490",
  red: "#B91C1C",
  warning: "#B45309",
  badgeRegulated: "#B91C1C",
  badgeAdvisory: "#B45309",
  badgePreference: "#475569",
  cardShadow: "rgba(15, 23, 42, 0.12)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/** Atkinson Hyperlegible — used exclusively (docs/09). */
export const fontFamily = {
  regular: "AtkinsonHyperlegible-Regular",
  bold: "AtkinsonHyperlegible-Bold",
  italic: "AtkinsonHyperlegible-Italic",
  boldItalic: "AtkinsonHyperlegible-BoldItalic",
} as const;

export const fontSize = {
  caption: 13,
  body: 16,
  title: 20,
  heading: 26,
  display: 34,
} as const;

export function colorsForScheme(scheme: ColorScheme): ThemeColors {
  return scheme === "light" ? LightColors : DarkColors;
}
