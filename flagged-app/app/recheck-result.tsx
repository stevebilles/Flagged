import React, { useEffect, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import {
  getPantryItem,
  getProfile,
  markVerified,
  rebaselinePantryItem,
  softDeletePantryItem,
  findCategoryEnabledChange,
  findCustomIngredientAddedChange,
} from "../src/db/repositories";
import { commitRecheckStats } from "../src/domain/scanService";
import { snapshotFromProfile } from "../src/domain/activation";
import type { AttributedMatch } from "../src/domain/recheckEngine";

/** Build the per-match explanation (docs/07 §7.1) — a reformulation claim
 * only when the match's own filter was already active last time; otherwise
 * a dated citation from the change log when one exists, or a generic
 * fallback (e.g. a profile edit made before this logging system existed). */
function attributionMessage(m: AttributedMatch, profileId: string): string {
  if (m.attribution.kind === "reformulation") {
    return "This ingredient wasn't present in your last scan.";
  }
  const filter = m.categoryName ?? m.term;
  const change =
    m.categoryId != null
      ? findCategoryEnabledChange(profileId, m.categoryId)
      : findCustomIngredientAddedChange(profileId, m.term);
  if (change) {
    const date = new Date(change.timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return `On ${date}, you added ${filter} to your red flags — that's why this is now flagging.`;
  }
  return `This now matches a filter (${filter}) you've added since you last saved this item.`;
}

/**
 * Recheck result (docs/07 §7.1, redesigned 2026-09-14). Two outcomes:
 *  1. identical        → still clean under the current profile — green confirmation, reset the 30-day timer
 *  2. changed_flagged  → Alert Red, each match individually attributed (reformulation vs. a dated/generic filter change)
 * Always resolves the item's OWN profile (`item.profileId`), never whichever
 * profile happens to be globally active — a real bug, fixed the same day.
 * Stats are committed once, on mount (this recheck reached a result).
 */
export default function RecheckResult() {
  const t = useTheme();
  const router = useRouter();
  const isPremium = useAppStore((s) => s.isPremium);
  const handoff = useAppStore((s) => s.lastRecheck);
  const item = useMemo(() => (handoff ? getPantryItem(handoff.itemId) : null), [handoff]);

  useEffect(() => {
    const profile = item ? getProfile(item.profileId) : null;
    if (handoff && profile) commitRecheckStats(handoff.outcome, profile, isPremium);
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

  const { itemId, brandName, productName, outcome } = handoff;

  function done() {
    useAppStore.getState().setLastRecheck(null);
    router.replace("/(tabs)/pantry");
  }

  function keep() {
    // Baseline against the profile's CURRENT filters (docs/07 §7.1) — a
    // "Keep" means the user accepted today's flagged state as the new normal.
    const profile = getProfile(item!.profileId);
    if (profile) rebaselinePantryItem(itemId, snapshotFromProfile(profile));
    done();
  }

  function remove() {
    softDeletePantryItem(itemId);
    done();
  }

  function acceptIdentical() {
    markVerified(itemId);
    done();
  }

  // --- Outcome 1: still clean ------------------------------------------------
  if (outcome.kind === "identical") {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: t.spacing.lg }}>
          <View style={{ alignItems: "center", gap: t.spacing.sm }}>
            <Ionicons name="checkmark-circle" size={64} color={t.colors.cyan} />
            <Text variant="title" bold tone="cyan">
              Still clean.
            </Text>
            <Text tone="muted" style={{ textAlign: "center" }}>
              {brandName} — {productName} doesn't match any of your active red flags. We've reset
              its 30-day timer.
            </Text>
          </View>
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
          <Text tone="muted" style={{ textAlign: "center" }}>
            {brandName} — {productName}
          </Text>
        </View>

        <Card style={{ gap: t.spacing.md }}>
          <Text bold tone="red">This is now flagging something it didn't before</Text>
          {outcome.matches.map((m, i) => (
            <View key={i} style={{ gap: 2, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.colors.canvas, paddingTop: i === 0 ? 0 : t.spacing.sm }}>
              <Text bold>{m.term.charAt(0).toUpperCase() + m.term.slice(1)}</Text>
              <Text tone="muted" variant="caption">{attributionMessage(m, item.profileId)}</Text>
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
