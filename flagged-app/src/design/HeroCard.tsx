import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, withAlpha } from "./components";
import { useTheme } from "./ThemeProvider";

/**
 * The result's headline card (owner's compact redesign, 2026-09-25): an icon in a circle on the left,
 * the headline (and an optional line under it) beside it — a fraction of the height of the old big
 * centered stamp, so the content below starts higher. Shared by every result screen: the scan result
 * (`app/results.tsx`) and the rescan result (`app/recheck-result.tsx`). Cyan + a checkmark for "no red
 * flags", red + a flag for "red flags". Only an icon inside the circle — never a digit (CLAUDE.md).
 * Everything in the card is one style: the headline and the line under it are the same size, bold
 * weight and color (owner, 2026-09-25) — no half-bold text, no muted or profile-colored words.
 */
export function HeroCard({
  tone,
  icon,
  title,
  subtitle,
}: {
  tone: "cyan" | "red";
  icon: "checkmark" | "flag";
  title: string;
  subtitle?: string;
}) {
  const t = useTheme();
  const color = tone === "cyan" ? t.colors.cyan : t.colors.red;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.spacing.md,
        padding: t.spacing.md,
        borderRadius: t.radius.md,
        borderWidth: 1,
        borderColor: withAlpha(color, 0.35),
        backgroundColor: withAlpha(color, 0.1),
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          borderWidth: 2,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title" bold tone={tone}>{title}</Text>
        {/* Identical to the headline — same size, same bold, same color (owner, 2026-09-25). */}
        {subtitle != null && <Text variant="title" bold tone={tone}>{subtitle}</Text>}
      </View>
    </View>
  );
}
