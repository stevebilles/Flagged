import type { Category, Profile, QuickPack } from "./types";

/**
 * Quick Pack activation rules (authoritative: docs/data-schema.md).
 *
 * - Selecting a pack turns ON all its categories (and, by default, their ingredients).
 * - Deselecting a pack turns OFF every pack transitively linked to it via a shared
 *   category (see `linkedActivePacks`) — a partial deselect that left a shared
 *   category re-added by a sibling pack looked like the tap did nothing, so
 *   linked packs are turned off together as one unit instead.
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
 * Every other currently-active pack transitively linked to `pack` by a shared
 * category (docs/data-schema.md §"Shared categories"). "Focus & ADHD" shares
 * its dyes category with "Artificial Dyes" and its preservatives category with
 * "Preservatives" — so deselecting any one of the three has to take all three
 * down together, or the shared category would just get put back by whichever
 * sibling pack is still active, making the tap look like it did nothing.
 */
export function linkedActivePacks(profile: Profile, pack: QuickPack, allPacks: QuickPack[]): QuickPack[] {
  const activePacks = allPacks.filter((p) => isPackActive(profile, p));
  const linked: QuickPack[] = [];
  const seen = new Set([pack.id]);
  const queue = [pack];

  while (queue.length) {
    const current = queue.shift()!;
    const cats = new Set(current.categoryIds);
    for (const other of activePacks) {
      if (seen.has(other.id)) continue;
      if (other.categoryIds.some((c) => cats.has(c))) {
        seen.add(other.id);
        linked.push(other);
        queue.push(other);
      }
    }
  }
  return linked;
}

/**
 * Deselect a pack → remove its categories, plus the categories of every pack
 * linked to it (see `linkedActivePacks`), all in one step. Since the whole
 * linked group comes off together, no other active pack is left needing any
 * of these categories, so nothing has to be added back.
 */
export function deselectPack(profile: Profile, pack: QuickPack, allPacks: QuickPack[]): Profile {
  const group = [pack, ...linkedActivePacks(profile, pack, allPacks)];
  const toRemove = new Set(group.flatMap((p) => p.categoryIds));
  return { ...profile, activeCategoryIds: profile.activeCategoryIds.filter((c) => !toRemove.has(c)) };
}

export function togglePack(profile: Profile, pack: QuickPack, allPacks: QuickPack[]): Profile {
  return isPackActive(profile, pack)
    ? deselectPack(profile, pack, allPacks)
    : selectPack(profile, pack);
}

/**
 * Every other pack transitively linked to `pack` by a shared category —
 * unlike `linkedActivePacks`, this ignores current on/off state (it's the
 * static shape of the shared-category graph, docs/data-schema.md). Used to
 * explain *select* side effects: re-selecting "Focus & ADHD" only restores
 * "Artificial Dyes" (whose one category it fully covers), not "Preservatives"
 * (which also needs Nitrates & Sulfites) — so callers can say so instead of
 * leaving Preservatives silently short with no explanation.
 */
export function linkedPackGroup(pack: QuickPack, allPacks: QuickPack[]): QuickPack[] {
  const linked: QuickPack[] = [];
  const seen = new Set([pack.id]);
  const queue = [pack];

  while (queue.length) {
    const current = queue.shift()!;
    const cats = new Set(current.categoryIds);
    for (const other of allPacks) {
      if (seen.has(other.id)) continue;
      if (other.categoryIds.some((c) => cats.has(c))) {
        seen.add(other.id);
        linked.push(other);
        queue.push(other);
      }
    }
  }
  return linked;
}

/**
 * Explains what happened to `pack`'s linked packs after selecting it: which
 * ones came fully back on as a side effect, and which are still short some
 * categories `pack` doesn't provide. Returns null when nothing needs saying
 * (pack has no linked packs, or none of them changed / are affected).
 */
export function packSelectionNote(
  before: Profile,
  after: Profile,
  pack: QuickPack,
  allPacks: QuickPack[]
): string | null {
  const group = linkedPackGroup(pack, allPacks);
  if (group.length === 0) return null;

  const turnedOnToo = group.filter((o) => !isPackActive(before, o) && isPackActive(after, o));
  const stillShort = group.filter((o) => !isPackActive(after, o));
  if (turnedOnToo.length === 0 && stillShort.length === 0) return null;

  const parts: string[] = [];
  if (turnedOnToo.length > 0) {
    const names = turnedOnToo.map((o) => o.name).join(" & ");
    parts.push(`${names} turned on too, since ${turnedOnToo.length === 1 ? "it" : "they"} only needed this filter.`);
  }
  if (stillShort.length > 0) {
    const names = stillShort.map((o) => o.name).join(" & ");
    parts.push(
      `${names} need${stillShort.length === 1 ? "s" : ""} more than this filter — turn ${
        stillShort.length === 1 ? "it" : "them"
      } on separately if you'd like ${stillShort.length === 1 ? "it" : "them"} back on.`
    );
  }
  return parts.join(" ");
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

/** RedFlagMeta plus which profile(s) a term came from — the "All" scan mode. */
export interface AllProfilesMeta extends RedFlagMeta {
  profileNames: string[];
}

/**
 * Union of every profile's effective red-flag terms (docs/17 "All" mockup): a
 * scan run under "All" checks everyone's filters in one pass. Each term keeps
 * the name(s) of every profile it's active for, so a result can say whose
 * filter it was ("matches Sofia's Big-9 Allergens filter") — a term shared by
 * two profiles' filters lists both. The category/classification of the first
 * profile that has the term wins (same stable-first-wins rule as a single
 * profile's own effectiveRedFlagMeta).
 */
export function effectiveRedFlagMetaForAll(
  profiles: Profile[],
  categories: Category[],
  ingredientTermById: Map<string, string>
): Map<string, AllProfilesMeta> {
  const map = new Map<string, AllProfilesMeta>();
  for (const profile of profiles) {
    const meta = effectiveRedFlagMeta(profile, categories, ingredientTermById);
    for (const [term, m] of meta) {
      const existing = map.get(term);
      if (existing) {
        if (!existing.profileNames.includes(profile.name)) existing.profileNames.push(profile.name);
      } else {
        map.set(term, { ...m, profileNames: [profile.name] });
      }
    }
  }
  return map;
}
