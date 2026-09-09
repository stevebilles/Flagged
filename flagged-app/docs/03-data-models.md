# 03 — Data Models & Local Persistence

All persistence is **local** (`expo-sqlite` + Drizzle ORM). This document expresses the original
SwiftData schemas as SQLite/TypeScript models and defines how the bundled dictionary is loaded.

## Two kinds of data

1. **The dictionary (read-only, seeded):** the 11 Quick Packs, 20 categories, and 283 ingredients
   from `assets/data/ingredients.json`. Loaded once on first launch. See `data-schema.md` for the
   file shape and the pack **activation rules**.
2. **User data (read-write):** profiles, custom ingredients, pantry items, and lifetime stats.

Keep them separate. The dictionary tables mirror the seed file; user tables reference dictionary
rows by id.

## Dictionary tables (seeded from `ingredients.json`)

```ts
// ingredients: canonical, de-duplicated (283 rows)
ingredient        { id: text PK, term: text }

// categories: canonical (20 rows)
category          { id: text PK, name: text, parentGroup: text,   // Allergens|Sugars|Additives|Dietary
                    classification: text }                        // regulated|advisory|preference

// category_ingredient: ordered membership (preserves list order)
category_ingredient { categoryId: text FK, ingredientId: text FK, position: int }

// quick_packs: 11 rows
quick_pack        { id: text PK, name: text, type: text }         // simple|composite

// quick_pack_category: which categories a pack activates (ordered)
quick_pack_category { packId: text FK, categoryId: text FK, position: int }
```

## User tables

### 3.1 Profile (User & Profile)

Maps the brief's Profile. One row per family member (multiple profiles supported).

```ts
profile {
  profileId: text PK,          // UUID
  name: text,                  // display name (chip label)
  activeCategoryIds: json,     // string[] — category ids currently ON
  excludedIngredientIds: json, // string[] — user-toggled-OFF individual ingredients
  customIngredients: json,     // string[] — user-typed terms not in the dictionary
  createdAt: int               // epoch ms
}
```

> **Activation model (see `data-schema.md` for the authoritative rules):** selecting a Quick Pack
> turns ON all its categories (adds their ids to `activeCategoryIds`) and, by default, all their
> individual ingredients. Deselecting a pack turns its categories OFF **unless a category still
> belongs to another active pack** (shared categories stay on while any active pack needs them).
> A user can turn an individual ingredient off (add to `excludedIngredientIds`) or a whole category
> off (remove from `activeCategoryIds`). Custom ingredients live in `customIngredients`.
>
> **Effective red-flag set for a profile** =
> (all ingredients in `activeCategoryIds`) − `excludedIngredientIds` + `customIngredients`.

### 3.2 PantryItem (Approved Foods)

```ts
pantryItem {
  itemId: text PK,             // UUID
  brandName: text,
  productName: text,
  imageFilePath: text,         // local URI to compressed thumbnail; exclude from backup
  originalIngredients: json,   // string[] — ordered, exactly as saved from the scan
  dateAdded: int,              // epoch ms
  lastVerifiedDate: int,       // epoch ms — most recent verifying scan; drives 30-day recheck
  deletedAt: int | null        // epoch ms — set for the 24-hour soft-delete window
}
```

- `imageFilePath`: store under app storage; mark excluded from iCloud/backup where the platform
  supports it (thumbnails are regenerable and shouldn't bloat backups).
- `lastVerifiedDate` older than **30 days** → item surfaces in the Pantry "Recheck" section (`05`).
- `deletedAt` set → item is in the **24-hour undo** window; purge permanently after 24h.

### 3.3 Stats (Lifetime Stats & Free Trial) — Singleton

Exactly **one** row per device install.

```ts
stats {
  statsId: text PK,                  // UUID (single row)
  freeScansUsed: int,                // starts 0, caps at 10, triggers hard paywall
  totalLabelsRead: int,              // +1 per successful scan
  totalRedFlagsCaught: int,          // += number of highlighted ingredients on flagged scans
  totalCleanScans: int,              // +1 per clean result
  totalSkimpflationCaught: int,      // +1 per recheck that detects a surviving-ingredient order shift (07)
  totalReformulationsCaught: int     // +1 per recheck that detects an ingredient added or removed (07)
}
```

> `totalSkimpflationCaught` and `totalReformulationsCaught` are driven by the Pantry recheck
> diff engine (`07`). A single recheck may increment **both** (a recipe that both reorders and
> adds/removes ingredients). They increment on the diff result itself, independent of whether
> the change also trips a red flag.

> **What counts as a scan (critical):** `freeScansUsed` increments **only** when a scan successfully
> extracts text and routes to a Results Screen. An aborted/illegible scan does **not** consume a
> free scan (see `06` validation and `08`).

## Seed loading (first launch)

```
On app start:
  if (dictionary tables empty OR stored schemaVersion < ingredients.json schemaVersion):
     parse assets/data/ingredients.json
     upsert ingredients, categories, category_ingredient,
            quick_packs, quick_pack_category
     store schemaVersion
  if (no profile exists):
     create a default profile (name from Settings later; may be created during onboarding)
  if (no stats row):
     create the singleton stats row with all counters = 0
```

- Loading is **idempotent** and **offline**. Re-running must not duplicate rows (upsert by id).
- Future dictionary updates ship as a new bundled file with a higher `schemaVersion`; the loader
  re-seeds dictionary tables **without** touching user tables.

## Referential rules

- User tables reference dictionary rows by **id** (never by display string), so renaming a term in
  a future seed doesn't orphan user selections.
- `customIngredients` are free-text (not in the dictionary) and matched at scan time alongside the
  effective set (see `06`).
