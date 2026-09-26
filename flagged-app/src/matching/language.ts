/**
 * "Does this scan look like it's NOT English?" (owner, 2026-09-25).
 *
 * The dictionary only has English ingredient names. A bilingual label scanned on its French (or
 * Portuguese, Spanish, German…) side matches almost nothing — real device test: the same product gave
 * 7 red flags on the English side and 1 (TBHQ, spelled the same in French) on the French side, with no
 * sign anything was wrong. That's a false-negative risk, so the scan screens warn first.
 *
 * Deliberately NOT French-specific: a Portuguese product can carry a Portuguese and an English list.
 * The rule is "the bulk of the words aren't English": it needs positive evidence of another language
 * (words that only occur in another language, or letters English doesn't use), and that evidence has to
 * outnumber the recognisably-English words. So an English list with a couple of "crème"/"purée"
 * words, or a chemical name we don't know, never trips it; neither does a capture that includes both
 * sides in about equal measure (its English half is scanned anyway). Pure, so it's unit-tested.
 * On-device only — no language service.
 */

/** Tokens: runs of Latin letters (with the accented ones Western-European languages use). */
const WORD = /[a-zà-öø-ÿœ]+/g;
/** Letters English doesn't use — a word containing one is evidence of another language. */
const NON_ENGLISH_LETTER = /[à-åç-ïñ-öù-ýÿßœ]/;
/** A run of a non-Latin script (Cyrillic, Greek, Arabic, CJK…) — also another language. */
const NON_LATIN_RUN = /[Ͱ-῿⺀-￿]+/g;

/** Words that mark English (function words, label words, common ingredients). It doesn't need to be
 * complete: it only has to be big enough that a real English list outweighs stray foreign words. */
const ENGLISH = new Set(
  (
    "the and or of with may contain contains containing ingredients ingredient added less than from made " +
    "in on for as is are to by natural artificial flavour flavours flavor flavors flavouring color colors " +
    "colour colours preservative preservatives flour wheat rice corn oat oats barley rye sugar sugars " +
    "glucose fructose dextrose syrup honey molasses salt water oil oils vegetable soybean soy soya canola " +
    "cottonseed palm sunflower olive milk whey cream butter cheese cheddar egg eggs yeast extract starch " +
    "modified protein proteins gluten lecithin acid citric lactic ascorbic phosphate sodium potassium " +
    "calcium iron vitamin vitamins niacin riboflavin thiamin folic enriched whole grain bran germ seeds " +
    "seed sesame nuts nut peanut peanuts almond cocoa chocolate vanilla spice spices pepper garlic onion " +
    "tomato powder paste concentrate juice fruit cane beet invert maltodextrin dextrin soda baking " +
    "leavening agents agent emulsifier stabilizer thickener gum guar xanthan cellulose pectin " +
    "carrageenan gelatin monosodium glutamate disodium inosinate guanylate sulphite sulphites sulfite " +
    "sulfites sulphate sulfate benzoate sorbate propionate nitrite nitrate tbhq bha bht edta dried " +
    "cultured vinegar potato caraway seasoning solids trace traces processed sea brown white raw " +
    "roasted organic filtered distilled malted malt sauce"
  ).split(" ")
);

/** Words that occur in French, Spanish, Portuguese, Italian, German or Dutch ingredient lists and are
 * not English words. (Words with an accent are caught by `NON_ENGLISH_LETTER`, so they aren't listed.) */
const FOREIGN = new Set(
  (
    // function words
    "de du des la le les un une et ou avec sans pour dans sur par el los las del una y para por " +
    "il lo gli di della senza che ed der das und mit ohne von aus nach oder het een van met zonder " +
    "sem uma um dos com em " +
    // "ingredients" and "contains"
    "ingredientes ingredienti zutaten contient contiene contener puede pode " +
    "conter kann enthalten contenere " +
    // common food words
    "farine harina farinha farina mehl meel sucre azucar acucar zucchero zucker suiker sel sal salz " +
    "lait leche leite latte milch melk oeuf huevo ovo uovo huile aceite azeite olio oel eau agua " +
    "acqua wasser trigo tarwe ble riz arroz riso reis mais maiz milho levure levadura fermento " +
    "lievito hefe extrait extracto estratto extrakt poudre polvo polvere pulver amidon almidon " +
    "amido acide acido conservateur conservante conservador colorant colorante coloranti arome " +
    "sabor sapore modificado modificato vegetal vegetale"
  ).split(" ")
);

export interface LanguageCounts {
  english: number;
  foreign: number;
}

export function countLanguageWords(text: string): LanguageCounts {
  let english = 0;
  let foreign = 0;
  for (const raw of text.toLowerCase().match(WORD) ?? []) {
    if (raw.length < 2) continue;
    if (NON_ENGLISH_LETTER.test(raw) || FOREIGN.has(raw)) foreign++;
    else if (ENGLISH.has(raw)) english++;
  }
  foreign += (text.match(NON_LATIN_RUN) ?? []).length;
  return { english, foreign };
}

/** Fewest foreign words before we'd say anything — a couple of stray "crème"s is normal English. */
const MIN_FOREIGN_WORDS = 3;

/** True when the bulk of the scanned words look like another language (see the file comment). */
export function looksLikeNonEnglish(text: string): boolean {
  const { english, foreign } = countLanguageWords(text);
  return foreign >= MIN_FOREIGN_WORDS && foreign > english;
}

/** The warning shown before a scan that looks non-English is evaluated (`LanguageWarning`). Never says
 * which language: it can't know, and the fix is the same — scan the English ingredient list. There is
 * only ONE action, scanning again (owner, 2026-09-25): no "continue anyway". */
export const NON_ENGLISH_WARNING = {
  title: "Check the language",
  message:
    "Most of the words in this scan don't look like English. Flagged only checks English ingredient " +
    "names, so a scan in another language can miss red flags. Please scan the English ingredient list.",
  scanAgain: "Scan again",
} as const;
