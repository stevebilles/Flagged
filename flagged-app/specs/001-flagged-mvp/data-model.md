# Phase 1 Data Model — Flagged V1 MVP

All storage is local SQLite (`expo-sqlite` + Drizzle), defined in `src/db/schema.ts`, mapped
to the domain types in `src/domain/types.ts`. JSON columns hold `string[]` serialized as
text. Authoritative product reference: `docs/03-data-models.md` and `docs/data-schema.md`.

Two data classes, kept separate:
1. **Dictionary** — read-only, seeded once from `assets/data/ingredients.json`.
2. **User data** — read/write: profiles, pantry items, stats, and `app_meta` flags.

---

## Dictionary entities (seeded, read-only)

### Ingredient
| Field | Type | Notes |
|---|---|---|
| id | text PK | stable slug, e.g. `ing-red-40` |
| term | text | canonical lowercase term, unique; 283 rows |

### Category
| Field | Type | Notes |
|---|---|---|
| id | text PK | e.g. `cat-artificial-dyes`; 20 rows |
| name | text | display name |
| parentGroup | text | `Allergens` \| `Sugars` \| `Additives` \| `Dietary` |
| classification | text | `regulated` \| `advisory` \| `preference` (drives the badge, display-only) |

### CategoryIngredient (ordered membership)
| Field | Type | Notes |
|---|---|---|
| categoryId | text FK | → Category.id |
| ingredientId | text FK | → Ingredient.id |
| position | int | preserves label order |
| — | PK | (categoryId, ingredientId) |

### QuickPack
| Field | Type | Notes |
|---|---|---|
| id | text PK | e.g. `pack-big-9-allergens`; 11 rows |
| name | text | display name |
| type | text | `simple` \| `composite` |

### QuickPackCategory (ordered)
| Field | Type | Notes |
|---|---|---|
| packId | text FK | → QuickPack.id |
| categoryId | text FK | → Category.id |
| position | int | order |
| — | PK | (packId, categoryId) |

**Seed rules** (`src/bootstrap/init.ts` + `src/db/seed.ts`):
- On launch, if dictionary tables are empty **or** stored `schemaVersion` <
  `ingredients.json` `schemaVersion` → parse and **upsert by id** (idempotent, offline).
- Re-seeding a newer dictionary MUST NOT touch user tables.
- Shared categories/terms are defined once and referenced by id (never by display string).

---

## User entities (read/write)

### Profile
| Field | Type | Validation / rules |
|---|---|---|
| profileId | text PK | UUID |
| name | text | trimmed; may be empty at creation, defaults to a placeholder chip label; set from onboarding name screen or Settings |
| activeCategoryIds | json `string[]` | category ids currently ON; managed by activation rules below |
| excludedIngredientIds | json `string[]` | individual ingredients toggled OFF within an otherwise-active category |
| customIngredients | json `string[]` | trimmed, lowercased, de-duplicated free-text terms not in the dictionary |
| createdAt | int | epoch ms |

**Activation rules** (`src/domain/activation.ts`, authoritative in `docs/data-schema.md`):
1. Select Quick Pack → add all its `categoryIds` to `activeCategoryIds`.
2. Deselect Quick Pack → remove its categories **except** any still required by another pack
   that was fully active before the deselection (protects shared categories).
3. Toggle category → add/remove that one id.
4. Toggle ingredient off → add its id to `excludedIngredientIds` (category stays active).
5. Custom ingredient → append to `customIngredients` if non-empty and not already present.

**Effective red-flag set** (consumed by the matcher):
`union(ingredients of activeCategoryIds) − excludedIngredientIds + customIngredients`,
lowercased.

**Multiplicity**: ≥ 1 profile per install. Exactly one is "active" at a time (id held in
`app_meta.activeProfileId` and mirrored in `appStore`).

### PantryItem
| Field | Type | Validation / rules |
|---|---|---|
| itemId | text PK | UUID |
| brandName | text | required, trimmed |
| productName | text | required, trimmed |
| imageFilePath | text | local URI to a compressed thumbnail; directory excluded from backup; may be empty only in a degraded-permission fallback |
| originalIngredients | json `string[]` | ordered, exactly as scanned when saved (or when last "Kept" after a change) |
| dateAdded | int | epoch ms |
| lastVerifiedDate | int | epoch ms; set to now on save and on every "Keep"/"identical" recheck |
| deletedAt | int \| null | epoch ms when soft-deleted; else null |

**State transitions**:

