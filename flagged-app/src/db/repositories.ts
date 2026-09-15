import { randomUUID } from "expo-crypto";
import { sqlite } from "./client";
import type {
  Category,
  Ingredient,
  PantryItem,
  Profile,
  ProfileChangeLogEntry,
  ProfileSnapshot,
  QuickPack,
  Stats,
} from "../domain/types";

const parse = <T>(json: string): T => JSON.parse(json) as T;

// ---------------- Dictionary reads ----------------

export function getAllIngredients(): Ingredient[] {
  return sqlite().getAllSync<Ingredient>("SELECT id, term FROM ingredients");
}

export function getIngredientTermMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const i of getAllIngredients()) map.set(i.id, i.term);
  return map;
}

export function getCategories(): Category[] {
  const rows = sqlite().getAllSync<{
    id: string;
    name: string;
    parent_group: string;
    classification: string;
  }>("SELECT id, name, parent_group, classification FROM categories");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentGroup: r.parent_group as Category["parentGroup"],
    classification: r.classification as Category["classification"],
    ingredientIds: getCategoryIngredientIds(r.id),
  }));
}

export function getCategoryIngredientIds(categoryId: string): string[] {
  const rows = sqlite().getAllSync<{ ingredient_id: string }>(
    "SELECT ingredient_id FROM category_ingredient WHERE category_id = ? ORDER BY position",
    [categoryId]
  );
  return rows.map((r) => r.ingredient_id);
}

export function getQuickPacks(): QuickPack[] {
  const rows = sqlite().getAllSync<{ id: string; name: string; type: string }>(
    "SELECT id, name, type FROM quick_packs"
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as QuickPack["type"],
    categoryIds: sqlite()
      .getAllSync<{ category_id: string }>(
        "SELECT category_id FROM quick_pack_category WHERE pack_id = ? ORDER BY position",
        [r.id]
      )
      .map((x) => x.category_id),
  }));
}

// ---------------- Profiles ----------------

function mapProfile(r: any): Profile {
  return {
    profileId: r.profile_id,
    name: r.name,
    activeCategoryIds: parse<string[]>(r.active_category_ids),
    excludedIngredientIds: parse<string[]>(r.excluded_ingredient_ids),
    customIngredients: parse<string[]>(r.custom_ingredients),
    createdAt: r.created_at,
    totalLabelsRead: r.total_labels_read ?? 0,
    totalRedFlagsCaught: r.total_red_flags_caught ?? 0,
    totalCleanScans: r.total_clean_scans ?? 0,
    totalReformulationsCaught: r.total_reformulations_caught ?? 0,
  };
}

export function getProfiles(): Profile[] {
  return sqlite()
    .getAllSync<any>("SELECT * FROM profiles ORDER BY created_at ASC")
    .map(mapProfile);
}

export function getProfile(id: string): Profile | null {
  const r = sqlite().getFirstSync<any>("SELECT * FROM profiles WHERE profile_id = ?", [id]);
  return r ? mapProfile(r) : null;
}

export function createProfile(name: string): Profile {
  const p: Profile = {
    profileId: randomUUID(),
    name,
    activeCategoryIds: [],
    excludedIngredientIds: [],
    customIngredients: [],
    createdAt: Date.now(),
    totalLabelsRead: 0,
    totalRedFlagsCaught: 0,
    totalCleanScans: 0,
    totalReformulationsCaught: 0,
  };
  sqlite().runSync(
    "INSERT INTO profiles (profile_id, name, active_category_ids, excluded_ingredient_ids, custom_ingredients, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [p.profileId, p.name, "[]", "[]", "[]", p.createdAt]
  );
  return p;
}

export function updateProfile(p: Profile): void {
  sqlite().runSync(
    `UPDATE profiles SET name = ?, active_category_ids = ?, excluded_ingredient_ids = ?, custom_ingredients = ?,
     total_labels_read = ?, total_red_flags_caught = ?, total_clean_scans = ?,
     total_reformulations_caught = ? WHERE profile_id = ?`,
    [
      p.name,
      JSON.stringify(p.activeCategoryIds),
      JSON.stringify(p.excludedIngredientIds),
      JSON.stringify(p.customIngredients),
      p.totalLabelsRead,
      p.totalRedFlagsCaught,
      p.totalCleanScans,
      p.totalReformulationsCaught,
      p.profileId,
    ]
  );
}

