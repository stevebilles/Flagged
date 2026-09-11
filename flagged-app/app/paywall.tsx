import React, { useState } from "react";
import { View, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { purchaseAnnual } from "../src/purchases/purchases";
import { markPremiumInstalled } from "../src/review/reviewTriggers";

/** $24.99/yr subscription paywall (docs/08). */
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
      const active = await purchaseAnnual();
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
        <Text variant="heading" bold>Unlimited label reading, all year.</Text>
        <Card style={{ alignItems: "center", gap: t.spacing.sm }}>
          <Text variant="display" bold tone="cyan">$24.99 / yr</Text>
          <Text tone="cyan" bold>Just $0.07 / day</Text>
          <Text tone="muted" style={{ textAlign: "center" }}>
            Unlimited, offline label reading — for every profile in your house.
          </Text>
        </Card>
        {error && <Text tone="red">{error}</Text>}
        <Button title="Unlock Flagged — $24.99/yr" loading={busy} onPress={buy} />
        {/* Required subscription disclosure (App Store Review Guideline 3.1.2):
            title, length, price, auto-renewal terms, and links to Terms + Privacy. */}
        <Text tone="muted" variant="caption" style={{ textAlign: "center" }}>
          Flagged Pro: $24.99 per year. Auto-renews for the same term unless cancelled at least 24
          hours before the end of the current period. Manage or cancel anytime in your device's
          account settings.{"\n"}
          <Text
            tone="cyan"
            variant="caption"
            onPress={() => Linking.openURL("https://flagged.app/terms")}
          >
            Terms of Service
          </Text>
          {"  ·  "}
          <Text
            tone="cyan"
            variant="caption"
            onPress={() => Linking.openURL("https://flagged.app/privacy")}
          >
            Privacy Policy
          </Text>
        </Text>
        <Button title="Not now" kind="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