```
                       save from Clean result
        (none) ─────────────────────────────────▶ ACTIVE (in grid)
                                                    │
        now − lastVerifiedDate > 30 days            │
                                                    ▼
                                              RECHECK-DUE (in recheck list)
                                                    │  user re-scans a NEW box
                          ┌─────────────────────────┼─────────────────────────┐
                identical │                changed, no red flags │      changed + red flag
                          ▼                         ▼                         ▼
                    ACTIVE (grid),           "Recipe Change Detected"   Alert Red screen
             lastVerifiedDate = now          (orange) → Keep / Delete   → Delete / Keep
                                                    │                         │
                              Keep: originalIngredients = new,                │
                              lastVerifiedDate = now  ──▶ ACTIVE              │
                                                    │                         │
                              Delete ───────────────┴─────────────────────────┘
                                                    ▼
                                            SOFT-DELETED (deletedAt set; in 24h undo log)
                                              │                     │
                                    Undo within 24h        now − deletedAt > 24h
                                              ▼                     ▼
                                           ACTIVE              PURGED (row + thumbnail removed)
```

- Elapsed-time comparisons clamp negatives to 0 (R8): a backwards clock never makes an item
  "due" or "purgeable" early.
- Purge runs on app open and on Pantry view.

### Stats (singleton — exactly one row per install)
| Field | Type | Rules |
|---|---|---|
| statsId | text PK | fixed UUID, single row created at bootstrap |
| freeScansUsed | int | starts 0; `min(10, +1)` per successful scan **only when not premium**; never decremented |
| totalLabelsRead | int | +1 per successful scan (incl. rechecks) |
| totalRedFlagsCaught | int | += number of highlighted ingredients on a flagged result / flagged recheck |
| totalCleanScans | int | +1 per clean result |
| **totalSkimpflationCaught** | int | **NEW** — +1 per recheck where `orderShifted` is true |
| **totalReformulationsCaught** | int | **NEW** — +1 per recheck where `added` or `removed` is non-empty |

- "Successful scan" = extraction succeeded and a result screen (or recheck result) was
  reached. Illegible/aborted captures change nothing.
- A single recheck may increment `totalSkimpflationCaught` **and**
  `totalReformulationsCaught`; an "identical" recheck increments neither.

**Migration (additive, non-destructive)**: add `total_skimpflation_caught` and
`total_reformulations_caught` INTEGER NOT NULL DEFAULT 0 to the `stats` table; existing rows
keep their other counters. Bump the app's internal DB migration marker, not the dictionary
`schemaVersion`.

### AppMeta (key/value flags)
| Key | Meaning |
|---|---|
| schemaVersion | dictionary seed version loaded |
| dbMigration | internal schema migration marker (bumped for the stats columns) |
| hasOnboarded | `"1"` once the 7-screen flow completes |
| activeProfileId | id of the active profile |
| firstName | the Home-greeting name (also settable in Settings) |
| cachedPremium | `"1"`/`"0"` — synchronous offline entitlement read |
| premiumSince | epoch ms of first premium detection (review Habit trigger) |
| flaggedIngredientsSeen | cumulative count (review Aha trigger) |
| reviewAhaFired / reviewHabitFired | `"1"` once fired, so it never repeats |

---

## Transient (not persisted)

### ScanResult
`{ tokens: string[]; matches: Match[]; isClean: boolean }` — output of
`matchParagraph`. Handed to the results route via `appStore.lastScan`; its only durable
effects are stats, an optional new `PantryItem`, or an updated recheck baseline.

### Match
`{ token: string; term: string; kind: "exact" | "fuzzy"; score: number }` — one per matched
red-flag term; longer phrase matches suppress contained shorter matches.

### DiffResult / RecheckOutcome
`DiffResult { added, removed, orderShifted, changed }`;
`RecheckOutcome = identical | changed_safe(diff) | changed_flagged(diff, matches)`
— output of `evaluateRecheck` in `src/domain/diffEngine.ts`.

---

## Trial / entitlement state (derived, not a table)

```
isPremium = appMeta.cachedPremium === "1"           // synchronous, offline-safe
canScan   = isPremium || stats.freeScansUsed < 10
showMeter = !isPremium
locked    = !isPremium && stats.freeScansUsed >= 10  // Scan tab State 2
```

Transitions: `TRIAL (0–9 used)` → `LOCKED (10 used)` → `PREMIUM` (after purchase/restore;
irreversible on-device; meter and lock hidden everywhere).
