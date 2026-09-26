import React, { useMemo, useState } from "react";
import { View, ScrollView, Pressable, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, withAlpha } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { profileColor } from "../src/design/avatar";
import { getCategories, getPantryItem, getProfiles, getScanHistory } from "../src/db/repositories";
import { displayName, type Category, type Profile, type ScanHistoryEntry } from "../src/domain/types";
import { filterSetLines } from "../src/domain/filterSet";
import { scanEntryLabel } from "../src/domain/scanHistory";
import { formatDate, formatTime } from "../src/domain/recheckExplain";

/**
 * Scan History (owner's mockup, 2026-09-25): a timeline of every scan of one Pantry item, newest
 * first — the save, then each rescan — each with its exact date and time and the red-flag settings
 * the profile was scanning for at that moment. This is how a user can go back to "the filters I used
 * when this first came back clean". Text only; deleted with the item.
 */
export default function ScanHistoryScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const item = useMemo(() => (id ? getPantryItem(id) : null), [id]);
  const history = useMemo(() => (id ? getScanHistory(id) : []), [id]);
  const categories = useMemo(() => getCategories(), []);
  const profiles = useMemo(() => getProfiles(), []);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!item?.imageFilePath && !imageFailed;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: t.spacing.lg, paddingBottom: t.spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
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
            }}
          >
            <Ionicons name="chevron-back" size={18} color={t.colors.textPrimary} />
          </Pressable>
          <Text variant="title" bold>Scan History</Text>
        </View>

        {/* Which product this history belongs to, shown like its product card: photo (when it has
            one), then brand, then product — so it's obvious at a glance. */}
        {item && (
          <Card style={{ alignItems: "center", gap: t.spacing.md }}>
            {showImage && (
              <Image
                source={{ uri: item.imageFilePath }}
                style={{ width: 120, height: 120, borderRadius: t.radius.md }}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            )}
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text variant="title" bold style={{ textAlign: "center" }}>{item.brandName}</Text>
              <Text tone="muted" style={{ textAlign: "center" }}>{item.productName}</Text>
            </View>
          </Card>
        )}

        {!item ? (
          <Text tone="muted">This item is no longer in your Pantry.</Text>
        ) : (
          <View>
            {history.map((entry, i) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                latest={i === 0}
                last={i === history.length - 1}
                categories={categories}
                profiles={profiles}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * The red flags a scan was checked against, as a real two-column list: the first half runs down the
 * left column and the rest continues at the top of the right one, so the order reads naturally and a
 * long list takes half the height. (It used to be a wrapping row, which dropped short items wherever
 * they happened to fit — e.g. "Trans fats" sitting beside the second item.)
 *
 * The columns are sized to their CONTENT, not forced to equal halves (owner, 2026-09-25): equal halves
 * made "Synthetic preservatives" wrap even though the other column had room to spare. Each column
 * takes what its longest item needs and only shrinks — wrapping text — when both together don't fit.
 * Wrapping is always BETWEEN words (never "glut / mates"); the `minWidth` keeps a shrinking column
 * from getting narrower than a normal category name's longest word, which is the only thing that
 * could force a mid-word break.
 */
function TwoColumnList({ lines }: { lines: string[] }) {
  const t = useTheme();
  const half = Math.ceil(lines.length / 2);
  const columns = [lines.slice(0, half), lines.slice(half)];
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", columnGap: t.spacing.md }}>
      {columns.map((col, c) => (
        <View key={c} style={{ flexShrink: 1, minWidth: "35%", gap: t.spacing.xs }}>
          {col.map((line, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6 }}>
              <Text variant="subheadline" tone="muted">•</Text>
              <Text variant="subheadline" tone="muted" style={{ flexShrink: 1 }}>{line}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** One scan on the timeline: a dot on the rail, and a card with the date/time, what it was, and the
 * profile + the red flags it was scanning for. */
function HistoryRow({
  entry,
  latest,
  last,
  categories,
  profiles,
}: {
  entry: ScanHistoryEntry;
  latest: boolean;
  last: boolean;
  categories: Category[];
  profiles: Profile[];
}) {
  const t = useTheme();
  const label = scanEntryLabel(entry);
  const profileIndex = profiles.findIndex((p) => p.profileId === entry.profileId);
  const lines = entry.snapshot ? filterSetLines(entry.snapshot, categories) : null;
  return (
    <View style={{ flexDirection: "row", gap: t.spacing.md }}>
      <View style={{ width: 20, alignItems: "center", paddingTop: t.spacing.md }}>
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: t.colors.cyan,
            backgroundColor: latest ? withAlpha(t.colors.cyan, 0.35) : "transparent",
          }}
        />
        {!last && <View style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: withAlpha(t.colors.cyan, 0.35) }} />}
      </View>

      <Card style={{ flex: 1, padding: 0, marginBottom: last ? 0 : t.spacing.md, overflow: "hidden" }}>
        <View style={{ padding: t.spacing.md, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.spacing.sm }}>
            <Text bold style={{ flex: 1 }}>
              {formatDate(entry.at)} · {formatTime(entry.at)}
            </Text>
            {latest && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: t.colors.cyan,
                  borderRadius: t.radius.pill,
                  paddingHorizontal: t.spacing.sm,
                  paddingVertical: 2,
                }}
              >
                <Text variant="caption" bold tone="cyan" style={{ letterSpacing: 1 }}>LATEST</Text>
              </View>
            )}
          </View>
          <Text variant="subheadline" bold tone={label.tone}>{label.text}</Text>
        </View>

        <View style={{ height: 1, backgroundColor: t.colors.canvas }} />

        <View style={{ padding: t.spacing.md, gap: t.spacing.sm }}>
          {/* Past tense: this is a snapshot of the profile's red flags AT THE TIME of that scan. */}
          <Text variant="caption" bold tone="muted" style={{ letterSpacing: 1 }}>SCANNED FOR</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: profileIndex >= 0 ? profileColor(profileIndex) : t.colors.textMuted,
              }}
            />
            <Text bold>{profileIndex >= 0 ? displayName(profiles[profileIndex].name) : "Deleted profile"}</Text>
          </View>
          {lines ? (
            <TwoColumnList lines={lines} />
          ) : (
            <Text variant="subheadline" tone="muted">The red flags used weren't recorded for this scan.</Text>
          )}
        </View>
      </Card>
    </View>
  );
}
