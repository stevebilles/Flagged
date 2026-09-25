import React from "react";
import { View, Pressable, Text as RNText } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./components";
import { useTheme } from "./ThemeProvider";
import { profileColor, initials } from "./avatar";
import { displayName } from "../domain/types";
import type { Profile } from "../domain/types";

/** Shared pill shell for a profile switcher / filter row (docs/17 mockup). Used by Home's
 * profile switcher and the Pantry tab's profile filter. */
export function Chip({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: t.colors.card,
        borderRadius: t.radius.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? t.colors.cyan : t.colors.textMuted,
        paddingVertical: 8,
        paddingHorizontal: 14,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/** Small filled circle used for both the profile avatar and the "All" icon. */
export function AvatarDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

export function ProfileChip({
  profile,
  index,
  selected,
  onPress,
  count,
}: {
  profile: Profile;
  index: number;
  selected: boolean;
  onPress: () => void;
  /** Optional trailing count (the Pantry filter shows how many items each profile has). */
  count?: number;
}) {
  const t = useTheme();
  return (
    <Chip selected={selected} onPress={onPress}>
      <AvatarDot color={profileColor(index)}>
        <RNText style={{ fontSize: 10, fontFamily: t.fontFamily.bold, color: "#0B1220" }}>
          {initials(profile.name)}
        </RNText>
      </AvatarDot>
      <Text bold tone={selected ? "cyan" : "primary"}>
        {displayName(profile.name)}
      </Text>
      {count !== undefined && <Text tone="muted">{count}</Text>}
    </Chip>
  );
}

export function AllChip({
  selected,
  onPress,
  label = "All Profiles",
  count,
}: {
  selected: boolean;
  onPress: () => void;
  label?: string;
  count?: number;
}) {
  const t = useTheme();
  return (
    <Chip selected={selected} onPress={onPress}>
      <AvatarDot color="rgba(34,211,238,0.18)">
        <Ionicons name="shield-checkmark" size={13} color={t.colors.cyan} />
      </AvatarDot>
      <Text bold tone={selected ? "cyan" : "primary"}>
        {label}
      </Text>
      {count !== undefined && <Text tone="muted">{count}</Text>}
    </Chip>
  );
}
