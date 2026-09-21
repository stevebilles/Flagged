import React, { useState } from "react";
import { View, ScrollView, TextInput, Pressable, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as StoreReview from "expo-store-review";
import Constants from "expo-constants";
import { Screen, Text, Card, Button, SettingsRow } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { getMetaValue, setMetaValue } from "../../src/db/appMeta";
import { getStats, saveStats } from "../../src/db/repositories";
import { useAppStore } from "../../src/state/appStore";
import { restorePurchases, cachedRenewalDate, setDevPremiumOverride } from "../../src/purchases/purchases";
import { scansRemaining } from "../../src/domain/scanService";
import { FREE_SCAN_LIMIT } from "../../src/domain/types";

const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: undefined,
});

/** The value props on the trial upsell card (docs/17 Settings mockup) — kept
 * as data so the card body is just a .map, not near-identical blocks.
 *
 * No skimpflation bullet (retired 2026-09-14, docs/07 §7.1) — the Pantry
 * recheck redesign no longer stores ingredient order, so that specific claim
 * would be false. Reformulation's subtitle also updated to match the actual
 * mechanism: the recheck detects a NEW match under a filter that was already
 * active, not a literal add/remove text diff (which real-device OCR testing
 * found too unreliable to keep). */
const VALUE_PROPS = [
  { title: "Peace of mind, every aisle, every time", subtitle: "Scan any label, anywhere — no barcode needed" },
  { title: "No database, no lookup, no waiting", subtitle: "Never read a 40-ingredient list by hand again" },
  { title: "Built for real families, not just one diet", subtitle: "A profile for every person in your house" },
  { title: "Add ingredients the defaults don't cover", subtitle: "Track ingredients your family avoids that aren't in our built-in lists" },
  { title: "Catch stealthy reformulations", subtitle: "Get alerted when a saved item now flags something it didn't before" },
] as const;

/** Small filled-outline status pill ("Trial" / "Active") — a one-off look
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
  const router = useRouter();
  const isPremium = useAppStore((s) => s.isPremium);
  const setPremium = useAppStore((s) => s.setPremium);
  const [name, setName] = useState(getMetaValue("firstName") ?? "");
  const [editingName, setEditingName] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [devNote, setDevNote] = useState<string | null>(null);

  const scansUsed = FREE_SCAN_LIMIT - scansRemaining();
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
          <Text tone="muted" variant="caption">
            We use your first name to personalize the app — like your Home greeting. It stays on
            this device and is never uploaded anywhere.
          </Text>
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">SUBSCRIPTION</Text>
          {isPremium ? (
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
          ) : (
            <>
              <Card style={{ gap: t.spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text bold>Free Trial</Text>
                    <Text tone="muted" variant="caption">{scansUsed} of {FREE_SCAN_LIMIT} scans used</Text>
                  </View>
                  <StatusPill label="Trial" />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text tone="muted" variant="caption">Scans used</Text>
                  <Text tone="muted" variant="caption">{scansUsed} / {FREE_SCAN_LIMIT}</Text>
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
              </Card>

              <Card style={{ gap: t.spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text bold>Flagged Pro</Text>
                  <Text tone="cyan" bold variant="title">$24.99 /yr</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
                  <View
                    style={{
                      borderColor: t.colors.cyan,
                      borderWidth: 1,
                      borderRadius: t.radius.pill,
                      paddingHorizontal: t.spacing.sm,
                      paddingVertical: 4,
                    }}
                  >
                    <Text tone="cyan" bold variant="caption">Just $0.07/day</Text>
                  </View>
                  <Text tone="muted" variant="caption">· less than a pack of gum</Text>
                </View>

                <View style={{ gap: t.spacing.sm, marginTop: t.spacing.xs }}>
                  {VALUE_PROPS.map((v) => (
                    <View key={v.title} style={{ flexDirection: "row", alignItems: "flex-start", gap: t.spacing.sm }}>
                      <Ionicons name="checkmark" size={16} color={t.colors.cyan} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text bold>{v.title}</Text>
                        <Text tone="muted" variant="caption">{v.subtitle}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <Button title="Unlock Flagged — $24.99/yr" onPress={() => router.push("/paywall")} />
                <Text tone="muted" variant="caption" style={{ textAlign: "center" }}>
                  Auto-renews yearly · Cancel anytime
                </Text>
              </Card>
            </>
          )}
        </View>

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
                  const next = !isPremium;
                  // Persist to the offline cache too, not just the in-memory
                  // store — otherwise the next app-foreground entitlement
                  // check silently reverts this back to free.
                  setDevPremiumOverride(next);
                  setPremium(next);
                  setDevNote(next ? "Premium on — unlimited scans." : "Premium off.");
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
