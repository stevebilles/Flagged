import { sqlite } from "./client";

/** Simple key/value accessors over the app_meta table. */
export function getMetaValue(key: string): string | null {
  const row = sqlite().getFirstSync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

export function setMetaValue(key: string, value: string): void {
  sqlite().runSync(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}
