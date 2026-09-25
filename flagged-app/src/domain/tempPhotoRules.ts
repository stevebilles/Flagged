/**
 * Pure rules for cleaning up the temporary photos a scan leaves behind (docs/06). No native or
 * database imports, so it's unit-tested; `tempPhotos.ts` does the actual file/DB work.
 *
 * Why: scanning writes several full-size photos to the phone's temp/cache folders (the camera's
 * original, the cropped copy the OCR reads, the image picker's copy, the full-quality source of a
 * Pantry thumbnail). Once the text has been read they're dead weight — a heavy user would collect
 * hundreds. We keep them briefly (in case the user is still mid-workflow), then delete them.
 */

/** How long a temporary photo is kept after it's captured before it's deleted. */
export const TEMP_PHOTO_TTL_MS = 20 * 60 * 1000;

/** A file we couldn't delete for this long is dropped from the list (stop retrying forever). */
export const TEMP_PHOTO_GIVE_UP_MS = 24 * 60 * 60 * 1000;

export interface TempPhotoEntry {
  uri: string;
  /** When it was captured/registered (epoch ms). */
  at: number;
}

const stripScheme = (u: string): string => u.replace(/^file:\/\//, "");

/**
 * True only for a file inside one of the app's OWN temp/cache folders (`roots`). It refuses
 * anything else — the Pantry thumbnails (documents folder), the user's photo library, `..` tricks —
 * so the cleanup can never delete something that isn't a scan leftover.
 */
export function isDeletableTempPath(uri: string, roots: string[]): boolean {
  const path = stripScheme(uri);
  if (!path || path.includes("..") || path.includes("/pantry/")) return false;
  return roots.some((r) => {
    const root = stripScheme(r);
    return root.length > 1 && path.startsWith(root);
  });
}

/**
 * Split the registered photos into those due for deletion (kept at least `ttlMs`) and the rest.
 * A photo stamped in the future (device clock moved backwards) is never "expired" — it just waits.
 */
export function splitExpired(
  entries: readonly TempPhotoEntry[],
  nowMs: number,
  ttlMs: number = TEMP_PHOTO_TTL_MS
): { expired: TempPhotoEntry[]; remaining: TempPhotoEntry[] } {
  const expired: TempPhotoEntry[] = [];
  const remaining: TempPhotoEntry[] = [];
  for (const e of entries) {
    (nowMs - e.at >= ttlMs ? expired : remaining).push(e);
  }
  return { expired, remaining };
}
