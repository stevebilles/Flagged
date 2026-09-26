import React from "react";
import { View } from "react-native";
import { Text, withAlpha } from "./components";
import { useTheme } from "./ThemeProvider";

/** A red-flag filter as a small pill: neutral, or — for a filter the user ADDED since the last check —
 * highlighted in cyan and prefixed with "+". Used by the rescan's "Why is this flagging now?" card and
 * the scan result's "What we checked for" card. Text only — no checkmark (a check beside a filter name
 * would read as "verified free of it", which a scan can't promise; CLAUDE.md wording rule). */
export function FilterPill({ label, added }: { label: string; added?: boolean }) {
  const t = useTheme();
  const tint = added ? t.colors.cyan : t.colors.textMuted;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: withAlpha(tint, added ? 0.6 : 0.4),
        backgroundColor: withAlpha(tint, 0.12),
        borderRadius: t.radius.pill,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text variant="subheadline" bold={added} tone={added ? "cyan" : "muted"}>
        {added ? `+ ${label}` : label}
      </Text>
    </View>
  );
}
