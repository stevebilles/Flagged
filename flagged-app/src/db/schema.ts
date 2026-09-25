import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Local SQLite schema (Drizzle). See docs/03-data-models.md.
 * Dictionary tables are seeded read-only from assets/data/ingredients.json.
 * User tables reference dictionary rows by id.
 *
 * JSON columns (activeCategoryIds, etc.) store string[] serialized as text.
 */

// ---- Dictionary (seeded) ----
export const ingredients = sqliteTable("ingredients", {
  id: text("id").primaryKey(),
  term: text("term").notNull(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentGroup: text("parent_group").notNull(),
  classification: text("classification").notNull(),
});

export const categoryIngredient = sqliteTable(
  "category_ingredient",
  {
    categoryId: text("category_id").notNull(),
    ingredientId: text("ingredient_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.categoryId, t.ingredientId] }) })
);

export const quickPacks = sqliteTable("quick_packs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
});

export const quickPackCategory = sqliteTable(
  "quick_pack_category",
  {
    packId: text("pack_id").notNull(),
    categoryId: text("category_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.packId, t.categoryId] }) })
);

// ---- User data ----
export const profiles = sqliteTable("profiles", {
  profileId: text("profile_id").primaryKey(),
  name: text("name").notNull(),
  activeCategoryIds: text("active_category_ids").notNull().default("[]"),
  excludedIngredientIds: text("excluded_ingredient_ids").notNull().default("[]"),
  customIngredients: text("custom_ingredients").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  totalLabelsRead: integer("total_labels_read").notNull().default(0),
  totalRedFlagsCaught: integer("total_red_flags_caught").notNull().default(0),
  totalCleanScans: integer("total_clean_scans").notNull().default(0),
  totalReformulationsCaught: integer("total_reformulations_caught").notNull().default(0),
});

export const pantryItems = sqliteTable("pantry_items", {
  itemId: text("item_id").primaryKey(),
  profileId: text("profile_id").notNull().default(""),
  brandName: text("brand_name").notNull(),
  productName: text("product_name").notNull(),
  imageFilePath: text("image_file_path").notNull().default(""),
  // Replaces originalIngredients (2026-09-14, docs/07 §7.1) — see ProfileSnapshot.
  profileSnapshot: text("profile_snapshot").notNull().default("{}"),
  // When profileSnapshot was recorded (epoch ms): the save time, or the last "Keep Item".
  snapshotAt: integer("snapshot_at").notNull().default(0),
  dateAdded: integer("date_added").notNull(),
  lastVerifiedDate: integer("last_verified_date").notNull(),
  deletedAt: integer("deleted_at"),
});

/** One entry in a Pantry item's scan history (docs/03 §3.2b) — the save and every rescan, append-only,
 * each with the exact time and the profile's red-flag settings used for that scan. */
export const pantryScanHistory = sqliteTable("pantry_scan_history", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  profileId: text("profile_id").notNull().default(""),
  at: integer("at").notNull(),
  kind: text("kind").notNull(), // "saved" | "rescan"
  outcome: text("outcome").notNull().default(""), // "no_red_flags" | "flagged" | "" (for the save)
  matchedTerms: text("matched_terms").notNull().default("[]"),
  profileSnapshot: text("profile_snapshot").notNull().default(""), // ProfileSnapshot JSON, or ""
});

/** One profile-editor mutation (docs/03 §3.2a) — lets a recheck cite exactly
 * when a filter changed, not just that it did. */
export const profileChangeLog = sqliteTable("profile_change_log", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  timestamp: integer("timestamp").notNull(),
  changeType: text("change_type").notNull(),
  categoryId: text("category_id"),
  categoryName: text("category_name"),
  ingredientTerm: text("ingredient_term"),
});

export const stats = sqliteTable("stats", {
  statsId: text("stats_id").primaryKey(),
  freeScansUsed: integer("free_scans_used").notNull().default(0),
  totalLabelsRead: integer("total_labels_read").notNull().default(0),
  totalRedFlagsCaught: integer("total_red_flags_caught").notNull().default(0),
  totalCleanScans: integer("total_clean_scans").notNull().default(0),
  totalReformulationsCaught: integer("total_reformulations_caught").notNull().default(0),
});

// app-level key/value for flags like schemaVersion, hasOnboarded
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
