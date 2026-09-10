# Contract — Profile Activation (`src/domain/activation.ts`)

Pure TypeScript. Authoritative rules: `docs/data-schema.md`. All functions are pure and
return a **new** `Profile` (no mutation).

## `selectPack(profile, pack): Profile`
- Adds every `pack.categoryIds` entry to `activeCategoryIds` (set semantics, no dupes).

## `deselectPack(profile, pack, allPacks): Profile`
- Removes `pack.categoryIds` from `activeCategoryIds`, then re-adds any category required by
  another pack that was **fully active before** this deselection.
- **Acceptance**: with `Focus & ADHD` and `Preservatives` both active (they share *Synthetic
  preservatives*), deselecting one keeps *Synthetic preservatives* active. Deselecting the
  last pack that needs it removes it.

## `toggleCategory(profile, categoryId): Profile`
- Adds/removes a single category id.

## `toggleIngredientExcluded(profile, ingredientId): Profile`
- Adds/removes an ingredient id in `excludedIngredientIds`; does not change
  `activeCategoryIds`.

## `addCustomIngredient(profile, term) / removeCustomIngredient(profile, term)`
- Trim + lowercase; ignore empty; no duplicates.

## `activePackIds(profile, packs) / isPackActive(profile, pack)`
- A pack is "active" iff **all** its categories are in `activeCategoryIds`.

## `effectiveRedFlagTerms(profile, categories, ingredientTermById): string[]`
- Returns lowercased terms = `union(ingredients of active categories) − excluded + custom`.
- Order not significant; caller de-dupes.

**Acceptance checks** (→ tests)
- Select a composite pack → all member categories active.
- Shared-category deselection regression (above).
- Toggle one ingredient off → it leaves the effective set, siblings remain.
- Custom term → appears in the effective set for that profile only.
- Two profiles with different packs → different effective sets → same label yields different
  results.
