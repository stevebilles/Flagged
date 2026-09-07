import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
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
  const systemScheme = useColorScheme();
  // Dark mode is the default "X-Ray" feel (docs/09) when the system is unset.
  const scheme: ColorScheme = systemScheme === "light" ? "light" : "dark";

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
