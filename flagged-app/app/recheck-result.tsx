import React, { useEffect, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button, withAlpha } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { ProductPhoto } from "../src/design/ProductPhoto";
import { useAppStore } from "../src/state/appStore";
import {
  getPantryItem,
  getProfile,
  rebaselinePantryItem,
  softDeletePantryItem,
  findCategoryEnabledChange,
  findCustomIngredientAddedChange,
  findIngredientIncludedChange,
  logScan,
  getCategories,
} from "../src/db/repositories";
import { commitRecheckStats } from "../src/domain/scanService";
import { snapshotFromProfile } from "../src/domain/activation";
import type { AttributedMatch } from "../src/domain/recheckEngine";
import { explainMatch, formatDate, formatDateTime, formatDayOrToday } from "../src/domain/recheckExplain";
import { filterSetLines, sameFilterSet } from "../src/domain/filterSet";
import { displayName, type PantryItem } from "../src/domain/types";

/** When did the user make the profile change that explains this match? Only edits made AFTER the
 * item's filters were recorded (`snapshotAt`) count. Null for a reformulation (no profile change
 * to cite) or when the change log has no matching entry (e.g. an edit from before logging existed). */
function profileChangeTime(m: AttributedMatch, item: PantryItem): number | null {
  const a = m.attribution;
  if (a.kind !== "profile_change") return null;
  const since = item.snapshotAt;
  const entry =
    a.cause === "category_added" && m.categoryId != null
      ? findCategoryEnabledChange(item.profileId, m.categoryId, since)
      : a.cause === "ingredient_included" && a.ingredientId
        ? findIngredientIncludedChange(item.profileId, a.ingredientId, since)
        : a.cause === "custom_added"
          ? findCustomIngredientAddedChange(item.profileId, m.term, since)
          : null;
  return entry ? entry.timestamp : null;
}

/** One column of the clean screen's "Profile at time of each scan" card: a date over the list of
 * red flags the profile was scanning for on that date. */
function FilterColumn({ date, lines }: { date: string; lines: string[] }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: t.spacing.xs }}>
      <Text variant="subheadline" bold>{date}</Text>
      <Text variant="caption" bold tone="muted" style={{ letterSpacing: 1 }}>SCANNING FOR</Text>
      {lines.map((line, i) => (
        <Text key={i} variant="subheadline" tone="muted">• {line}</Text>
      ))}
    </View>
  );
}

/**
 * Recheck result (docs/07 §7.1, redesigned 2026-09-14). Two outcomes:
 *  1. identical        → no red flags found — clean screen with the filter sets side by side, reset the 30-day timer
 *  2. changed_flagged  → Alert Red, each match individually attributed (reformulation vs. a dated/generic filter change)
 * Always resolves the item's OWN profile (`item.profileId`), never whichever
 * profile happens to be globally active — a real bug, fixed the same day.
 * Stats are committed once, on mount (this recheck reached a result).
 */
