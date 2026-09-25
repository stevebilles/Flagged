/** Shared domain types. Mirrors the seed shape (docs/data-schema.md) and the
 *  local DB models (docs/03-data-models.md). */

export type ParentGroup = "Allergens" | "Sugars" | "Additives" | "Dietary";
export type Classification = "regulated" | "advisory" | "preference";
export type QuickPackType = "simple" | "composite";

export interface Ingredient {
  id: string;
  term: string;
}

export interface Category {
  id: string;
  name: string;
  parentGroup: ParentGroup;
  classification: Classification;
  ingredientIds: string[];
}

export interface QuickPack {
  id: string;
  name: string;
  type: QuickPackType;
  categoryIds: string[];
}

export interface SeedFile {
  schemaVersion: number;
  meta: {
    description: string;
    parentGroups: ParentGroup[];
    classifications: Classification[];
    counts: { ingredients: number; categories: number; quickPacks: number };
  };
  ingredients: Ingredient[];
  categories: Category[];
  quickPacks: QuickPack[];
}

/** A user's red-flag profile (docs/03 §3.1). */
export interface Profile {
  profileId: string;
  name: string;
  activeCategoryIds: string[];
  excludedIngredientIds: string[];
  customIngredients: string[];
  createdAt: number;
  /**
   * Per-profile dashboard counters (docs/17 Home mockup — each profile's own
   * Scans/Flags/etc., "All" sums across every profile).
   */
  totalLabelsRead: number;
  totalRedFlagsCaught: number;
  totalCleanScans: number;
  /** Pantry rechecks where a match is attributed to reformulation, not just
   * a filter change (docs/07 §7.1). Skimpflation detection was retired
   * 2026-09-14 — it required the old ingredient order, which the recheck
   * redesign no longer stores. */
  totalReformulationsCaught: number;
}

/**
 * Label to show wherever a profile's name is DISPLAYED (Home, alerts, scan
 * context, the "All" scan's per-term attribution) when it hasn't been named
 * yet. Profile.name itself is allowed to stay empty — that's what lets the
 * editor's name field show its "Profile name..." placeholder instead of
 * literal text the user has to delete before typing their own. Never use
 * this for the editable field itself, only for read-only display.
 */
export function displayName(name: string): string {
  return name.trim() || "New Profile";
}

/** The exact inputs to a profile's effective red-flag set (docs/03 §3.2),
 * frozen at Pantry-save time. Replaces storing the scanned ingredient text
 * itself (2026-09-14, docs/07 §7.1) — OCR text proved too inconsistent
 * run-to-run to diff reliably, so the recheck instead compares "what was
 * being screened for" then vs. now. */
export interface ProfileSnapshot {
  activeCategoryIds: string[];
  excludedIngredientIds: string[];
  customIngredients: string[];
}

/** A product saved to the Pantry after a scan found no red flags (docs/03 §3.2). Saving is a
 * bookmark, never a safety claim. Belongs to whichever profile scanned it —
 * the Pantry tab filters by profile the same way Home does (docs/17). Always
 * recheck against `profileId`, never whichever profile is globally active. */
export interface PantryItem {
  itemId: string;
  profileId: string;
  brandName: string;
  productName: string;
  imageFilePath: string;
  profileSnapshot: ProfileSnapshot;
  dateAdded: number;
  /** When `profileSnapshot` was recorded (epoch ms) — the save time, or the time of the last
   * "Keep Item" (which re-records it). A recheck only counts profile edits made AFTER this as
   * an explanation for a new red flag. Rows saved before this existed read as `dateAdded`. */
  snapshotAt: number;
  lastVerifiedDate: number;
  deletedAt: number | null;
}

/** One entry in a Pantry item's scan history (docs/03 §3.2b) — append-only: the save itself
 * (`kind: "saved"`) and every rescan after it (`kind: "rescan"`), each with the exact time and the
 * red-flag settings the profile was scanning for at that moment. This is what lets the user go back
 * to "the filters I used when this first came back clean" even after later clean rescans re-record
 * the item's current baseline. Text only. */
export interface ScanHistoryEntry {
  id: string;
  itemId: string;
  profileId: string;
  /** When the scan happened (epoch ms). */
  at: number;
  kind: "saved" | "rescan";
  /** Rescans only (null for the save). */
  outcome: "no_red_flags" | "flagged" | null;
  /** The red-flag terms a flagged rescan matched. */
  matchedTerms: string[];
  /** The profile's settings used for this scan; null when they weren't recorded (an entry from
   * before this history existed). */
  snapshot: ProfileSnapshot | null;
}

/** One profile-editor mutation (docs/03 §3.2a) — written at every `persist()`
 * call in the profile editor so a recheck can cite exactly *when* a filter
 * changed, not just that it did. Purely additive; never edited or deleted. */
export type ProfileChangeType =
  | "category_on"
  | "category_off"
  | "ingredient_excluded"
  | "ingredient_included"
  | "custom_added"
  | "custom_removed";

export interface ProfileChangeLogEntry {
  id: string;
  profileId: string;
  timestamp: number;
  changeType: ProfileChangeType;
  categoryId: string | null;
  categoryName: string | null;
  ingredientTerm: string | null;
}

/** Account-wide legacy singleton (docs/03 §3.3) — predates per-profile stats.
 * `freeScansUsed` was the 10-free-scan trial gate, retired 2026-09-21 in
 * favor of a RevenueCat/App Store 7-day free trial (real entitlement status,
 * not a local counter); the column stays in the DB (no migration needed)
 * but nothing reads or writes it anymore. Nothing else here is displayed
 * anywhere either. */
export interface Stats {
  statsId: string;
  freeScansUsed: number;
  totalLabelsRead: number;
  totalRedFlagsCaught: number;
  totalCleanScans: number;
  totalReformulationsCaught: number;
}

export const RECHECK_DAYS = 30;
export const SOFT_DELETE_HOURS = 24;
