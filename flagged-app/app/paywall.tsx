import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { purchaseLifetime } from "../src/purchases/purchases";
import { markPremiumInstalled } from "../src/review/reviewTriggers";

/** $24.99 lifetime unlock (docs/08). */
export default function Paywall() {
  const t = useTheme();
  const router = useRouter();
  const setPremium = useAppStore((s) => s.setPremium);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const active = await purchaseLifetime();
      if (active) {
        setPremium(true);
        markPremiumInstalled();
        router.back();
      }
    } catch (e: any) {
      setError(e?.message ?? "Purchase unavailable in this build (configure RevenueCat keys).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: t.spacing.lg }}>
        <Text variant="heading" bold>Pay once, own it forever.</Text>
        <Card style={{ alignItems: "center", gap: t.spacing.sm }}>
          <Text tone="muted" style={{ textDecorationLine: "line-through" }}>$39.99</Text>
          <Text variant="display" bold tone="cyan">$24.99</Text>
          <Text tone="muted" style={{ textAlign: "center" }}>
            Unlimited, offline label reading for life. No hidden fees.
          </Text>
        </Card>
        {error && <Text tone="red">{error}</Text>}
        <Button title="Unlock Unlimited Scans - $24.99" loading={busy} onPress={buy} />
        <Button title="Not now" kind="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
