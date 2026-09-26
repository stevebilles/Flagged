import { looksLikeNonEnglish, countLanguageWords } from "../matching/language";

// The two sides of the same real product, exactly as the camera read them on 2026-09-25 (Metro log).
const ENGLISH_SIDE =
  "Ingredients: Wheat flour, Rice flour, Vegetable oil (vegetable oil, TBHQ, citric acid, Cheddar cheese, " +
  "Seasoning (maltodextrin, salt, modified milk ingredients, cheddar cheese solids, lactic acid, citric acid, " +
  "yeast extract, butter solids, natural and artificial flavour, disodium inosinate, disodium guanylate), " +
  "Sugar, Soy lecithin, Salt, Leavening agents (sodium acid pyrophosphate, corn starch, monocalcium phosphate, " +
  "calcium sulphate), Monosodium glutamate, Baking soda, Sulphites. Contains: Wheat, Milk, Soy, Sulphites.";

const FRENCH_SIDE =
  "Ingrédients : Farine de blé, Farine de riz, Huile végétale (huile végétale, TBHQ, acide citrique), " +
  "Fromage cheddar, Assaisonnement (maltodextrine, sel, substances laitières modifiées, matières sèches du " +
  "fromage cheddar, acide lactique, acide citrique, extrait de levure, matières sèches du beurre, arôme " +
  "naturel et artificiel, inosinate disodique, guanylate disodique), Sucre, Lécithine de soya, Sel, Agents " +
  "de levage (pyrophosphate acide de sodium, amidon de maïs, phosphate monocalcique, sulfate de calcium), " +
  "Glutamate monosodique, Bicarbonate de sodium, Sulfites. Contient : Blé, Lait, Soya,";

describe("looksLikeNonEnglish (warn before scanning another language's ingredient list)", () => {
  it("does not warn for the English side of a real label", () => {
    expect(looksLikeNonEnglish(ENGLISH_SIDE)).toBe(false);
  });

  it("warns for the French side of the same label — the case that gave 1 flag instead of 7", () => {
    expect(looksLikeNonEnglish(FRENCH_SIDE)).toBe(true);
  });

  it("is not French-specific: Portuguese, Spanish, German and Italian lists warn too", () => {
    expect(
      looksLikeNonEnglish(
        "Ingredientes: Farinha de trigo enriquecida, açúcar, sal, óleo de soja, fermento, leite em pó. Contém glúten."
      )
    ).toBe(true);
    expect(
      looksLikeNonEnglish("Ingredientes: Harina de trigo, azúcar, sal, aceite de girasol, leche en polvo, huevo.")
    ).toBe(true);
    expect(
      looksLikeNonEnglish("Zutaten: Weizenmehl, Zucker, Salz, Pflanzenöl, Hefe, Milchpulver, Eier. Enthält Gluten.")
    ).toBe(true);
    expect(
      looksLikeNonEnglish("Ingredienti: Farina di frumento, zucchero, sale, olio di girasole, latte in polvere, uovo.")
    ).toBe(true);
  });

  it("warns for a non-Latin script", () => {
    expect(looksLikeNonEnglish("Состав: пшеничная мука, сахар, соль, масло подсолнечное, дрожжи")).toBe(true);
  });

  it("does not warn for an English list with a couple of accented words", () => {
    expect(
      looksLikeNonEnglish("Ingredients: Wheat flour, sugar, crème fraîche, salt, purée of tomato, water, yeast, oil.")
    ).toBe(false);
  });

  it("does not warn when a capture is mostly English with a little French mixed in", () => {
    expect(looksLikeNonEnglish(ENGLISH_SIDE + " Ingrédients : Farine de blé, sel.")).toBe(false);
  });

  it("does not warn on empty, very short, or unrecognisable text (that's the illegible check's job)", () => {
    expect(looksLikeNonEnglish("")).toBe(false);
    expect(looksLikeNonEnglish("sel")).toBe(false);
    expect(looksLikeNonEnglish("xq zzv kkr 1234 %%")).toBe(false);
  });

  it("counts English and foreign words separately", () => {
    const c = countLanguageWords("Farine de blé, wheat flour, salt");
    expect(c.foreign).toBe(3); // farine, de, blé
    expect(c.english).toBe(3); // wheat, flour, salt
  });
});
