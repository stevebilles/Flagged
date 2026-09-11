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
import { useTheme } from "./ThemeProvider";

type Variant = "body" | "caption" | "title" | "heading" | "display";
type Tone = "primary" | "muted" | "cyan" | "red" | "warning";

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
