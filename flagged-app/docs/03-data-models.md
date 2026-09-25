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
  createdAt: int,              // epoch ms
  // Per-profile dashboard counters (Home "Protection Summary", 2026-09-14 —
  // moved off the old account-wide Stats singleton; "All" sums these across
  // every profile rather than sharing one global counter):
  totalLabelsRead: int,             // +1 per successful scan (incl. rechecks)
  totalRedFlagsCaught: int,         // += number of matches on a flagged scan
  totalCleanScans: int,             // +1 per clean scan result
  totalReformulationsCaught: int    // +1 per recheck that surfaces a new match (07 §7.1)
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

### 3.2 PantryItem (a saved Pantry product)

```ts
pantryItem {
  itemId: text PK,             // UUID
  profileId: text,             // which profile this card belongs to (Pantry filters by profile)
  brandName: text,
  productName: text,
  imageFilePath: text,         // local URI to compressed thumbnail; exclude from backup
  profileSnapshot: json,       // ProfileSnapshot — see below (07 §7.1, 2026-09-14)
  dateAdded: int,              // epoch ms — when the user saved it
  snapshotAt: int,             // epoch ms — when profileSnapshot was recorded: the save time, or the last recheck (a clean rescan or "Keep Item") (2026-09-25)
  lastVerifiedDate: int,       // epoch ms — most recent verifying scan; drives 30-day recheck
  deletedAt: int | null        // epoch ms — set for the 24-hour soft-delete window
}
```

- `imageFilePath`: store under app storage; mark excluded from iCloud/backup where the platform
  supports it (thumbnails are regenerable and shouldn't bloat backups).
- `lastVerifiedDate` older than **30 days** → item surfaces in the Pantry "Recheck" section (`05`).
- `deletedAt` set → item is in the **24-hour undo** window; purge permanently after 24h.
- **`profileSnapshot` replaces the old `originalIngredients` (2026-09-14).** The app no longer
  stores or diffs raw ingredient text — real-device testing found OCR text too inconsistent
  (spelling variance run-to-run) to reliably diff two scans of the same product. Instead, since a
  Pantry save only ever happens on a **clean** result, the snapshot records **what was being
  screened for** at save time — the exact inputs to that profile's effective red-flag set:
  ```ts
  ProfileSnapshot {
    activeCategoryIds: string[],
    excludedIngredientIds: string[],
    customIngredients: string[]
  }
  ```
  See `07` §7.1 for how this drives the recheck comparison, and 3.2a below for the change log that
  lets a recheck cite *when* a filter changed, not just that it did.
- **`snapshotAt` (2026-09-25).** The snapshot is only meaningful with the moment it was taken.
  Set to the save time by `addPantryItem` and moved forward by `rebaselinePantryItem` — on a **clean rescan**
  (which re-records the filters as of that scan) and on "Keep Item" — to the rescan's own timestamp.
  A recheck only counts profile edits made **at or after** `snapshotAt` as an explanation for a new
  red flag — an edit from before the item was saved can't be why it's flagging now. Rows from before
  the column existed read as `dateAdded`.
- **One card per profile.** A clean "All profiles" scan saves a separate card for each profile it
  was run for, each tagged to that profile and carrying that profile's own snapshot (they share one
  photo file; the purge never deletes a photo another card still uses).

### 3.2a ProfileChangeLog (2026-09-14)

One row per profile-editor mutation (a category toggled, an ingredient excluded/included, a
custom ingredient added/removed) — written at every `persist()` call in the profile editor by
diffing the profile before/after. Purely additive, never edited or deleted; exists so a recheck can
tell the user *when* a filter changed rather than just that it did (07 §7.1).

```ts
profileChangeLog {
  id: text PK,             // UUID
  profileId: text,         // which profile changed
  timestamp: int,          // epoch ms
  changeType: text,        // category_on | category_off | ingredient_excluded | ingredient_included | custom_added | custom_removed
  categoryId: text | null, // set for category_on/category_off
  categoryName: text | null, // denormalized display name (categories are static, safe to copy)
  ingredientTerm: text | null // custom_added/removed: the term. ingredient_excluded/included: the ingredient's ID (not its term)
}
```

### 3.2b PantryScanHistory (2026-09-25)

The item's **scan history** — one append-only row for the save itself and one for every rescan after
it, so the app can always say exactly when an item was scanned, what came back, and **which red-flag
settings the profile was scanning for at that moment**. The owner's reason: a clean rescan re-records
the item's *current* baseline (`pantryItem.profileSnapshot` / `snapshotAt`), which would otherwise
overwrite the filters the product first came back clean under; the history keeps them, so the user can
go back and see exactly what they were scanning for at any scan. Shown on the Scan History screen
(`05`); the item screen shows the running total ("N scans" — the save counts as the first). Together
with `snapshotAt` and the `profileChangeLog` (when the profile was edited), it's the timeline a
recheck explains itself with (07 §7.1). Text only, a few hundred bytes per row; deleted with the item.

```ts
pantryScanHistory {
  id: text PK,              // UUID
  itemId: text,             // the pantryItem
  profileId: text,          // the item's own profile
  at: int,                  // epoch ms — the save time, or when the rescan was captured
  kind: text,               // saved | rescan
  outcome: text,            // rescans: no_red_flags | flagged; "" for the save
  matchedTerms: json,       // string[] — the red-flag terms a flagged rescan matched
  profileSnapshot: json     // ProfileSnapshot — the settings used for this scan; "" if not recorded
}
```
- Written by `addPantryItem` (the `saved` row) and by the recheck-result screen when it opens (a
  `rescan` row). Before any re-recording of an item's baseline, `ensureSavedHistoryEntry` persists the
  original `saved` row (so it survives). An item saved before this table existed still shows a `saved`
  entry (built from the item); its filters are known only if its baseline was never re-recorded since.

**Timestamp rule (owner, 2026-09-25):** anything a user does that could later explain a result is
stored with an exact epoch-ms timestamp — profile edits (`profileChangeLog`), saving to the Pantry
(`dateAdded`), recording an item's red flags (`snapshotAt`), removing an item (`deletedAt`), and
every scan (`pantryScanHistory.at`, `lastVerifiedDate`). Never overwrite history; append.

### 3.3 Stats — legacy singleton (retired)

One row per device install, kept only for backward compatibility. Every dashboard counter lives
per-profile on `Profile` (3.1); the trial is now a real store entitlement (RevenueCat, see `08`),
not a local counter. **Nothing reads or writes this table's counters** (`saveStats` has no
callers, and the review schedule in `10` no longer uses it).

```ts
stats {
  statsId: text PK,               // UUID (single row, created on first launch)
  freeScansUsed: int,             // retired 2026-09-21 (was the 10-scan gate); unused
  totalLabelsRead: int,           // legacy, not updated — per-profile counters replaced these
  totalRedFlagsCaught: int,       // legacy, not updated
  totalCleanScans: int,           // legacy, not updated
  totalReformulationsCaught: int  // legacy, not updated
}
```

> **What counts as a scan (critical):** a scan's per-profile counters (`totalLabelsRead`, etc.)
> are committed **only** when a scan successfully extracts text and routes to a Results Screen.
> An aborted/illegible scan commits nothing (see `06` validation).
>
> The old `total_skimpflation_caught` column may still exist in installed databases (and in the
> `CREATE TABLE` in `src/db/client.ts`); it is retired and unused.

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
