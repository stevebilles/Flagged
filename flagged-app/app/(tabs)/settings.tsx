import React, { useState } from "react";
import { View, ScrollView, TextInput, Pressable, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as StoreReview from "expo-store-review";
import Constants from "expo-constants";
import { Screen, Text, Card, Button, SettingsRow } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { getMetaValue, setMetaValue } from "../../src/db/appMeta";
import { useAppStore } from "../../src/state/appStore";
import { restorePurchases, cachedRenewalDate, setDevPremiumOverride } from "../../src/purchases/purchases";

const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: undefined,
});

/** Small filled-outline status pill ("Active") — a one-off look
 * specific to this card, not generalized into the design system since
 * nothing else in the app currently needs this exact shape. */
function StatusPill({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        borderColor: t.colors.cyan,
        borderWidth: 1,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.spacing.sm,
        paddingVertical: 4,
      }}
    >
      <Text tone="cyan" bold variant="caption">{label}</Text>
    </View>
  );
}

/** SETTINGS — app administration & compliance (docs/05 Tab 4, docs/17 redesign). */
export default function Settings() {
  const t = useTheme();
  const isPremium = useAppStore((s) => s.isPremium);
  const setPremium = useAppStore((s) => s.setPremium);
  const [name, setName] = useState(getMetaValue("firstName") ?? "");
  const [editingName, setEditingName] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [devNote, setDevNote] = useState<string | null>(null);

  // Cheap sync SQLite read — call directly each render so it never goes stale
  // after a renewal that leaves `isPremium` unchanged (true -> true).
  const renewalDate = cachedRenewalDate();
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

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

  async function onRate() {
    if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <Text variant="heading" bold>Settings</Text>

        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">PROFILE</Text>
          <Card>
            {editingName ? (
              <TextInput
                autoFocus
                value={name}
                onChangeText={saveName}
                onBlur={() => setEditingName(false)}
                onSubmitEditing={() => setEditingName(false)}
                placeholder="Enter your first name"
                placeholderTextColor={t.colors.textMuted}
                style={{ color: t.colors.textPrimary, fontFamily: t.fontFamily.regular, fontSize: t.fontSize.body }}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditingName(true)}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
              >
                <Text>Name</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
                  <Text tone="muted">{name || "Add your name"}</Text>
                  <Ionicons name="pencil" size={16} color={t.colors.textMuted} />
                </View>
              </Pressable>
            )}
          </Card>
          <Text tone="muted" variant="subheadline">
            We use your first name to personalize the app — like your Home greeting. It stays on
            this device and is never uploaded anywhere.
          </Text>
        </View>

        {/* Non-premium users see no upsell here (docs/08, 2026-09-21): the
            paywall now lives in onboarding (soft, skippable) and as the Scan
            tab's hard lock — Settings only needs to show an active
            subscriber their own plan/renewal info. */}
        {isPremium && (
          <View style={{ gap: t.spacing.sm }}>
            <Text tone="muted" variant="caption">SUBSCRIPTION</Text>
            <Card style={{ gap: t.spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text bold>Flagged Pro</Text>
                <StatusPill label="Active" />
              </View>
              <Text tone="muted">
                {renewalDate
                  ? `Renews ${renewalDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
                  : "$24.99/yr, auto-renewing"}
              </Text>
              {MANAGE_SUBSCRIPTION_URL && (
                <Button
                  title="Manage Subscription"
                  kind="secondary"
                  onPress={() => Linking.openURL(MANAGE_SUBSCRIPTION_URL)}
                />
              )}
            </Card>
          </View>
        )}

        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">SUPPORT</Text>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <SettingsRow
              icon="shield-outline"
              label="Privacy Policy"
              divider={false}
              onPress={() => Linking.openURL("https://flagged.app/privacy")}
            />
            <SettingsRow
              icon="document-text-outline"
              label="Terms of Service"
              onPress={() => Linking.openURL("https://flagged.app/terms")}
            />
            <SettingsRow
              icon="chatbubble-outline"
              label="Contact Support"
              onPress={() => Linking.openURL("mailto:support@flagged.app")}
            />
            <SettingsRow icon="star-outline" label="Rate Flagged" onPress={onRate} />
            <SettingsRow icon="refresh-outline" label="Restore Purchase" onPress={onRestore} loading={restoring} />
          </Card>
        </View>

        <View style={{ alignItems: "center", gap: 4, paddingVertical: t.spacing.md }}>
          <Text tone="muted" variant="caption">Flagged v{appVersion}</Text>
          <Text tone="muted" variant="caption">100% offline · No account · No cloud</Text>
        </View>

        {__DEV__ && (
          <View style={{ gap: t.spacing.sm }}>
            <Text tone="muted" variant="caption">DEVELOPER (dev builds only)</Text>
            <Card style={{ gap: t.spacing.sm }}>
              <Button
                title={isPremium ? "Turn OFF Premium" : "Turn ON Premium"}
                kind="secondary"
                onPress={() => {
                  const next = !isPremium;
                  // Persist to the offline cache too, not just the in-memory
                  // store — otherwise the next app-foreground entitlement
                  // check silently reverts this back to free.
                  setDevPremiumOverride(next);
                  setPremium(next);
                  setDevNote(next ? "Premium on — trial/subscribed." : "Premium off.");
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
