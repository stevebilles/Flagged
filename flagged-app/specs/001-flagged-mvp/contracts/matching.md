# Contract — Matching (`src/matching/`)

Pure TypeScript. No native deps. Fully unit-tested (Constitution II & V).

## `normalizeParagraph(raw: string): string`
- Lowercases.
- Rejoins words split by a line-break hyphen (`stear-\nate` → `stearate`).
- Collapses whitespace; keeps commas and parentheses as token separators.
- Deterministic and idempotent: `normalize(normalize(x)) === normalize(x)`.

## `looksLikeIngredientList(raw: string): boolean`
- True when the text contains a start indicator (e.g. `ingredients:`) or a comma-separated
  run typical of a declaration.
- Used only as a fallback when the matcher found zero matches, to decide "illegible abort".

## `regexClean(normalized: string): string`
- Conservative OCR fixups (`0`↔`o`, `1`↔`l`, stray punctuation) applied to a copy.
- **MUST NOT** be used to test a red-flag term that contains a digit.

## `matchParagraph(raw: string, redFlagTerms: string[]): ScanResult`
Returns `{ tokens, matches, isClean }`.

**Guarantees**
1. A term present as a whole word/phrase (non-alphanumeric boundaries) is an `exact` match:
   `"milk"` hits `"skim milk"` and `"contains: milk"`, not `"buttermilk"`.
2. Digit-bearing terms (`"red 40"`, `"yellow 5"`, `"blue 1"`) match only against the raw
   normalized text, never the regex-cleaned copy.
3. Non-digit terms fall back to the cleaned copy if the raw check misses.
4. Fuzzy match: single-word terms of length ≥ 4 only, Levenshtein similarity ≥
   `FUZZY_THRESHOLD` (0.85), length-delta ≤ 2 prefilter, best score wins.
5. A longer matched phrase suppresses a shorter match fully contained within it.
6. `isClean === (matches.length === 0)`.
7. One `Match` per matched term; `matches` sorted by position in the paragraph.

**Acceptance checks** (→ tests)
- `"Red 40"` in text, dye filter active → flagged; `regexClean` never turns it into `"red 4o"`.
- Regression: the `0→o` path does not corrupt any digit-bearing term.
- Clean paragraph with no active term → `isClean === true`.
- OCR typo `"soduim benzoate"` vs `"sodium benzoate"` → fuzzy match fires (≥ 0.85).
- Unrelated word `"soda"` vs `"soy"` → does **not** fuzzy-match (below threshold / length).
- Normalization: hyphen-linebreak rejoin, comma/paren tokenization.
