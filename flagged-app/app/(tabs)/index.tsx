import React, { useMemo, useState } from "react";
import { View, ScrollView, Pressable, Text as RNText } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { useAppStore } from "../../src/state/appStore";
import { getProfiles, getStats, getActivePantryItems } from "../../src/db/repositories";
import { getMetaValue } from "../../src/db/appMeta";
import { profileColor, initials } from "../../src/design/avatar";
import type { Profile } from "../../src/domain/types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

/** HOME — dashboard & filter hub (docs/05 Tab 1, docs/17 mockup). */
export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);
  // "All" is a Home-screen view only — it doesn't change which profile Scan uses.
  const [viewingAll, setViewingAll] = useState(false);

  const profiles = useMemo(() => getProfiles(), [activeProfileId]);
  const stats = useMemo(() => getStats(), []);
  const savedCount = useMemo(() => getActivePantryItems().length, []);
  const firstName = getMetaValue("firstName") ?? "";
  const activeProfile = profiles.find((p) => p.profileId === activeProfileId);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <View>
          <Text tone="muted" variant="caption">
            {(greeting() + (firstName ? `, ${firstName}` : "")).toUpperCase()}
          </Text>
          <Text variant="display" bold>
            Flagged
          </Text>
        </View>

        {/* Profile switcher */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">
            ACTIVE PROFILE
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm }}>
            {profiles.map((p) => (
              <ProfileChip
                key={p.profileId}
                profile={p}
                selected={!viewingAll && p.profileId === activeProfileId}
                onPress={() => {
                  setViewingAll(false);
                  setActiveProfile(p.profileId);
                }}
              />
            ))}
            {profiles.length > 1 && (
              <AllChip selected={viewingAll} onPress={() => setViewingAll(true)} />
            )}
            <Pill label="+ Add" onPress={() => router.push("/profile-edit?new=1")} />
          </ScrollView>
        </View>

        {/* Summary card: either "scans all profiles" or the active profile's filter count */}
        <Card style={{ gap: t.spacing.sm }}>
          {viewingAll ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
                <Ionicons name="shield-checkmark" size={18} color={t.colors.cyan} />
                <Text bold>Scans all profiles</Text>
              </View>
              {profiles.map((p) => (
                <View key={p.profileId} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: profileColor(p.profileId) }} />
                  <Text>{p.name}</Text>
                  <Text tone="muted"> · {p.activeCategoryIds.length} filters</Text>
                </View>
              ))}
            </>
          ) : activeProfile ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: profileColor(activeProfile.profileId) }} />
                <Text bold>{activeProfile.name}</Text>
                <Text tone="muted"> · {activeProfile.activeCategoryIds.length} filters active</Text>
              </View>
              <Button
                title="Edit"
                kind="secondary"
                onPress={() => router.push(`/profile-edit?id=${activeProfile.profileId}`)}
              />
            </View>
          ) : (
            <Text tone="muted">Add a profile to start scanning.</Text>
          )}
        </Card>

        {/* Protection Summary — the pillars of value */}
        <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
          <Pillar label="Scans" value={stats.totalLabelsRead} tone="cyan" />
          <Pillar label="Saved" value={savedCount} tone="primary" />
          <Pillar label="Flags" value={stats.totalRedFlagsCaught} tone="red" />
        </View>
        <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
          <Pillar label="Skimpflation Caught" value={stats.totalSkimpflationCaught} tone="warning" />
          <Pillar label="Reformulation Caught" value={stats.totalReformulationsCaught} tone="warning" />
        </View>

        <Button title="📷  Scan a label" onPress={() => router.push("/(tabs)/scan")} />
      </ScrollView>
    </Screen>
  );
}

function Pillar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "red" | "warning" | "primary";
}) {
  return (
    <Card style={{ flex: 1, alignItems: "center" }}>
      <Text variant="display" bold tone={tone === "primary" ? "primary" : tone}>
        {value}
      </Text>
      <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
        {label.toUpperCase()}
      </Text>
    </Card>
  );
}

/** Shared pill shell for the profile switcher row (docs/17 mockup). */
function Chip({
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
function AvatarDot({ color, children }: { color: string; children: React.ReactNode }) {
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

function ProfileChip({
  profile,
  selected,
  onPress,
}: {
  profile: Profile;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Chip selected={selected} onPress={onPress}>
      <AvatarDot color={profileColor(profile.profileId)}>
        <RNText style={{ fontSize: 10, fontFamily: t.fontFamily.bold, color: "#0B1220" }}>
          {initials(profile.name)}
        </RNText>
      </AvatarDot>
      <Text bold tone={selected ? "cyan" : "primary"}>
        {profile.name}
      </Text>
    </Chip>
  );
}

function AllChip({ selected, onPress }: { selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Chip selected={selected} onPress={onPress}>
      <AvatarDot color="rgba(34,211,238,0.18)">
        <Ionicons name="shield-checkmark" size={13} color={t.colors.cyan} />
      </AvatarDot>
      <Text bold tone={selected ? "cyan" : "primary"}>
        All
      </Text>
    </Chip>
  );
}

/** Plain outlined pill — used for "+ Add" (no avatar). */
function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: t.colors.card,
        borderRadius: t.radius.pill,
        borderWidth: 1,
        borderColor: t.colors.textMuted,
        paddingVertical: 8,
        paddingHorizontal: 14,
        justifyContent: "center",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text bold>{label}</Text>
    </Pressable>
  );
}
