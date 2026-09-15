import React, { createContext, useContext, useMemo } from "react";
import { ColorScheme, ThemeColors, colorsForScheme, fontFamily, fontSize, radius, spacing } from "./theme";

interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontFamily: typeof fontFamily;
  fontSize: typeof fontSize;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Dark is the app's identity (docs/09 "X-Ray" feel) — force it regardless of
  // the OS setting until there's a real in-app Appearance toggle (planned,
  // docs/17 settings mockup). Previously this followed the system scheme, which
  // silently showed the plain light fallback to anyone not in OS dark mode.
  const scheme: ColorScheme = "dark";

  const value = useMemo<Theme>(
    () => ({
      scheme,
      colors: colorsForScheme(scheme),
      spacing,
      radius,
      fontFamily,
      fontSize,
    }),
    [scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
