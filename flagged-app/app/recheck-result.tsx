import React, { useEffect } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { markVerified, rebaselinePantryItem, softDeletePantryItem } from "../src/db/repositories";
import { commitRecheckStats } from "../src/domain/scanService";

/**
 * Recheck result (docs/07 §7.1). Three outcomes:
 *  1. identical        → green confirmation, reset the 30-day timer
 *  2. changed_safe     → orange "Recipe Change Detected", Keep / Delete
 *  3. changed_flagged  → Alert Red, names the new offending ingredient(s), Delete / Keep
 * Stats are committed once, on mount (this recheck reached a result).
 */
export default function RecheckResult() {
  const t = useTheme();
  const router = useRouter();
  const isPremium = useAppStore((s) => s.isPremium);
  const handoff = useAppStore((s) => s.lastRecheck);

  useEffect(() => {
    if (handoff) commitRecheckStats(handoff.outcome, isPremium);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!handoff) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.spacing.md }}>
          <Text>No recheck to show.</Text>
          <Button title="Back to Pantry" onPress={() => router.replace("/(tabs)/pantry")} />
        </View>
      </Screen>
    );
  }

  const { itemId, brandName, productName, newIngredients, outcome } = handoff;

  function done() {
    useAppStore.getState().setLastRecheck(null);
    router.replace("/(tabs)/pantry");
  }

  function keep() {
    rebaselinePantryItem(itemId, newIngredients);
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

  // --- Outcome 1: identical -------------------------------------------------
  if (outcome.kind === "identical") {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: t.spacing.lg }}>
          <View style={{ alignItems: "center", gap: t.spacing.sm }}>
            <Ionicons name="checkmark-circle" size={64} color={t.colors.cyan} />
            <Text variant="title" bold tone="cyan">
              No changes detected.
            </Text>
            <Text tone="muted" style={{ textAlign: "center" }}>
              {brandName} — {productName} still matches the recipe you saved. We've reset its
              30-day timer.
            </Text>
          </View>
          <Button title="Back to Pantry" onPress={acceptIdentical} />
        </View>
      </Screen>
    );
  }

  const { diff } = outcome;
  const flagged = outcome.kind === "changed_flagged";
  const accent = flagged ? t.colors.red : t.colors.warning;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }}>
        <View style={{ alignItems: "center", gap: t.spacing.sm }}>
          <Ionicons name={flagged ? "warning" : "alert-circle"} size={64} color={accent} />
          <Text variant="title" bold style={{ color: accent, textAlign: "center" }}>
            {flagged ? "Red Flag Detected!" : "Recipe Change Detected"}
          </Text>
          <Text tone="muted" style={{ textAlign: "center" }}>
            {brandName} — {productName}
          </Text>
        </View>

        {/* What changed */}
        <Card style={{ gap: t.spacing.sm }}>
          <Text bold>What changed</Text>
          {diff.added.length > 0 && (
            <Text tone="muted" variant="caption">Added: {diff.added.join(", ")}</Text>
          )}
          {diff.removed.length > 0 && (
            <Text tone="muted" variant="caption">Removed: {diff.removed.join(", ")}</Text>
          )}
          {diff.orderShifted && (
            <Text tone="muted" variant="caption">
              Ingredient order shifted (possible skimpflation).
            </Text>
          )}
        </Card>

        {flagged ? (
          <Card style={{ gap: t.spacing.sm }}>
            <Text bold tone="red">This new recipe contains an ingredient you're avoiding</Text>
            {outcome.matches.map((m, i) => (
              <Text key={i} tone="muted" variant="caption">
                • "{m.token}" — matches your {m.categoryName ?? m.term} filter
              </Text>
            ))}
          </Card>
        ) : (
          <Card style={{ borderColor: t.colors.cyan, borderWidth: 1 }}>
            <Text bold tone="cyan">No Active Red Flags Detected</Text>
            <Text tone="muted" variant="caption">
              The recipe changed, but we didn't catch any of your active red flags.
            </Text>
          </Card>
        )}

        <Text tone="muted" style={{ textAlign: "center" }}>
          {flagged
            ? "Do you want to remove this item from your pantry?"
            : "Do you want to keep this item in your pantry?"}
        </Text>

        <View style={{ gap: t.spacing.sm }}>
          {flagged ? (
            <>
              <Button title="Delete Item" kind="destructive" onPress={remove} />
              <Button title="Keep Item" kind="secondary" onPress={keep} />
            </>
          ) : (
            <>
              <Button title="Keep Item" onPress={keep} />
              <Button title="Delete Item" kind="secondary" onPress={remove} />
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