/**
 * Delete a profile. Pantry items it saved are kept (never destroy a scan
 * history the user chose to save) but detached — profile_id reset to '',
 * the same "unassigned" value pre-migration rows already use — so they only
 * surface under "All" from then on, never under a profile that no longer exists.
 */
export function deleteProfile(profileId: string): void {
  sqlite().runSync("UPDATE pantry_items SET profile_id = '' WHERE profile_id = ?", [profileId]);
  sqlite().runSync("DELETE FROM profiles WHERE profile_id = ?", [profileId]);
}

// ---------------- Pantry ----------------

function mapPantry(r: any): PantryItem {
  // Rows saved before 2026-09-14 (docs/07 §7.1) have no real snapshot — the
  // column defaults to the string '{}', which parses to an object missing
  // all three fields, not an already-shaped ProfileSnapshot. Filling each
  // field independently means every match on a pre-migration item reads as
  // a profile-change with no dated log entry, the honest fallback for "we
  // truly don't know what this item was screening for."
  const snapshot = r.profile_snapshot ? parse<Partial<ProfileSnapshot>>(r.profile_snapshot) : {};
  return {
    itemId: r.item_id,
    profileId: r.profile_id ?? "",
    brandName: r.brand_name,
    productName: r.product_name,
    imageFilePath: r.image_file_path,
    profileSnapshot: {
      activeCategoryIds: snapshot.activeCategoryIds ?? [],
      excludedIngredientIds: snapshot.excludedIngredientIds ?? [],
      customIngredients: snapshot.customIngredients ?? [],
    },
    dateAdded: r.date_added,
    lastVerifiedDate: r.last_verified_date,
    deletedAt: r.deleted_at ?? null,
  };
}

export function getActivePantryItems(): PantryItem[] {
  return sqlite()
    .getAllSync<any>("SELECT * FROM pantry_items WHERE deleted_at IS NULL ORDER BY date_added DESC")
    .map(mapPantry);
}

export function getPantryItem(itemId: string): PantryItem | null {
  const r = sqlite().getFirstSync<any>("SELECT * FROM pantry_items WHERE item_id = ?", [itemId]);
  return r ? mapPantry(r) : null;
}

