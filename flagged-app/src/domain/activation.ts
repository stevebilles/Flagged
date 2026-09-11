import type { Category, Profile, QuickPack } from "./types";

/**
 * Quick Pack activation rules (authoritative: docs/data-schema.md).
 *
 * - Selecting a pack turns ON all its categories (and, by default, their ingredients).
 * - Deselecting a pack turns its categories OFF *unless another still-active pack
 *   also needs that category* (shared categories stay on while any active pack needs them).
 * - Category / individual-ingredient toggles are handled separately below.
 */

/** Which packs are currently fully active given a profile's active categories. */
export function activePackIds(profile: Profile, packs: QuickPack[]): string[] {
  const active = new Set(profile.activeCategoryIds);
  return packs.filter((p) => p.categoryIds.every((c) => active.has(c))).map((p) => p.id);
}

export function isPackActive(profile: Profile, pack: QuickPack): boolean {
  const active = new Set(profile.activeCategoryIds);
  return pack.categoryIds.every((c) => active.has(c));
}

/** Select a pack → add all its categories. */
export function selectPack(profile: Profile, pack: QuickPack): Profile {
  const set = new Set(profile.activeCategoryIds);
  for (const c of pack.categoryIds) set.add(c);
  return { ...profile, activeCategoryIds: [...set] };
}

/**
 * Deselect a pack → remove its categories, except any still needed by another
 * pack that remains fully active after removal.
 */
export function deselectPack(profile: Profile, pack: QuickPack, allPacks: QuickPack[]): Profile {
  const original = new Set(profile.activeCategoryIds);

  // Start by removing the deselected pack's categories.
  const kept = new Set(original);
  for (const c of pack.categoryIds) kept.delete(c);

  // Re-add categories required by any OTHER pack that was fully active BEFORE
  // this deselection (evaluated against the original active set, so a shared
  // category isn't wrongly considered inactive just because we stripped it).
  for (const other of allPacks) {
    if (other.id === pack.id) continue;
    const otherWasActive = other.categoryIds.every((c) => original.has(c));
    if (otherWasActive) {
      for (const c of other.categoryIds) kept.add(c);
    }
  }
  return { ...profile, activeCategoryIds: [...kept] };
}

export function togglePack(profile: Profile, pack: QuickPack, allPacks: QuickPack[]): Profile {
  return isPackActive(profile, pack)
    ? deselectPack(profile, pack, allPacks)
    : selectPack(profile, pack);
}

/** Toggle a single category on/off (row switch). */
export function toggleCategory(profile: Profile, categoryId: string): Profile {
  const set = new Set(profile.activeCategoryIds);
  set.has(categoryId) ? set.delete(categoryId) : set.add(categoryId);
  return { ...profile, activeCategoryIds: [...set] };
}

/** Toggle an individual ingredient off/on ("tap for details"). */
export function toggleIngredientExcluded(profile: Profile, ingredientId: string): Profile {
  const set = new Set(profile.excludedIngredientIds);
  set.has(ingredientId) ? set.delete(ingredientId) : set.add(ingredientId);
  return { ...profile, excludedIngredientIds: [...set] };
}

export function addCustomIngredient(profile: Profile, term: string): Profile {
  const t = term.trim().toLowerCase();
  if (!t || profile.customIngredients.includes(t)) return profile;
  return { ...profile, customIngredients: [...profile.customIngredients, t] };
}

export function removeCustomIngredient(profile: Profile, term: string): Profile {
  return { ...profile, customIngredients: profile.customIngredients.filter((c) => c !== term) };
}

/**
 * The effective red-flag term set for a profile (docs/data-schema.md):
 *   union(ingredients in active categories) − excluded + custom terms.
 * Returns lowercase terms for matching (docs/06).
 */
export function effectiveRedFlagTerms(
  profile: Profile,
  categories: Category[],
  ingredientTermById: Map<string, string>
): string[] {
  const excluded = new Set(profile.excludedIngredientIds);
  const active = new Set(profile.activeCategoryIds);
  const terms = new Set<string>();

  for (const cat of categories) {
    if (!active.has(cat.id)) continue;
    for (const ingId of cat.ingredientIds) {
      if (excluded.has(ingId)) continue;
      const term = ingredientTermById.get(ingId);
      if (term) terms.add(term.toLowerCase());
    }
  }
  for (const custom of profile.customIngredients) terms.add(custom.toLowerCase());
  return [...terms];
}

/** Which filter caught a term — used to explain a flag on the results screen (docs/07). */
export interface RedFlagMeta {
  /** Owning dictionary category id, or null for a user's custom ingredient. */
  categoryId: string | null;
  /** Display name of the filter: the category name, or "Custom ingredient". */
  categoryName: string;
  /** Badge shown on the results screen (docs/09); a custom term reads as "preference". */
  classification: Category["classification"];
}

/**
 * Same effective set as `effectiveRedFlagTerms`, but keyed by lowercase term and
 * carrying the filter each term belongs to. When a term appears in more than one
 * active category the first one wins (stable by category iteration order).
 */
export function effectiveRedFlagMeta(
  profile: Profile,
  categories: Category[],
  ingredientTermById: Map<string, string>
): Map<string, RedFlagMeta> {
  const excluded = new Set(profile.excludedIngredientIds);
  const active = new Set(profile.activeCategoryIds);
  const map = new Map<string, RedFlagMeta>();

  for (const cat of categories) {
    if (!active.has(cat.id)) continue;
    for (const ingId of cat.ingredientIds) {
      if (excluded.has(ingId)) continue;
      const term = ingredientTermById.get(ingId);
      if (!term) continue;
      const key = term.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { categoryId: cat.id, categoryName: cat.name, classification: cat.classification });
      }
    }
  }
  for (const custom of profile.customIngredients) {
    const key = custom.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { categoryId: null, categoryName: "Custom ingredient", classification: "preference" });
    }
  }
  return map;
}
