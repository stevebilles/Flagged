import React, { useState } from "react";
import { Image } from "react-native";
import { useTheme } from "./ThemeProvider";

/**
 * A Pantry item's saved product photo, square, for carrying the visual through a workflow (the
 * recheck screens). Renders nothing when there's no photo or it can't be read — so a product without
 * one just looks like it did before. It only DISPLAYS the existing saved file; nothing is copied.
 */
export function ProductPhoto({ uri, size }: { uri: string | null | undefined; size: number }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return null;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size <= 64 ? t.radius.sm : t.radius.md }}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}
