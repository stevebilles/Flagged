import React, { useEffect, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { getProfile } from "../src/db/repositories";
import { commitScanStats, canScan } from "../src/domain/scanService";
import { onFlaggedResultDismissed } from "../src/review/reviewTriggers";

/**
 * Results screen (docs/07). Clean (cyan) vs Flagged (red). Commits stats on mount
 * (this scan successfully reached a result — docs/06/08). Highlights offending
 * tokens in the paragraph and explains the breakdown.
 */
export default function Results() {
  const t = useTheme();
  const router = useRouter();
  const isPremium = useAppStore((s) => s.isPremium);
  const lastScan = useAppStore((s) => s.lastScan);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const profileName = useMemo(
    () => (activeProfileId ? getProfile(activeProfileId)?.name ?? "" : ""),
    [activeProfileId]
  );

  useEffect(() => {
    if (lastScan) commitScanStats({ tokens: [], matches: lastScan.matches, isClean: lastScan.isClean }, isPremium);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flaggedTerms = useMemo(
    () => (lastScan?.matches ?? []).map((m) => m.token.toLowerCase().trim()).filter(Boolean),
    [lastScan]
  );

  if (!lastScan) {
    return (
      <Screen>
        <Text>No scan to show.</Text>
        <Button title="Return to Home" onPress={() => router.replace("/(tabs)")} />
      </Screen>
    );
  }

  const clean = lastScan.isClean;
  const justHitLimit = !isPremium && !canScan(false);

  async function dismiss(to: "home" | "scan") {
    if (!clean) await onFlaggedResultDismissed(lastScan!.matches.length);
    useAppStore.getState().setLastScan(null);
    router.replace(to === "home" ? "/(tabs)" : "/(tabs)/scan");
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }}>
        <View style={{ alignItems: "center", gap: t.spacing.sm }}>
          <Ionicons
            name={clean ? "checkmark-circle" : "warning"}
            size={64}
            color={clean ? t.colors.cyan : t.colors.red}
          />
          <Text variant="title" bold tone={clean ? "cyan" : "red"}>
            {clean ? "No red flags detected." : "Red flags detected."}
          </Text>
        </View>

        {/* Ingredient paragraph with flagged tokens highlighted */}
        <Card>
          <Text style={{ lineHeight: 24 }}>
            {lastScan.paragraph.split(/([,()])/).map((seg, idx) => {
              const segLower = seg.toLowerCase();
              const isFlag = flaggedTerms.some((f) => segLower.includes(f));
              return (
                <Text key={idx} tone={isFlag ? "red" : "primary"} bold={isFlag}>
                  {seg}
                </Text>
              );
            })}
          </Text>
        </Card>

        {!clean && (
          <Card>
            <Text bold>Why it was flagged</Text>
            {lastScan.matches.map((m, i) => {
              const filter = m.categoryName ?? m.term;
              const who = profileName ? `${profileName}'s ` : "your ";
              return (
                <Text key={i} tone="muted" variant="caption">
                  • "{m.token}" — matches {who}
                  {filter} filter
                  {m.kind === "fuzzy" ? ` (likely "${m.term}", ${(m.score * 100).toFixed(0)}% match)` : ""}
                </Text>
              );
            })}
          </Card>
        )}

        <View style={{ gap: t.spacing.sm }}>
          {clean && <Button title="Save to Pantry" onPress={() => router.push("/save-to-pantry")} />}
          {justHitLimit ? (
            <Button title="Unlock Unlimited Scans" onPress={() => router.push("/paywall")} />
          ) : (
            <Button title="Scan Another Item" kind="secondary" onPress={() => dismiss("scan")} />
          )}
          <Button title="Return to Home" kind="secondary" onPress={() => dismiss("home")} />
        </View>
      </ScrollView>
    </Screen>
  );
}
