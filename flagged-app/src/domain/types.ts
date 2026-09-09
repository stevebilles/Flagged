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
}

/** An approved food (docs/03 §3.2). */
export interface PantryItem {
  itemId: string;
  brandName: string;
  productName: string;
  imageFilePath: string;
  originalIngredients: string[];
  dateAdded: number;
  lastVerifiedDate: number;
  deletedAt: number | null;
}

/** Lifetime stats & trial singleton (docs/03 §3.3). */
export interface Stats {
  statsId: string;
  freeScansUsed: number;
  totalLabelsRead: number;
  totalRedFlagsCaught: number;
  totalCleanScans: number;
  /** Pantry rechecks where the surviving ingredients changed order (docs/07). */
  totalSkimpflationCaught: number;
  /** Pantry rechecks where an ingredient was added or removed (docs/07). */
  totalReformulationsCaught: number;
}

export const FREE_SCAN_LIMIT = 10;
export const RECHECK_DAYS = 30;
export const SOFT_DELETE_HOURS = 24;
