# Data Schema — `assets/data/ingredients.json`

This is the **bundled red-flag dictionary**. It ships inside the app, is parsed into the local
SQLite database on **first launch** (`03`), and is the source for building the **11 Quick Packs**.
100% offline — every install has identical data.

## File shape

```jsonc
{
  "schemaVersion": 1,
  "meta": {
    "description": "...",
    "parentGroups": ["Allergens", "Sugars", "Additives", "Dietary"],
    "classifications": ["regulated", "advisory", "preference"],
    "counts": { "ingredients": 283, "categories": 20, "quickPacks": 11 }
  },

  // Canonical, de-duplicated. Each ingredient term appears exactly once.
  "ingredients": [
    { "id": "ing-red-40", "term": "red 40" }
  ],

  // Canonical categories, referenced by packs. 20 total.
  "categories": [
    {
      "id": "cat-artificial-dyes",
      "name": "Artificial dyes",
      "parentGroup": "Additives",          // Allergens | Sugars | Additives | Dietary
      "classification": "advisory",        // regulated | advisory | preference
      "ingredientIds": ["ing-red-40", "..."]   // ordered
    }
  ],

  // 11 Quick Packs. Reference categories by id.
  "quickPacks": [
    { "id": "pack-artificial-dyes", "name": "Artificial dyes",
      "type": "simple", "categoryIds": ["cat-artificial-dyes"] },
    { "id": "pack-big-9-allergens", "name": "Big-9 Allergens",
      "type": "composite",
      "categoryIds": ["cat-egg","cat-fish","cat-milk","cat-peanut","cat-sesame",
                      "cat-shellfish","cat-soy","cat-tree-nuts","cat-wheat"] }
  ]
}
```

## Why canonical / de-duplicated

Several categories are shared by multiple packs, and several ingredient terms appear in multiple
categories. Each is defined **once** and referenced by **id** so the scanner never double-flags and
future term edits don't orphan user selections.

**Shared categories (defined once, referenced by multiple packs):**
- **Artificial dyes** → `Artificial dyes` pack **and** `Focus & ADHD`
- **Synthetic preservatives** → `Focus & ADHD` **and** `Preservatives`
- **Artificial sweeteners** → `Gut Health` **and** `Sweeteners & Polyols`
- **Sugar alcohols** → `Gut Health` **and** `Sweeteners & Polyols`
- **Hidden sugars** → `Hidden sugars` pack **and** `Gut Health`

**Shared ingredient terms** (e.g., `wheat`, `spelt`, `farro`, `kamut`, `semolina`, `durum`,
`seitan` in both **Wheat** and **Gluten Sources**; `soybean oil` in **Soy** and **Seed oils**) are
single ingredient rows referenced by both categories.

## The 11 Quick Packs → categories

| Quick Pack | Type | Categories |
|---|---|---|
| Artificial dyes | simple | Artificial dyes |
| Big-9 Allergens | composite | Egg, Fish, Milk, Peanut, Sesame, Shellfish, Soy, Tree nuts, Wheat |
| Focus & ADHD | composite | Artificial dyes, Synthetic preservatives |
| Gluten Free | simple | Gluten Sources |
| Gut Health | composite | Artificial sweeteners, Hidden sugars, Sugar alcohols |
| Hidden sugars | simple | Hidden sugars |
| MSG & free glutamates | simple | MSG & free glutamates |
| Preservatives | composite | Nitrates & nitrites, Sulfites, Synthetic preservatives |
| Seed oils | simple | Seed oils |
| Sweeteners & Polyols | composite | Artificial sweeteners, Sugar alcohols |
| Trans fats | simple | Trans fats |

## The 20 categories (counts, group, classification)

| Category | # ingredients | parentGroup | classification |
|---|---:|---|---|
| Egg | 13 | Allergens | regulated |
| Fish | 13 | Allergens | regulated |
| Milk | 20 | Allergens | regulated |
| Peanut | 7 | Allergens | regulated |
| Sesame | 9 | Allergens | regulated |
| Shellfish | 9 | Allergens | regulated |
| Soy | 14 | Allergens | regulated |
| Tree nuts | 15 | Allergens | regulated |
| Wheat | 17 | Allergens | regulated |
| Artificial dyes | 25 | Additives | advisory |
| Synthetic preservatives | 15 | Additives | advisory |
| Artificial sweeteners | 14 | Additives | advisory |
| Sugar alcohols | 13 | Additives | advisory |
| MSG & free glutamates | 17 | Additives | advisory |
| Nitrates & nitrites | 10 | Additives | regulated |
| Sulfites | 13 | Additives | regulated |
| Trans fats | 4 | Additives | regulated |
| Hidden sugars | 37 | Sugars | advisory |
| Gluten Sources | 15 | Dietary | regulated |
| Seed oils | 11 | Dietary | preference |

Total unique ingredients: **283**.

## Activation rules (authoritative)

The profile editor (`05`) lets the user toggle **Quick Packs**, **categories**, and **individual
ingredients**. A profile stores `activeCategoryIds`, `excludedIngredientIds`, `customIngredients`
(`03`).

1. **Select a Quick Pack** → add **all** its `categoryIds` to `activeCategoryIds`; all their
   individual ingredients are active **by default**.
2. **Deselect a Quick Pack** → remove its categories from `activeCategoryIds`, **except** any
   category that still belongs to **another active pack**. (Active pack ⇒ its categories stay
   active. This protects shared categories such as *Synthetic preservatives* when only one of two
   packs is turned off.)
3. **Toggle a category off** (row switch) → remove that single category id from `activeCategoryIds`.
4. **Toggle an individual ingredient off** ("tap for details") → add its ingredient id to
   `excludedIngredientIds` (the category can stay active).
5. **Custom ingredients** → free-text terms in `customIngredients` (not in the dictionary).

### Effective red-flag set (used by the matcher, `06`)

```
effective(profile) =
    unionOfIngredients(profile.activeCategoryIds)   // all ingredients in active categories
  − profile.excludedIngredientIds                   // minus individually toggled-off
  + profile.customIngredients                        // plus user's custom terms
```

## Regenerating this file

`ingredients.json` is generated by `tools/build_seed.py` (in the repo root). The script holds the
verbatim term lists (sourced from the 11 `*/. . . Quick Pack.md` files), assigns stable slug ids,
de-duplicates, applies parentGroup + classification, and prints a verification report of per-category
counts. Re-run after any dictionary change and bump `schemaVersion`.
