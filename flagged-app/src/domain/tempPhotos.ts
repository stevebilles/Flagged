import * as FileSystem from "expo-file-system";
import { getMetaValue, setMetaValue } from "../db/appMeta";
import {
  TEMP_PHOTO_GIVE_UP_MS,
  TEMP_PHOTO_TTL_MS,
  isDeletableTempPath,
  splitExpired,
  type TempPhotoEntry,
} from "./tempPhotoRules";

/**
 * Deletes the temporary photos a scan leaves behind, ~20 minutes after they were taken (owner's
 * rule, 2026-09-25: a power user must never end up with hundreds of ingredient-list snapshots
 * eating storage). See `tempPhotoRules.ts` for the rules and why.
 *
 * How: every temp photo is `registerTempPhoto`d when it's captured (persisted in `app_meta` so it
 * survives the app being closed). `sweepTempPhotos` deletes the ones past the TTL — it runs at
 * launch, when the app returns to the foreground, and ~20 min after each capture while the app
 * stays open. Only files WE registered, inside the app's own temp/cache folders, are ever touched.
 * The Pantry thumbnails (the documents folder) are never registered and never deleted here.
 */

const KEY = "tempScanPhotos";

/** The app's own temp + cache folders (iOS: `Library/Caches/` and `tmp/`). */
function tempRoots(): string[] {
  const cache = FileSystem.cacheDirectory;
  if (!cache) return [];
  const roots = [cache];
  const appRoot = cache.replace(/Library\/Caches\/?$/, "");
  if (appRoot !== cache) roots.push(`${appRoot}tmp/`);
  return roots;
}

function load(): TempPhotoEntry[] {
  try {
    const parsed = JSON.parse(getMetaValue(KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((e): e is TempPhotoEntry => typeof e?.uri === "string" && typeof e?.at === "number")
      : [];
  } catch {
    return [];
  }
}

function save(list: TempPhotoEntry[]): void {
  setMetaValue(KEY, JSON.stringify(list));
}

/** Record a temporary photo so it gets deleted ~20 minutes from now. Ignores anything that isn't
 * inside the app's own temp/cache folders (so it can't be pointed at a real file by mistake). */
export function registerTempPhoto(uri: string | null | undefined): void {
  if (!uri || !isDeletableTempPath(uri, tempRoots())) return;
  const list = load();
  if (!list.some((e) => e.uri === uri)) list.push({ uri, at: Date.now() });
  save(list);
  // While the app stays open, sweep just after the TTL. If it doesn't, the launch / foreground
  // sweeps pick it up — the registry is persisted.
  setTimeout(() => void sweepTempPhotos(), TEMP_PHOTO_TTL_MS + 5000);
}

/** Delete every registered temp photo that has been kept at least the TTL. Best-effort: a file that
 * can't be deleted is retried on the next sweep, for up to a day. */
export async function sweepTempPhotos(nowMs: number = Date.now()): Promise<void> {
  const { expired } = splitExpired(load(), nowMs);
  if (expired.length === 0) return;
  const done = new Set<string>();
  for (const e of expired) {
    try {
      await FileSystem.deleteAsync(e.uri, { idempotent: true });
      done.add(e.uri);
    } catch {
      if (nowMs - e.at >= TEMP_PHOTO_GIVE_UP_MS) done.add(e.uri); // give up on it
    }
  }
  // Re-read: new photos may have been registered while we were awaiting deletes.
  save(load().filter((e) => !done.has(e.uri)));
}
