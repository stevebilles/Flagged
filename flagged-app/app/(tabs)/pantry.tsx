import React, { useMemo, useState } from "react";
import { View, ScrollView, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text, Card, Button } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { getActivePantryItems, getRecentlyDeleted, undoDeletePantryItem } from "../../src/db/repositories";
import { RECHECK_DAYS, type PantryItem } from "../../src/domain/types";
import { elapsedSince } from "../../src/domain/time";

/** PANTRY — approved list & audit hub (docs/05 Tab 3). */
export default function Pantry() {
  const t = useTheme();
  const router = useRouter();
  const items = useMemo(() => getActivePantryItems(), []);
  const deleted = useMemo(() => getRecentlyDeleted(), []);
  const [intercept, setIntercept] = useState<PantryItem | null>(null);

  const recheckMs = RECHECK_DAYS * 24 * 60 * 60 * 1000;
  // Clamp negative elapsed to 0 so a backwards device clock never makes an item
  // "due" early (spec Edge Cases / research R8).
  const needsRecheck = items.filter((i) => elapsedSince(i.lastVerifiedDate) > recheckMs);
  const fresh = items.filter((i) => elapsedSince(i.lastVerifiedDate) <= recheckMs);

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
                <Button title="Recheck" kind="secondary" onPress={() => setIntercept(i)} />
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

      {/* Intercept modal — prevents scanning the OLD box already at home (docs/07). */}
      <Modal visible={intercept !== null} transparent animationType="fade" onRequestClose={() => setIntercept(null)}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            padding: t.spacing.lg,
          }}
        >
          <Card style={{ gap: t.spacing.md }}>
            <Text variant="title" bold>Grab the new box</Text>
            <Text tone="muted">
              Only scan a NEWLY PURCHASED box to check for changes. Do you have a new box ready?
            </Text>
            <Button
              title="Yes, open camera"
              onPress={() => {
                const id = intercept?.itemId;
                setIntercept(null);
                // Typed-routes types for this new file are generated on dev-server start.
                if (id) router.push(`/recheck-capture?id=${id}` as never);
              }}
            />
            <Button title="Remind me later" kind="secondary" onPress={() => setIntercept(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
