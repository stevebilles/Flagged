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
});

export const pantryItems = sqliteTable("pantry_items", {
  itemId: text("item_id").primaryKey(),
  brandName: text("brand_name").notNull(),
  productName: text("product_name").notNull(),
  imageFilePath: text("image_file_path").notNull().default(""),
  originalIngredients: text("original_ingredients").notNull().default("[]"),
  dateAdded: integer("date_added").notNull(),
  lastVerifiedDate: integer("last_verified_date").notNull(),
  deletedAt: integer("deleted_at"),
});

export const stats = sqliteTable("stats", {
  statsId: text("stats_id").primaryKey(),
  freeScansUsed: integer("free_scans_used").notNull().default(0),
  totalLabelsRead: integer("total_labels_read").notNull().default(0),
  totalRedFlagsCaught: integer("total_red_flags_caught").notNull().default(0),
  totalCleanScans: integer("total_clean_scans").notNull().default(0),
});

// app-level key/value for flags like schemaVersion, hasOnboarded
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
