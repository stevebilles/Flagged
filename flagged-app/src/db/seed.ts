import { randomUUID } from "expo-crypto";
import { sqlite, ensureTables, runMigrations } from "./client";
import type { SeedFile } from "../domain/types";
import { FREE_SCAN_LIMIT } from "../domain/types";

// Bundled dictionary (docs/data-schema.md). Parsed into SQLite on first launch.
import seedJson from "../../assets/data/ingredients.json";

const seed = seedJson as unknown as SeedFile;

const META_SCHEMA_VERSION = "schemaVersion";

function getMeta(key: string): string | null {
  const row = sqlite().getFirstSync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  sqlite().runSync(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

/**
 * Idempotent, offline first-launch seed (docs/03).
 *  - creates tables
 *  - loads the dictionary if empty or the bundled schemaVersion is newer
 *  - ensures the stats singleton and a default profile exist
 * Re-seeding the dictionary never touches user tables.
 */
export function initializeDatabase(): void {
  ensureTables();
  runMigrations();

  const storedVersion = Number(getMeta(META_SCHEMA_VERSION) ?? "0");
  if (storedVersion < seed.schemaVersion) {
    seedDictionary();
    setMeta(META_SCHEMA_VERSION, String(seed.schemaVersion));
  }

  ensureStatsSingleton();
  ensureDefaultProfile();
}

function seedDictionary(): void {
  const s = sqlite();
  s.withTransactionSync(() => {
    // Dictionary is read-only; clear + reload so a newer bundle fully replaces it.
    s.execSync("DELETE FROM quick_pack_category;");
    s.execSync("DELETE FROM quick_packs;");
    s.execSync("DELETE FROM category_ingredient;");
    s.execSync("DELETE FROM categories;");
    s.execSync("DELETE FROM ingredients;");

    for (const ing of seed.ingredients) {
      s.runSync("INSERT INTO ingredients (id, term) VALUES (?, ?)", [ing.id, ing.term]);
    }
    for (const cat of seed.categories) {
      s.runSync(
        "INSERT INTO categories (id, name, parent_group, classification) VALUES (?, ?, ?, ?)",
        [cat.id, cat.name, cat.parentGroup, cat.classification]
      );
      cat.ingredientIds.forEach((ingId, i) => {
        s.runSync(
          "INSERT INTO category_ingredient (category_id, ingredient_id, position) VALUES (?, ?, ?)",
          [cat.id, ingId, i]
        );
      });
    }
    for (const pack of seed.quickPacks) {
      s.runSync("INSERT INTO quick_packs (id, name, type) VALUES (?, ?, ?)", [
        pack.id,
        pack.name,
        pack.type,
      ]);
      pack.categoryIds.forEach((catId, i) => {
        s.runSync(
          "INSERT INTO quick_pack_category (pack_id, category_id, position) VALUES (?, ?, ?)",
          [pack.id, catId, i]
        );
      });
    }
  });
}

function ensureStatsSingleton(): void {
  const s = sqlite();
  const row = s.getFirstSync<{ c: number }>("SELECT COUNT(*) as c FROM stats");
  if (!row || row.c === 0) {
    s.runSync(
      "INSERT INTO stats (stats_id, free_scans_used, total_labels_read, total_red_flags_caught, total_clean_scans, total_skimpflation_caught, total_reformulations_caught) VALUES (?, 0, 0, 0, 0, 0, 0)",
      [randomUUID()]
    );
  }
}

function ensureDefaultProfile(): void {
  const s = sqlite();
  const row = s.getFirstSync<{ c: number }>("SELECT COUNT(*) as c FROM profiles");
  if (!row || row.c === 0) {
    s.runSync(
      "INSERT INTO profiles (profile_id, name, active_category_ids, excluded_ingredient_ids, custom_ingredients, created_at) VALUES (?, ?, '[]', '[]', '[]', ?)",
      [randomUUID(), "Family Flags", Date.now()]
    );
  }
}

export { FREE_SCAN_LIMIT };
