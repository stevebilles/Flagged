import React, { useState } from "react";
import { View, TextInput, Linking } from "react-native";
import { Screen, Text, Card, Button } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { getMetaValue, setMetaValue } from "../../src/db/appMeta";
import { getStats, saveStats } from "../../src/db/repositories";
import { useAppStore } from "../../src/state/appStore";
import { restorePurchases } from "../../src/purchases/purchases";

/** SETTINGS — app administration & compliance (docs/05 Tab 4). */
export default function Settings() {
  const t = useTheme();
  const isPremium = useAppStore((s) => s.isPremium);
  const setPremium = useAppStore((s) => s.setPremium);
  const [name, setName] = useState(getMetaValue("firstName") ?? "");
  const [restoring, setRestoring] = useState(false);
  const [devNote, setDevNote] = useState<string | null>(null);

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
      <View style={{ gap: t.spacing.lg }}>
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
          <Text tone="muted" variant="caption">PURCHASES</Text>
          <Card style={{ gap: t.spacing.sm }}>
            <Text>Status: {isPremium ? "Premium (Lifetime)" : "Trial"}</Text>
            <Button title="Restore Purchases" kind="secondary" loading={restoring} onPress={onRestore} />
          </Card>
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
      </View>
    </Screen>
  );
}
