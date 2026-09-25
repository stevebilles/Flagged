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
  ScanHistoryEntry,
  Stats,
} from "../domain/types";

import { RECHECK_DAYS } from "../domain/types";

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
    // 0 = a row from before snapshot_at existed; its snapshot was taken when it was saved.
    snapshotAt: r.snapshot_at || r.date_added,
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

/** Items removed within the last 24 hours (the undo window). Filtered by age HERE, not just when the
 * purge runs — the purge only happens at launch / foreground, and an item removed 30 hours ago must
 * not still show under "Recent Changes" with an Undo. */
export function getRecentlyDeleted(nowMs = Date.now()): PantryItem[] {
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  return sqlite()
    .getAllSync<any>(
      "SELECT * FROM pantry_items WHERE deleted_at IS NOT NULL AND deleted_at >= ? ORDER BY deleted_at DESC",
      [cutoff]
    )
    .map(mapPantry);
}

export function addPantryItem(
  input: Omit<PantryItem, "itemId" | "dateAdded" | "snapshotAt" | "lastVerifiedDate" | "deletedAt">
): PantryItem {
  const now = Date.now();
  // Saved, snapshotted and last-verified are all the same moment: a Pantry save only ever follows
  // a scan that just came back with no red flags for this profile's current filters.
  const item: PantryItem = {
    ...input,
    itemId: randomUUID(),
    dateAdded: now,
    snapshotAt: now,
    lastVerifiedDate: now,
    deletedAt: null,
  };
  sqlite().runSync(
    "INSERT INTO pantry_items (item_id, profile_id, brand_name, product_name, image_file_path, profile_snapshot, snapshot_at, date_added, last_verified_date, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
    [
      item.itemId,
      item.profileId,
      item.brandName,
      item.productName,
      item.imageFilePath,
      JSON.stringify(item.profileSnapshot),
      item.snapshotAt,
      item.dateAdded,
      item.lastVerifiedDate,
    ]
  );
  // The first scan-history entry: the save itself, with the filters it was checked clean under.
  logScan({
    itemId: item.itemId,
    profileId: item.profileId,
    at: item.dateAdded,
    kind: "saved",
    outcome: null,
    matchedTerms: [],
    snapshot: item.profileSnapshot,
  });
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
export function rebaselinePantryItem(itemId: string, snapshot: ProfileSnapshot, atMs: number = Date.now()): void {
  // `atMs` is when the check actually happened (the rescan's timestamp), so the recorded filters
  // are dated to the scan, not to whenever the user tapped a button afterwards.
  // First make sure the ORIGINAL save (and the filters it was checked clean under) is in the scan
  // history — the update below overwrites the item's current snapshot, which would lose them.
  ensureSavedHistoryEntry(itemId);
  sqlite().runSync(
    "UPDATE pantry_items SET profile_snapshot = ?, snapshot_at = ?, last_verified_date = ? WHERE item_id = ?",
    [JSON.stringify(snapshot), atMs, atMs, itemId]
  );
}

/**
 * DEVELOPMENT ONLY — called solely from a `__DEV__`-gated button on the Pantry item screen, so the
 * recheck flow can be tested without waiting 30 days. Backdates the item's last check to just past
 * the recheck window so it shows in Reformulation Checks and lights the Pantry tab's red dot.
 * Touches ONLY `last_verified_date` (not the save time or the recorded red flags).
 */
export function devForceRecheckDue(itemId: string): void {
  const dueSince = Date.now() - (RECHECK_DAYS + 1) * 24 * 60 * 60 * 1000;
  sqlite().runSync("UPDATE pantry_items SET last_verified_date = ? WHERE item_id = ?", [dueSince, itemId]);
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
  // An item's scan history goes with it when it's permanently deleted.
  sqlite().runSync(
    "DELETE FROM pantry_scan_history WHERE item_id IN (SELECT item_id FROM pantry_items WHERE deleted_at IS NOT NULL AND deleted_at < ?)",
    [cutoff]
  );
  sqlite().runSync(
    "DELETE FROM pantry_items WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    [cutoff]
  );
  // Several cards can share one photo (an "All profiles" scan saves a card per profile) — only
  // hand back files no remaining card still points at, or purging one would blank the others.
  const stillUsed = new Set(
    sqlite()
      .getAllSync<{ image_file_path: string }>("SELECT image_file_path FROM pantry_items")
      .map((r) => r.image_file_path)
  );
  return doomed.map((d) => d.image_file_path).filter((p) => Boolean(p) && !stillUsed.has(p));
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

// The three lookups below answer "when did the user change their red flags in a way that explains
// this match?" — so each takes `sinceMs` (the item's snapshotAt) and ignores anything older: an
// edit made BEFORE the product was saved can't be why it's flagging now.

/** Most recent log entry that turned ON a given category for a profile
 * (docs/07 §7.1 recheck attribution) — null if none exists (e.g. the
 * category was already active before this logging system existed). */
export function findCategoryEnabledChange(
  profileId: string,
  categoryId: string,
  sinceMs = 0
): ProfileChangeLogEntry | null {
  const r = sqlite().getFirstSync<any>(
    "SELECT * FROM profile_change_log WHERE profile_id = ? AND category_id = ? AND change_type = 'category_on' AND timestamp >= ? ORDER BY timestamp DESC LIMIT 1",
    [profileId, categoryId, sinceMs]
  );
  return r ? mapChangeLog(r) : null;
}

/** Most recent log entry that added a given custom ingredient term for a
 * profile (docs/07 §7.1 recheck attribution). */
export function findCustomIngredientAddedChange(
  profileId: string,
  term: string,
  sinceMs = 0
): ProfileChangeLogEntry | null {
  const r = sqlite().getFirstSync<any>(
    "SELECT * FROM profile_change_log WHERE profile_id = ? AND ingredient_term = ? AND change_type = 'custom_added' AND timestamp >= ? ORDER BY timestamp DESC LIMIT 1",
    [profileId, term.toLowerCase(), sinceMs]
  );
  return r ? mapChangeLog(r) : null;
}

/** Most recent log entry where the user stopped excluding one ingredient (turned it back on
 * inside a category that was already active). The log stores the ingredient's id in
 * `ingredient_term` for exclude/include entries. */
export function findIngredientIncludedChange(
  profileId: string,
  ingredientId: string,
  sinceMs = 0
): ProfileChangeLogEntry | null {
  const r = sqlite().getFirstSync<any>(
    "SELECT * FROM profile_change_log WHERE profile_id = ? AND ingredient_term = ? AND change_type = 'ingredient_included' AND timestamp >= ? ORDER BY timestamp DESC LIMIT 1",
    [profileId, ingredientId, sinceMs]
  );
  return r ? mapChangeLog(r) : null;
}

// ---------------- Pantry scan history (docs/03 §3.2b) ----------------
// Append-only: one row for the save and one per rescan — when it happened, what it found, and the
// red-flag settings the profile was scanning for. Text only; deleted with the item.

function mapHistory(r: any): ScanHistoryEntry {
  let snapshot: ProfileSnapshot | null = null;
  if (r.profile_snapshot) {
    const s = parse<Partial<ProfileSnapshot>>(r.profile_snapshot);
    snapshot = {
      activeCategoryIds: s.activeCategoryIds ?? [],
      excludedIngredientIds: s.excludedIngredientIds ?? [],
      customIngredients: s.customIngredients ?? [],
    };
  }
  return {
    id: r.id,
    itemId: r.item_id,
    profileId: r.profile_id ?? "",
    at: r.at,
    kind: r.kind,
    outcome: r.outcome === "no_red_flags" || r.outcome === "flagged" ? r.outcome : null,
    matchedTerms: parse<string[]>(r.matched_terms),
    snapshot,
  };
}

export function logScan(entry: Omit<ScanHistoryEntry, "id">): void {
  sqlite().runSync(
    "INSERT INTO pantry_scan_history (id, item_id, profile_id, at, kind, outcome, matched_terms, profile_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      entry.itemId,
      entry.profileId,
      entry.at,
      entry.kind,
      entry.outcome ?? "",
      JSON.stringify(entry.matchedTerms),
      entry.snapshot ? JSON.stringify(entry.snapshot) : "",
    ]
  );
}

/** The "saved" entry for an item that has none in the history (saved before the history existed).
 * Its filters are only known if the item's snapshot has never been re-recorded since the save
 * (`snapshot_at` still equals `date_added`); otherwise they're gone and the entry says so (null). */
function legacySavedEntry(r: any): ScanHistoryEntry {
  const untouched = (r.snapshot_at || r.date_added) === r.date_added;
  return {
    id: `legacy-${r.item_id}`,
    itemId: r.item_id,
    profileId: r.profile_id ?? "",
    at: r.date_added,
    kind: "saved",
    outcome: null,
    matchedTerms: [],
    snapshot: untouched && r.profile_snapshot ? mapPantry(r).profileSnapshot : null,
  };
}

/** Persist the original "saved" entry if the history doesn't have one yet — called before the item's
 * snapshot is overwritten, so the original filters survive. */
function ensureSavedHistoryEntry(itemId: string): void {
  const has = sqlite().getFirstSync<any>(
    "SELECT id FROM pantry_scan_history WHERE item_id = ? AND kind = 'saved' LIMIT 1",
    [itemId]
  );
  if (has) return;
  const r = sqlite().getFirstSync<any>("SELECT * FROM pantry_items WHERE item_id = ?", [itemId]);
  if (!r) return;
  const e = legacySavedEntry(r);
  logScan({
    itemId: e.itemId,
    profileId: e.profileId,
    at: e.at,
    kind: "saved",
    outcome: null,
    matchedTerms: [],
    snapshot: e.snapshot,
  });
}

/** An item's whole scan history, newest first. An item saved before the history existed still gets
 * its "saved" entry (built from the item itself) so it never shows an empty history. */
export function getScanHistory(itemId: string): ScanHistoryEntry[] {
  const rows = sqlite()
    .getAllSync<any>("SELECT * FROM pantry_scan_history WHERE item_id = ?", [itemId])
    .map(mapHistory);
  if (!rows.some((e) => e.kind === "saved")) {
    const r = sqlite().getFirstSync<any>("SELECT * FROM pantry_items WHERE item_id = ?", [itemId]);
    if (r) rows.push(legacySavedEntry(r));
  }
  return rows.sort((a, b) => b.at - a.at);
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
