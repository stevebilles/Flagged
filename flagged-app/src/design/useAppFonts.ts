import { useFonts } from "expo-font";

/**
 * Loads Atkinson Hyperlegible (used exclusively — docs/09).
 *
 * TTFs live in assets/fonts/ (OFL 1.1, © 2020 Braille Institute of America; see
 * assets/fonts/OFL.txt). The keys here MUST match the fontFamily names in
 * src/design/theme.ts.
 */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts({
    "AtkinsonHyperlegible-Regular": require("../../assets/fonts/AtkinsonHyperlegible-Regular.ttf"),
    "AtkinsonHyperlegible-Bold": require("../../assets/fonts/AtkinsonHyperlegible-Bold.ttf"),
    "AtkinsonHyperlegible-Italic": require("../../assets/fonts/AtkinsonHyperlegible-Italic.ttf"),
    "AtkinsonHyperlegible-BoldItalic": require("../../assets/fonts/AtkinsonHyperlegible-BoldItalic.ttf"),
  });
  return [loaded, error];
}
