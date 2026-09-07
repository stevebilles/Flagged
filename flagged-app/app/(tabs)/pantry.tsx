import React, { useMemo } from "react";
import { View, ScrollView } from "react-native";
import { Screen, Text, Card, Button } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { getActivePantryItems, getRecentlyDeleted, undoDeletePantryItem } from "../../src/db/repositories";
import { RECHECK_DAYS, type PantryItem } from "../../src/domain/types";

/** PANTRY — approved list & audit hub (docs/05 Tab 3). */
export default function Pantry() {
  const t = useTheme();
  const items = useMemo(() => getActivePantryItems(), []);
  const deleted = useMemo(() => getRecentlyDeleted(), []);

  const now = Date.now();
  const recheckMs = RECHECK_DAYS * 24 * 60 * 60 * 1000;
  const needsRecheck = items.filter((i) => now - i.lastVerifiedDate > recheckMs);
  const fresh = items.filter((i) => now - i.lastVerifiedDate <= recheckMs);

  const isEmpty = items.length === 0 && deleted.length === 0;

  if (isEmpty) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.spacing.md }}>
          <Text variant="title" bold>Your safe list is empty.</Text>
          <Text tone="muted" style={{ textAlign: "center" }}>
            When you scan an item with no red flags, save it here so you never have to
            second-guess it again.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }}>
        {needsRecheck.length > 0 && (
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="title" bold tone="warning">Skimpflation & Reformulation Checks</Text>
            <Text tone="muted" variant="caption">
              Brands sneakily change recipes all the time. Re-scan these items to ensure they are
              still approved.
            </Text>
            {needsRecheck.map((i) => (
              <Card key={i.itemId}>
                <Text bold>{i.brandName} — {i.productName}</Text>
                <Button title="Recheck" kind="secondary" onPress={() => {/* TODO: intercept modal → camera → diff engine (docs/07) */}} />
              </Card>
            ))}
          </View>
        )}

        <View style={{ gap: t.spacing.sm }}>
          <Text variant="title" bold>My Safe Foods</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {fresh.map((i: PantryItem) => (
              <Card key={i.itemId} style={{ width: "48%" }}>
                <Text bold>{i.productName}</Text>
                <Text tone="muted" variant="caption">{i.brandName}</Text>
              </Card>
            ))}
          </View>
        </View>

        {deleted.length > 0 && (
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="title" bold>Recent Changes</Text>
            {deleted.map((i) => (
              <Card key={i.itemId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text>{i.productName}</Text>
                <Button title="Undo" kind="secondary" onPress={() => undoDeletePantryItem(i.itemId)} />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