export default function RecheckResult() {
  const t = useTheme();
  const router = useRouter();
  const handoff = useAppStore((s) => s.lastRecheck);
  const item = useMemo(() => (handoff ? getPantryItem(handoff.itemId) : null), [handoff]);

  useEffect(() => {
    const profile = item ? getProfile(item.profileId) : null;
    if (handoff && profile) commitRecheckStats(handoff.outcome, profile);
    // A clean rescan becomes the item's new baseline right away (docs/07 §7.1): its filters are
    // re-recorded as of THIS scan and the 30-day timer restarts, so next time the left side of the
    // "profile at time of each scan" card shows this scan's date and filters. Done here, on open —
    // not on a button — so leaving by the back arrow or a swipe can't skip it. (The screen below
    // still shows the PREVIOUS baseline, read before this runs.)
    if (handoff && item && profile && handoff.outcome.kind === "identical") {
      rebaselinePantryItem(item.itemId, snapshotFromProfile(profile), handoff.scannedAt);
    }
    // Append-only entry in the item's scan history: when this rescan happened, what it found, and the
    // profile's red-flag settings it used (docs/03 §3.2b) — so the user can always go back to the
    // filters used at any scan, even after the item's current baseline moves forward.
    if (handoff && item) {
      logScan({
        itemId: item.itemId,
        profileId: item.profileId,
        at: handoff.scannedAt,
        kind: "rescan",
        outcome: handoff.outcome.kind === "identical" ? "no_red_flags" : "flagged",
        matchedTerms: handoff.outcome.kind === "identical" ? [] : handoff.outcome.matches.map((m) => m.term),
        snapshot: profile ? snapshotFromProfile(profile) : null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!handoff || !item) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.spacing.md }}>
          <Text>No recheck to show.</Text>
          <Button title="Back to Pantry" onPress={() => router.replace("/(tabs)/pantry")} />
        </View>
      </Screen>
    );
  }

  const { itemId, brandName, productName, outcome, scannedAt } = handoff;
  // snapshotAt only moves past dateAdded when the user chose "Keep Item" on an earlier recheck.
  const kept = item.snapshotAt > item.dateAdded;

  function done() {
    useAppStore.getState().setLastRecheck(null);
    router.replace("/(tabs)/pantry");
  }

  function keep() {
    // Baseline against the profile's CURRENT filters (docs/07 §7.1) — a
    // "Keep" means the user accepted today's flagged state as the new normal.
    const profile = getProfile(item!.profileId);
    if (profile) rebaselinePantryItem(itemId, snapshotFromProfile(profile), scannedAt);
    done();
  }

  function remove() {
    softDeletePantryItem(itemId);
    done();
  }

  // The clean result was already recorded when the screen opened (see the effect above), so leaving
  // it — by the button or the back arrow — just returns to the Pantry.
  function acceptIdentical() {
    done();
  }

  // --- Outcome 1: no red flags found (owner's mockup, 2026-09-25) --------------
  // Header (back · photo · brand/product) → verdict card → profile-at-time-of-each-scan → button.
  // No "CLEAN" pill/tag (owner, 2026-09-25): a status tag can be read as a safety claim and works
  // against the disclaimer — the verdict card says "No red flags found" and nothing more.
  // Wording follows the app's rule (CLAUDE.md): "No red flags found", never "clear"/"all good".
  // Leaving via the back arrow or the button both count as accepting the result (reset the timer).
  if (outcome.kind === "identical") {
    const profile = getProfile(item.profileId);
    const whose = profile ? `${displayName(profile.name)}'s` : "this";
    // The filters recorded when the item was saved vs. the profile's filters today (docs/07 §7.1).
    const categories = getCategories();
    const nowFilters = profile ? snapshotFromProfile(profile) : item.profileSnapshot;
    const sameFilters = sameFilterSet(item.profileSnapshot, nowFilters);
    return (
      <Screen>
        <View style={{ gap: t.spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
            <Pressable
              onPress={acceptIdentical}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back to Pantry"
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
            {/* The product's saved photo carries through every recheck screen (owner, 2026-09-25). */}
            <ProductPhoto uri={item.imageFilePath} size={56} />
            <View style={{ flex: 1 }}>
              <Text variant="title" bold numberOfLines={1}>{brandName}</Text>
              <Text tone="muted" variant="subheadline" numberOfLines={1}>{productName}</Text>
            </View>
          </View>

          <View
            style={{
              alignItems: "center",
              gap: t.spacing.md,
              padding: t.spacing.lg,
              borderRadius: t.radius.lg,
              borderWidth: 1,
              borderColor: withAlpha(t.colors.cyan, 0.35),
              backgroundColor: withAlpha(t.colors.cyan, 0.1),
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                borderWidth: 2,
                borderColor: t.colors.cyan,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark" size={40} color={t.colors.cyan} />
            </View>
            <Text variant="title" bold tone="cyan" style={{ textAlign: "center" }}>
              No red flags found
            </Text>
            <Text tone="muted" variant="subheadline" style={{ textAlign: "center" }}>
              No new red flags found for{" "}
              <Text variant="subheadline" bold>{whose}</Text> current profile.
            </Text>
          </View>

          <Card style={{ gap: t.spacing.md }}>
            <Text variant="caption" bold tone="muted" style={{ letterSpacing: 1 }}>
              PROFILE AT TIME OF EACH SCAN
            </Text>
            <View style={{ flexDirection: "row" }}>
              <FilterColumn date={formatDate(item.snapshotAt)} lines={filterSetLines(item.profileSnapshot, categories)} />
              <View style={{ width: 1, backgroundColor: t.colors.canvas, marginHorizontal: t.spacing.md }} />
              <FilterColumn date={formatDayOrToday(handoff.scannedAt)} lines={filterSetLines(nowFilters, categories)} />
            </View>
            <View style={{ height: 1, backgroundColor: t.colors.canvas }} />
            {/* Only claims "same" when the two sets truly are the same; if the user changed their
                filters since saving, it says so instead. */}
            <Text tone="muted" variant="subheadline" style={{ fontFamily: t.fontFamily.italic }}>
              {sameFilters
                ? "Same filter set — no new red flags detected."
                : "Your filters changed since you saved this — no red flags detected with the current set."}
            </Text>
          </Card>

          <Button title="Back to Pantry" onPress={acceptIdentical} />
        </View>
      </Screen>
    );
  }

  // --- Outcome 2: now flagged -------------------------------------------------
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }}>
        <View style={{ alignItems: "center", gap: t.spacing.sm }}>
          <Ionicons name="warning" size={64} color={t.colors.red} />
          <Text variant="title" bold style={{ color: t.colors.red, textAlign: "center" }}>
            Red Flag Detected!
          </Text>
          <ProductPhoto uri={item.imageFilePath} size={80} />
          <Text tone="muted" style={{ textAlign: "center" }}>
            {brandName} — {productName}
          </Text>
        </View>

        {/* The three moments the explanation below hangs on: when this item's red flags were
            recorded, and when this rescan happened (the profile-edit time is cited per match). */}
        <Card style={{ gap: 2 }}>
          <Text tone="muted" variant="caption">
            {kept ? "LAST CHECKED" : "SAVED TO YOUR PANTRY"}
          </Text>
          <Text>{formatDateTime(item.snapshotAt)}</Text>
          <Text tone="muted" variant="caption" style={{ marginTop: t.spacing.sm }}>THIS SCAN</Text>
          <Text>{formatDateTime(handoff.scannedAt)}</Text>
        </Card>

        <Card style={{ gap: t.spacing.md }}>
          <Text bold tone="red">This is now flagging something it didn't before</Text>
          {outcome.matches.map((m, i) => (
            <View key={i} style={{ gap: 2, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.colors.canvas, paddingTop: i === 0 ? 0 : t.spacing.sm }}>
              <Text bold>{m.term.charAt(0).toUpperCase() + m.term.slice(1)}</Text>
              <Text tone="muted" variant="subheadline">
                {explainMatch(m, { savedAt: item.snapshotAt, changeAt: profileChangeTime(m, item), kept })}
              </Text>
            </View>
          ))}
        </Card>

        <Text tone="muted" style={{ textAlign: "center" }}>
          Do you want to remove this item from your pantry?
        </Text>

        <View style={{ gap: t.spacing.sm }}>
          <Button title="Delete Item" kind="destructive" onPress={remove} />
          <Button title="Keep Item" kind="secondary" onPress={keep} />
        </View>
      </ScrollView>
    </Screen>
  );
}
