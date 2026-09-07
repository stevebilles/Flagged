import { randomUUID } from "expo-crypto";
import { sqlite } from "./client";
import type {
  Category,
  Ingredient,
  PantryItem,
  Profile,
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
  };
  sqlite().runSync(
    "INSERT INTO profiles (profile_id, name, active_category_ids, excluded_ingredient_ids, custom_ingredients, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [p.profileId, p.name, "[]", "[]", "[]", p.createdAt]
  );
  return p;
}

export function updateProfile(p: Profile): void {
  sqlite().runSync(
    "UPDATE profiles SET name = ?, active_category_ids = ?, excluded_ingredient_ids = ?, custom_ingredients = ? WHERE profile_id = ?",
    [
      p.name,
      JSON.stringify(p.activeCategoryIds),
      JSON.stringify(p.excludedIngredientIds),
      JSON.stringify(p.customIngredients),
      p.profileId,
    ]
  );
}

// ---------------- Pantry ----------------

function mapPantry(r: any): PantryItem {
  return {
    itemId: r.item_id,
    brandName: r.brand_name,
    productName: r.product_name,
    imageFilePath: r.image_file_path,
    originalIngredients: parse<string[]>(r.original_ingredients),
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
    "INSERT INTO pantry_items (item_id, brand_name, product_name, image_file_path, original_ingredients, date_added, last_verified_date, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
    [
      item.itemId,
      item.brandName,
      item.productName,
      item.imageFilePath,
      JSON.stringify(item.originalIngredients),
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

/** Keep-item: update baseline ingredients and reset the 30-day timer (docs/07). */
export function rebaselinePantryItem(itemId: string, newIngredients: string[]): void {
  sqlite().runSync(
    "UPDATE pantry_items SET original_ingredients = ?, last_verified_date = ? WHERE item_id = ?",
    [JSON.stringify(newIngredients), Date.now(), itemId]
  );
}

export function markVerified(itemId: string): void {
  sqlite().runSync("UPDATE pantry_items SET last_verified_date = ? WHERE item_id = ?", [
    Date.now(),
    itemId,
  ]);
}

/** Permanently purge items whose 24h undo window has elapsed (docs/03/05). */
export function purgeExpiredDeletions(nowMs = Date.now()): number {
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  const res = sqlite().runSync(
    "DELETE FROM pantry_items WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    [cutoff]
  );
  return res.changes ?? 0;
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
  };
}

export function saveStats(s: Stats): void {
  sqlite().runSync(
    "UPDATE stats SET free_scans_used = ?, total_labels_read = ?, total_red_flags_caught = ?, total_clean_scans = ? WHERE stats_id = ?",
    [s.freeScansUsed, s.totalLabelsRead, s.totalRedFlagsCaught, s.totalCleanScans, s.statsId]
  );
}
