import React, { useMemo, useState } from "react";
import { View, ScrollView, Pressable, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { profileColor } from "../src/design/avatar";
import {
  devForceRecheckDue,
  getPantryItem,
  getProfiles,
  getScanHistory,
  softDeletePantryItem,
} from "../src/db/repositories";
import { scanCountLabel } from "../src/domain/scanHistory";
import { RECHECK_DAYS, displayName } from "../src/domain/types";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * One saved Pantry item (docs/05 Tab 3, docs/17 `pantry_detail.png`): the photo, brand and product,
 * the profile it was saved for, when it was saved / last checked, and Remove from Pantry.
 * Removing is a soft delete — it shows under Recent Changes with an Undo for 24 hours.
 */
export default function PantryItemScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const item = useMemo(() => (id ? getPantryItem(id) : null), [id]);
  const profiles = useMemo(() => getProfiles(), []);
  // The running total of scans (the save counts as the first) — see the Scan History screen.
  const scanCount = useMemo(() => (id ? getScanHistory(id).length : 0), [id]);
  const [imageFailed, setImageFailed] = useState(false);

  const profileIndex = item ? profiles.findIndex((p) => p.profileId === item.profileId) : -1;
  const showImage = !!item?.imageFilePath && !imageFailed;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.colors.card,
              alignItems: "center",
              justifyContent: "center",
              marginRight: t.spacing.sm,
            }}
          >
            <Ionicons name="chevron-back" size={18} color={t.colors.textPrimary} />
          </Pressable>
          <Text variant="title" bold>Pantry Item</Text>
        </View>

        {!item || item.deletedAt !== null ? (
          <Text tone="muted">This item is no longer in your Pantry.</Text>
        ) : (
          <>
            <Card style={{ alignItems: "center", gap: t.spacing.md }}>
              {showImage ? (
                <Image
                  source={{ uri: item.imageFilePath }}
                  // The WHOLE photo, never cropped (owner, 2026-09-25: a square crop cut the brand name
                  // off a tall shot). "contain" fits it inside the box; the leftover space is the card's
                  // own color, so it just looks like a taller photo.
                  style={{ width: "100%", height: 300, borderRadius: t.radius.md }}
                  resizeMode="contain"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <Ionicons name="image-outline" size={64} color={t.colors.textMuted} />
              )}
              <View style={{ alignItems: "center", gap: 2 }}>
                <Text variant="title" bold style={{ textAlign: "center" }}>{item.brandName}</Text>
                <Text tone="muted" style={{ textAlign: "center" }}>{item.productName}</Text>
              </View>
            </Card>

            {/* Which profile this card is saved to, as a pill (owner's mockup style). The saved / last
                checked dates that used to be listed here were repeats of the Scan History below
                (first saved date + the newest entry), so they're gone. */}
            <View style={{ gap: t.spacing.sm }}>
              <Text variant="caption" bold style={{ letterSpacing: 1 }}>SAVED TO PROFILE</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: t.colors.card,
                    borderRadius: t.radius.pill,
                    borderWidth: 1,
                    borderColor: profileIndex >= 0 ? profileColor(profileIndex) : t.colors.textMuted,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: profileIndex >= 0 ? profileColor(profileIndex) : t.colors.textMuted,
                    }}
                  />
                  <Text bold>{profileIndex >= 0 ? displayName(profiles[profileIndex].name) : "No profile (deleted)"}</Text>
                </View>
              </View>
            </View>

            {/* Scan History (owner's mockup): the running total of scans and when it was first saved;
                tap to open the timeline of every scan with the red flags used at each one. */}
            <View style={{ gap: t.spacing.sm }}>
              <Text variant="caption" bold style={{ letterSpacing: 1 }}>SCAN HISTORY</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Scan history, ${scanCountLabel(scanCount)}`}
                onPress={() => router.push(`/scan-history?id=${item.itemId}` as never)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: t.spacing.md,
                  padding: t.spacing.md,
                  borderRadius: t.radius.md,
                  backgroundColor: t.colors.card,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.cyan }} />
                <View style={{ flex: 1 }}>
                  <Text bold>{scanCountLabel(scanCount)}</Text>
                  <Text tone="muted" variant="subheadline">First saved {formatDate(item.dateAdded)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.colors.textMuted} />
              </Pressable>
            </View>

            <Button
              title="Remove from Pantry"
              kind="destructive"
              onPress={() => {
                softDeletePantryItem(item.itemId);
                router.back();
              }}
            />

            {/* DEVELOPMENT BUILDS ONLY (`__DEV__` is false in a release build, so this never ships):
                lets us walk the whole recheck flow — to-do list, red dot, rescan, the timestamped
                explanation — without waiting 30 days. Deliberately labelled, not hidden. */}
            {__DEV__ && (
              <Card style={{ gap: t.spacing.sm }}>
                <Text tone="warning" variant="caption" bold>DEVELOPMENT ONLY</Text>
                <Text tone="muted" variant="subheadline">
                  Marks this item as last checked {RECHECK_DAYS + 1} days ago, so it shows up in
                  Reformulation Checks and the Pantry tab gets its red dot. For testing the recheck
                  flow; this button doesn't exist in a release build.
                </Text>
                <Button
                  title="Force recheck (mark as due)"
                  kind="secondary"
                  onPress={() => {
                    devForceRecheckDue(item.itemId);
                    router.back();
                  }}
                />
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