export function getRecentlyDeleted(): PantryItem[] {
  return sqlite()
    .getAllSync<any>(
      "SELECT * FROM pantry_items WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    )
    .map(mapPantry);
}

export function addPantryItem(
  input: Omit<PantryItem, "itemId" | "dateAdded" | "lastVerifiedDate" | "deletedAt">
): PantryItem {
  const now = Date.now();
  const item: PantryItem = { ...input, itemId: randomUUID(), dateAdded: now, lastVerifiedDate: now, deletedAt: null };
  sqlite().runSync(
    "INSERT INTO pantry_items (item_id, profile_id, brand_name, product_name, image_file_path, profile_snapshot, date_added, last_verified_date, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
    [
      item.itemId,
      item.profileId,
      item.brandName,
      item.productName,
      item.imageFilePath,
      JSON.stringify(item.profileSnapshot),
      item.dateAdded,
      item.lastVerifiedDate,
    ]
  );
  return item;
}

export function softDeletePantryItem(itemId: string): void {
  sqlite().runSync("UPDATE pantry_items SET deleted_at = ? WHERE item_id = ?", [Date.now(), itemId]);
}

export function undoDeletePantryItem(itemId: string): void {
  sqlite().runSync("UPDATE pantry_items SET deleted_at = NULL WHERE item_id = ?", [itemId]);
}

/** Keep-item: baseline against the profile's CURRENT filters and reset the
 * 30-day timer (docs/07 §7.1) — the new snapshot, not the old one, since a
 * "Keep" means the user has accepted today's flagged state as the new normal. */
export function rebaselinePantryItem(itemId: string, snapshot: ProfileSnapshot): void {
  sqlite().runSync(
    "UPDATE pantry_items SET profile_snapshot = ?, last_verified_date = ? WHERE item_id = ?",
    [JSON.stringify(snapshot), Date.now(), itemId]
  );
}

export function markVerified(itemId: string): void {
  sqlite().runSync("UPDATE pantry_items SET last_verified_date = ? WHERE item_id = ?", [
    Date.now(),
    itemId,
  ]);
}

/**
 * Permanently purge items whose 24h undo window has elapsed (docs/03/05).
 * Returns the thumbnail URIs of the purged rows so the caller can delete the
 * files too. `nowMs` is passed straight through — a rewound clock only makes
 * the cutoff earlier, i.e. purges fewer items, never more.
 */
export function purgeExpiredDeletions(nowMs = Date.now()): string[] {
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  const doomed = sqlite().getAllSync<{ image_file_path: string }>(
    "SELECT image_file_path FROM pantry_items WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    [cutoff]
  );
  sqlite().runSync(
    "DELETE FROM pantry_items WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    [cutoff]
  );
  return doomed.map((d) => d.image_file_path).filter(Boolean);
}

// ---------------- Profile change log ----------------
// One row per profile-editor mutation (docs/03 §3.2a) — lets a recheck cite
// exactly when a filter changed, not just that it did (docs/07 §7.1).

function mapChangeLog(r: any): ProfileChangeLogEntry {
  return {
    id: r.id,
    profileId: r.profile_id,
    timestamp: r.timestamp,
    changeType: r.change_type,
    categoryId: r.category_id ?? null,
    categoryName: r.category_name ?? null,
    ingredientTerm: r.ingredient_term ?? null,
  };
}

/** Log any number of profile-editor mutations from one `persist()` call
 * (e.g. `activateIngredient` can both toggle a category on and un-exclude
 * an ingredient in a single save). */
export function logProfileChanges(entries: Omit<ProfileChangeLogEntry, "id">[]): void {
  const s = sqlite();
  for (const e of entries) {
    s.runSync(
      "INSERT INTO profile_change_log (id, profile_id, timestamp, change_type, category_id, category_name, ingredient_term) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), e.profileId, e.timestamp, e.changeType, e.categoryId, e.categoryName, e.ingredientTerm]
    );
  }
}

/** Most recent log entry that turned ON a given category for a profile
 * (docs/07 §7.1 recheck attribution) — null if none exists (e.g. the
 * category was already active before this logging system existed). */
export function findCategoryEnabledChange(profileId: string, categoryId: string): ProfileChangeLogEntry | null {
  const r = sqlite().getFirstSync<any>(
    "SELECT * FROM profile_change_log WHERE profile_id = ? AND category_id = ? AND change_type = 'category_on' ORDER BY timestamp DESC LIMIT 1",
    [profileId, categoryId]
  );
  return r ? mapChangeLog(r) : null;
}

/** Most recent log entry that added a given custom ingredient term for a
 * profile (docs/07 §7.1 recheck attribution). */
export function findCustomIngredientAddedChange(profileId: string, term: string): ProfileChangeLogEntry | null {
  const r = sqlite().getFirstSync<any>(
    "SELECT * FROM profile_change_log WHERE profile_id = ? AND ingredient_term = ? AND change_type = 'custom_added' ORDER BY timestamp DESC LIMIT 1",
    [profileId, term.toLowerCase()]
  );
  return r ? mapChangeLog(r) : null;
}

// ---------------- Stats (singleton) ----------------

export function getStats(): Stats {
  const r = sqlite().getFirstSync<any>("SELECT * FROM stats LIMIT 1");
  return {
    statsId: r.stats_id,
    freeScansUsed: r.free_scans_used,
    totalLabelsRead: r.total_labels_read,
    totalRedFlagsCaught: r.total_red_flags_caught,
    totalCleanScans: r.total_clean_scans,
    totalReformulationsCaught: r.total_reformulations_caught ?? 0,
  };
}

export function saveStats(s: Stats): void {
  sqlite().runSync(
    "UPDATE stats SET free_scans_used = ?, total_labels_read = ?, total_red_flags_caught = ?, total_clean_scans = ?, total_reformulations_caught = ? WHERE stats_id = ?",
    [
      s.freeScansUsed,
      s.totalLabelsRead,
      s.totalRedFlagsCaught,
      s.totalCleanScans,
      s.totalReformulationsCaught,
      s.statsId,
    ]
  );
}
