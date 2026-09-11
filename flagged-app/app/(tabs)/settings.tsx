import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text, Card, Button } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { getMetaValue, setMetaValue } from "../../src/db/appMeta";
import { getStats, saveStats } from "../../src/db/repositories";
import { useAppStore } from "../../src/state/appStore";
import { restorePurchases, cachedRenewalDate } from "../../src/purchases/purchases";
import { scansRemaining } from "../../src/domain/scanService";
import { FREE_SCAN_LIMIT } from "../../src/domain/types";

const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: undefined,
});

/** SETTINGS — app administration & compliance (docs/05 Tab 4). */
export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const isPremium = useAppStore((s) => s.isPremium);
  const setPremium = useAppStore((s) => s.setPremium);
  const [name, setName] = useState(getMetaValue("firstName") ?? "");
  const [restoring, setRestoring] = useState(false);
  const [devNote, setDevNote] = useState<string | null>(null);

  const scansUsed = FREE_SCAN_LIMIT - scansRemaining();
  const renewalDate = useMemo(() => cachedRenewalDate(), [isPremium]);

  function saveName(v: string) {
    setName(v);
    setMetaValue("firstName", v);
  }

  async function onRestore() {
    setRestoring(true);
    try {
      const active = await restorePurchases();
      setPremium(active);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">FIRST NAME</Text>
          <Card>
            <TextInput
              value={name}
              onChangeText={saveName}
              placeholder="Enter your first name"
              placeholderTextColor={t.colors.textMuted}
              style={{ color: t.colors.textPrimary, fontFamily: t.fontFamily.regular, fontSize: t.fontSize.body }}
            />
          </Card>
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">SUBSCRIPTION</Text>
          {isPremium ? (
            <Card style={{ gap: t.spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text bold>Flagged Pro</Text>
                <Text tone="cyan" bold>Active</Text>
              </View>
              <Text tone="muted">
                {renewalDate
                  ? `Renews ${renewalDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
                  : "$24.99/yr, auto-renewing"}
              </Text>
              <Button title="Restore Purchases" kind="secondary" loading={restoring} onPress={onRestore} />
              {MANAGE_SUBSCRIPTION_URL && (
                <Button
                  title="Manage Subscription"
                  kind="secondary"
                  onPress={() => Linking.openURL(MANAGE_SUBSCRIPTION_URL)}
                />
              )}
            </Card>
          ) : (
            <Card style={{ gap: t.spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text bold>Free Trial</Text>
                  <Text tone="muted" variant="caption">{scansUsed} of {FREE_SCAN_LIMIT} scans used</Text>
                </View>
                <Text tone="cyan" bold>Trial</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.canvas, overflow: "hidden" }}>
                <View
                  style={{
                    height: "100%",
                    width: `${Math.min(100, (scansUsed / FREE_SCAN_LIMIT) * 100)}%`,
                    backgroundColor: t.colors.cyan,
                  }}
                />
              </View>
              <Text variant="display" bold tone="cyan">$24.99/yr</Text>
              <Text tone="muted">Unlimited, offline label reading — every profile in your house.</Text>
              <Button title="Unlock Flagged — $24.99/yr" onPress={() => router.push("/paywall")} />
              <Button title="Restore Purchases" kind="secondary" loading={restoring} onPress={onRestore} />
            </Card>
          )}
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">SUPPORT</Text>
          <Button title="Report an Issue / Contact Us" kind="secondary" onPress={() => Linking.openURL("mailto:support@flagged.app")} />
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">LEGAL</Text>
          <Button title="Privacy Policy" kind="secondary" onPress={() => Linking.openURL("https://flagged.app/privacy")} />
          <Button title="Terms of Service" kind="secondary" onPress={() => Linking.openURL("https://flagged.app/terms")} />
        </View>

        {__DEV__ && (
          <View style={{ gap: t.spacing.sm }}>
            <Text tone="muted" variant="caption">DEVELOPER (dev builds only)</Text>
            <Card style={{ gap: t.spacing.sm }}>
              <Button
                title="Reset free scan count"
                kind="secondary"
                onPress={() => {
                  saveStats({ ...getStats(), freeScansUsed: 0 });
                  setDevNote("Free scans reset to 10.");
                }}
              />
              <Button
                title={isPremium ? "Turn OFF Premium" : "Turn ON Premium"}
                kind="secondary"
                onPress={() => {
                  setPremium(!isPremium);
                  setDevNote(isPremium ? "Premium off." : "Premium on — unlimited scans.");
                }}
              />
              {devNote && <Text tone="cyan" variant="caption">{devNote}</Text>}
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
