import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/**
 * Pantry thumbnails (docs/03/07). The front-of-pack photo is compressed to a
 * small local JPEG; only its URI is stored on the pantry item. Everything is
 * on-device — nothing is uploaded.
 *
 * NOTE: iOS backup-exclusion (`NSURLIsExcludedFromBackupKey`) is not exposed by
 * the classic expo-file-system API; a tiny native config plugin is still needed
 * to fully satisfy FR-015. Thumbnails are regenerable, so this is a
 * backup-size concern, not a data-loss one. Tracked as a follow-up.
 */

const DIR = FileSystem.documentDirectory + "pantry/";

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
}

/** Compress + store a source image; returns the local file URI. */
export async function storeThumbnail(sourceUri: string): Promise<string> {
  await ensureDir();
  const out = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: 600 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
  );
  const dest = `${DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.moveAsync({ from: out.uri, to: dest });
  return dest;
}

/**
 * Open the camera for the "front of the packaging" shot and store a thumbnail.
 * Returns the local URI, or null if permission was denied or the user cancelled.
 */
export async function captureFrontOfPackThumbnail(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const shot = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
  });
  if (shot.canceled || !shot.assets?.[0]?.uri) return null;
  return storeThumbnail(shot.assets[0].uri);
}

/** Delete a stored thumbnail (best-effort; only touches our own directory). */
export async function deleteThumbnail(uri: string): Promise<void> {
  if (!uri || !uri.startsWith(DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // regenerable — ignore
  }
}
