import { useFonts } from "expo-font";

/**
 * Loads Atkinson Hyperlegible (used exclusively — docs/09).
 *
 * TODO(assets): add the TTF files under assets/fonts/. Download from
 * https://github.com/googlefonts/atkinson-hyperlegible (OFL licensed):
 *   - AtkinsonHyperlegible-Regular.ttf
 *   - AtkinsonHyperlegible-Bold.ttf
 *   - AtkinsonHyperlegible-Italic.ttf
 *   - AtkinsonHyperlegible-BoldItalic.ttf
 *
 * Until the files are present these requires will fail to resolve, so they are
 * wrapped so the app still boots during early scaffolding. Replace the empty
 * map with the real requires once the fonts are added.
 */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts({
    // "AtkinsonHyperlegible-Regular": require("../../assets/fonts/AtkinsonHyperlegible-Regular.ttf"),
    // "AtkinsonHyperlegible-Bold": require("../../assets/fonts/AtkinsonHyperlegible-Bold.ttf"),
    // "AtkinsonHyperlegible-Italic": require("../../assets/fonts/AtkinsonHyperlegible-Italic.ttf"),
    // "AtkinsonHyperlegible-BoldItalic": require("../../assets/fonts/AtkinsonHyperlegible-BoldItalic.ttf"),
  });
  return [loaded, error];
}
