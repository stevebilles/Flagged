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

  // Split the paragraph so ONLY the exact matched words/phrases are highlighted —
  // not the whole comma-chunk they sit in (which was reddening "Contains:" etc).
  const segments = useMemo(() => {
    const para = lastScan?.paragraph ?? "";
    const tokens = Array.from(
      new Set((lastScan?.matches ?? []).map((m) => m.token.trim()).filter((s) => s.length > 1))
    ).sort((a, b) => b.length - a.length); // longest first: "wheat flour" before "wheat"
    if (tokens.length === 0) return [{ text: para, flag: false }];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z])(${tokens.map(esc).join("|")})(?![A-Za-z])`, "gi");
    const out: { text: string; flag: boolean }[] = [];
    let last = 0;
    for (let m = re.exec(para); m; m = re.exec(para)) {
      if (m.index > last) out.push({ text: para.slice(last, m.index), flag: false });
      out.push({ text: m[0], flag: true });
      last = m.index + m[0].length;
    }
    if (last < para.length) out.push({ text: para.slice(last), flag: false });
    return out;
  }, [lastScan]);

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

        {/* Ingredient paragraph with the matched words highlighted */}
        <Card>
          <Text style={{ lineHeight: 24 }}>
            {segments.map((seg, idx) => (
              <Text key={idx} tone={seg.flag ? "red" : "primary"} bold={seg.flag}>
                {seg.text}
              </Text>
            ))}
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
