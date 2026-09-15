import React from "react";
import {
  Text as RNText,
  TextProps,
  Pressable,
  PressableProps,
  View,
  ViewProps,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./ThemeProvider";

/** Theme colors are opaque hex (docs/09 — no shared hex between modes), so a
 * translucent tint has to be derived at runtime rather than hard-coded, or
 * it'd silently be the wrong shade (or the wrong mode's color) in light mode. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type Variant = "body" | "caption" | "title" | "heading" | "display";
type Tone = "primary" | "muted" | "cyan" | "red" | "warning" | "success";

export function Text({
  variant = "body",
  tone = "primary",
  bold,
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone; bold?: boolean }) {
  const t = useTheme();
  const toneColor = {
    primary: t.colors.textPrimary,
    muted: t.colors.textMuted,
    cyan: t.colors.cyan,
    red: t.colors.red,
    warning: t.colors.warning,
    success: t.colors.success,
  }[tone];
  return (
    <RNText
      style={[
        {
          color: toneColor,
          fontSize: t.fontSize[variant],
          fontFamily: bold ? t.fontFamily.bold : t.fontFamily.regular,
        },
        style,
      ]}
      {...rest}
    />
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.card,
          borderRadius: t.radius.md,
          padding: t.spacing.md,
          shadowColor: t.colors.cardShadow,
          shadowOpacity: t.scheme === "light" ? 1 : 0,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        },
        style,
      ]}
      {...rest}
    />
  );
}

export function Button({
  title,
  kind = "primary",
  loading,
  disabled,
  style,
  ...rest
}: PressableProps & {
  title: string;
  kind?: "primary" | "secondary" | "destructive";
  loading?: boolean;
}) {
  const t = useTheme();
  const bg = {
    primary: t.colors.cyan,
    secondary: "transparent",
    destructive: t.colors.red,
  }[kind];
  const fg = kind === "secondary" ? t.colors.textPrimary : "#0B1220";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: t.radius.md,
          paddingVertical: 14,
          paddingHorizontal: t.spacing.lg,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: kind === "secondary" ? 1 : 0,
          borderColor: t.colors.textMuted,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style as object,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <RNText style={{ color: fg, fontFamily: t.fontFamily.bold, fontSize: t.fontSize.body }}>
          {title}
        </RNText>
      )}
    </Pressable>
  );
}

/** Selectable Quick Pack pill (selected = cyan-filled). docs/05, docs/09 */
export function Pill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? t.colors.cyan : t.colors.card,
        borderRadius: t.radius.pill,
        paddingVertical: 8,
        paddingHorizontal: t.spacing.md,
        borderWidth: 1,
        borderColor: selected ? t.colors.cyan : t.colors.textMuted,
      }}
    >
      <RNText
        style={{
          color: selected ? "#0B1220" : t.colors.textPrimary,
          fontFamily: t.fontFamily.bold,
          fontSize: t.fontSize.caption,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

export type Classification = "regulated" | "advisory" | "preference";

/** Category classification badge (docs/09). */
export function Badge({ classification }: { classification: Classification }) {
  const t = useTheme();
  const color = {
    regulated: t.colors.badgeRegulated,
    advisory: t.colors.badgeAdvisory,
    preference: t.colors.badgePreference,
  }[classification];
  const label = classification.toUpperCase();
  return (
    <View
      style={{
        borderColor: color,
        borderWidth: 1,
        borderRadius: t.radius.sm,
        paddingHorizontal: 6,
        paddingVertical: 2,
        alignSelf: "flex-start",
      }}
    >
      <RNText style={{ color, fontFamily: t.fontFamily.bold, fontSize: 11 }}>{label}</RNText>
    </View>
  );
}

/** A single matched ingredient, shown as a tappable-looking pill with a flag
 * icon (Results screen, docs/17). Always red-toned regardless of the parent
 * category's classification — the chip says "this was flagged", the
 * category badge next to it says "on what authority" (docs/09). */
export function IngredientChip({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: withAlpha(t.colors.red, 0.12),
        borderColor: t.colors.red,
        borderWidth: 1,
        borderRadius: t.radius.pill,
        paddingVertical: 8,
        paddingHorizontal: t.spacing.md,
      }}
    >
      <Ionicons name="flag" size={14} color={t.colors.red} />
      <RNText style={{ color: t.colors.red, fontFamily: t.fontFamily.bold, fontSize: t.fontSize.body }}>
        {label}
      </RNText>
    </View>
  );
}

/** Big circular verdict badge for the Results screen header (docs/17) — a
 * stamp-like focal point in place of a small icon + caption, so the result
 * reads at a glance instead of needing the text below it to land the point. */
export function VerdictStamp({
  tone,
  icon,
  label,
  count,
}: {
  tone: "red" | "cyan";
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  count?: number;
}) {
  const t = useTheme();
  const color = tone === "red" ? t.colors.red : t.colors.cyan;
  return (
    <View
      style={{
        width: 148,
        height: 148,
        borderRadius: 74,
        borderWidth: 3,
        borderColor: color,
        backgroundColor: withAlpha(color, 0.12),
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <Ionicons name={icon} size={28} color={color} />
      <RNText style={{ color, fontFamily: t.fontFamily.bold, fontSize: 20, letterSpacing: 1 }}>{label}</RNText>
      {count !== undefined && (
        <RNText style={{ color, fontFamily: t.fontFamily.bold, fontSize: 32 }}>{count}</RNText>
      )}
    </View>
  );
}

/** Canonical copy for what each classification means (docs/09) — shared so
 * the Profile editor and Results screen never drift out of sync with each
 * other. */
export const CLASSIFICATION_GUIDE: { classification: Classification; description: string }[] = [
  { classification: "regulated", description: "Legally required to be declared on food labels (e.g. allergens, nitrates)." },
  { classification: "advisory", description: "Not required by law but flagged based on scientific or health research." },
  { classification: "preference", description: "Personal dietary choices — no established health risk, your call." },
];

/** "What do these badges mean" reference card (docs/05 profile editor,
 * docs/17 Results redesign) — the same three rows wherever a classification
 * badge appears, so the meaning is never more than a glance away. */
export function ClassificationGuide() {
  const t = useTheme();
  return (
    <Card style={{ gap: t.spacing.sm }}>
      <Text tone="muted" variant="caption">CLASSIFICATION GUIDE</Text>
      {CLASSIFICATION_GUIDE.map((row) => (
        <View key={row.classification} style={{ flexDirection: "row", alignItems: "flex-start", gap: t.spacing.sm }}>
          <Badge classification={row.classification} />
          <Text tone="muted" variant="caption" style={{ flex: 1 }}>
            {row.description}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/**
 * Full-screen page wrapper. Insets for the notch/status bar and the home
 * indicator — the app never wired up safe-area handling before, so content
 * (e.g. Home's greeting) rendered under the status bar on every screen.
 */
export function Screen({ style, ...rest }: ViewProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: t.colors.canvas,
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom, 16),
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
});
