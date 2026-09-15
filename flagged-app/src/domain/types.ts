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
   * Scans/Flags/etc., "All" sums across every profile). Separate from the
   * shared trial counter (Stats.freeScansUsed below), which stays account-wide
   * regardless of how many profiles exist.
   */
  totalLabelsRead: number;
  totalRedFlagsCaught: number;
  totalCleanScans: number;
  /** Pantry rechecks where the surviving ingredients changed order (docs/07). */
  totalSkimpflationCaught: number;
  /** Pantry rechecks where an ingredient was added or removed (docs/07). */
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

/** An approved food (docs/03 §3.2). Belongs to whichever profile scanned it —
 * the Pantry tab filters by profile the same way Home does (docs/17). */
export interface PantryItem {
  itemId: string;
  profileId: string;
  brandName: string;
  productName: string;
  imageFilePath: string;
  originalIngredients: string[];
  dateAdded: number;
  lastVerifiedDate: number;
  deletedAt: number | null;
}

/** Account-wide trial singleton (docs/03 §3.3). Only the shared free-scan
 * counter is still read — the rest were per-account totals that predate
 * per-profile stats and are no longer displayed anywhere. */
export interface Stats {
  statsId: string;
  freeScansUsed: number;
  totalLabelsRead: number;
  totalRedFlagsCaught: number;
  totalCleanScans: number;
  totalSkimpflationCaught: number;
  totalReformulationsCaught: number;
}

export const FREE_SCAN_LIMIT = 10;
export const RECHECK_DAYS = 30;
export const SOFT_DELETE_HOURS = 24;
