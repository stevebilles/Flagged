import React, { useCallback, useMemo, useState } from "react";
import { View, ScrollView, Pressable, Text as RNText } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { useAppStore } from "../../src/state/appStore";
import { getProfiles, getActivePantryItems, getCategories } from "../../src/db/repositories";
import { getMetaValue } from "../../src/db/appMeta";
import { profileColor, initials } from "../../src/design/avatar";
import { displayName } from "../../src/domain/types";
import type { Profile, Category, PantryItem } from "../../src/domain/types";

const ZERO_DASHBOARD_STATS = {
  totalLabelsRead: 0,
  totalRedFlagsCaught: 0,
  totalSkimpflationCaught: 0,
  totalReformulationsCaught: 0,
};

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
  // "All" is shared app-wide (not just a Home display toggle) — Scan reads the
  // same flag so it actually checks every profile's combined filters.
  const viewingAll = useAppStore((s) => s.scanAllProfiles);
  const setViewingAll = useAppStore((s) => s.setScanAllProfiles);

  // Re-read from the DB every time Home gains focus (not just on first mount) —
  // a rename in the profile editor, a completed scan, or a Pantry save all
  // happen on other screens and wouldn't otherwise show up here.
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useFocusEffect(
    useCallback(() => {
      setProfiles(getProfiles());
      setPantryItems(getActivePantryItems());
      setCategories(getCategories());
    }, [])
  );

  const firstName = getMetaValue("firstName") ?? "";
  const activeProfile = profiles.find((p) => p.profileId === activeProfileId);
  // Filters are now the categories toggled directly in the profile editor
  // (Quick Packs were removed — several shared a category with each other,
  // which kept causing confusing knock-on toggles).
  const activeFilterNames = useMemo(() => {
    if (!activeProfile) return [];
    const active = new Set(activeProfile.activeCategoryIds);
    return categories.filter((c) => active.has(c.id)).map((c) => c.name);
  }, [activeProfile, categories]);

  // Dashboard numbers are per-profile (docs/17): "All" sums every profile's
  // own counters, a specific profile shows just its own.
  const dashboardStats = viewingAll
    ? profiles.reduce(
        (sum, p) => ({
          totalLabelsRead: sum.totalLabelsRead + p.totalLabelsRead,
          totalRedFlagsCaught: sum.totalRedFlagsCaught + p.totalRedFlagsCaught,
          totalSkimpflationCaught: sum.totalSkimpflationCaught + p.totalSkimpflationCaught,
          totalReformulationsCaught: sum.totalReformulationsCaught + p.totalReformulationsCaught,
        }),
        ZERO_DASHBOARD_STATS
      )
    : activeProfile ?? ZERO_DASHBOARD_STATS;
  const savedCount = viewingAll
    ? pantryItems.length
    : pantryItems.filter((i) => i.profileId === activeProfileId).length;

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

        {/* Profile switcher — wraps onto as many lines as needed so every
            profile is visible at once, no horizontal scrolling to find one. */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">
            ACTIVE PROFILES
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {profiles.map((p, index) => (
              <ProfileChip
                key={p.profileId}
                profile={p}
                index={index}
                selected={!viewingAll && p.profileId === activeProfileId}
                onPress={() => {
                  setViewingAll(false);
                  setActiveProfile(p.profileId);
                }}
              />
            ))}
            <AllChip selected={viewingAll} onPress={() => setViewingAll(true)} />
            <Pill label="+ Add" onPress={() => router.push("/profile-edit?new=1")} />
          </View>
        </View>

        {/* Summary card: either "scans all profiles" or the active profile's filter count */}
        <Card style={{ gap: t.spacing.sm }}>
          {viewingAll ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
                <Ionicons name="shield-checkmark" size={18} color={t.colors.cyan} />
                <Text bold>Scans all profiles</Text>
              </View>
              {profiles.map((p, index) => (
                <View key={p.profileId} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: profileColor(index) }} />
                  <Text>{displayName(p.name)}</Text>
                  <Text tone="muted"> · {p.activeCategoryIds.length} filters</Text>
                </View>
              ))}
            </>
          ) : activeProfile ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <AvatarDot color="rgba(34,211,238,0.18)">
                    <Ionicons name="shield-checkmark" size={13} color={t.colors.cyan} />
                  </AvatarDot>
                  <Text bold>{displayName(activeProfile.name)}'s Red Flags</Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => router.push(`/profile-edit?id=${activeProfile.profileId}`)}
                >
                  <Text tone="cyan" bold>Edit →</Text>
                </Pressable>
              </View>
              {activeFilterNames.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {activeFilterNames.map((name) => (
                    <View key={name} style={{ width: "50%", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.cyan }} />
                      <Text variant="caption" style={{ flexShrink: 1 }}>{name}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text tone="muted">No filters active yet — tap Edit to choose what to watch for.</Text>
              )}
            </>
          ) : (
            <Text tone="muted">Add a profile to start scanning.</Text>
          )}
        </Card>

        {/* Protection Summary — the pillars of value. Per-profile; "All" sums them. */}
        <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
          <Pillar label="Scans" value={dashboardStats.totalLabelsRead} tone="cyan" />
          <Pillar label="Saved" value={savedCount} tone="primary" />
          <Pillar label="Flags" value={dashboardStats.totalRedFlagsCaught} tone="red" />
        </View>
        <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
          <Pillar label="Skimpflation Caught" value={dashboardStats.totalSkimpflationCaught} tone="warning" />
          <Pillar label="Reformulation Caught" value={dashboardStats.totalReformulationsCaught} tone="warning" />
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
  index,
  selected,
  onPress,
}: {
  profile: Profile;
  index: number;
  selected: boolean;
  onPress: () => void;
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
        All Profiles
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
