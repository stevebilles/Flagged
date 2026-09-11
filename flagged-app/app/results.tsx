import React, { useEffect, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button, Badge } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { getProfile } from "../src/db/repositories";
import { commitScanStats, canScan } from "../src/domain/scanService";
import { onFlaggedResultDismissed } from "../src/review/reviewTriggers";

/**
 * Results screen (docs/07, docs/17 mockup). Clean (cyan) vs Flagged (red).
 * Commits stats on mount (this scan successfully reached a result — docs/06/08).
 * Highlights offending tokens in the paragraph and explains the breakdown.
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
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.colors.card,
              alignItems: "center",
              justifyContent: "center",
              marginRight: t.spacing.sm,
            }}
          >
            <Ionicons name="chevron-back" size={18} color={t.colors.textPrimary} />
          </Pressable>
          <Text variant="title" bold>Result</Text>
        </View>

        <Card style={{ alignItems: "center", gap: t.spacing.sm }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: clean ? "rgba(34,211,238,0.12)" : "rgba(239,68,68,0.12)",
            }}
          >
            <Ionicons
              name={clean ? "checkmark-circle" : "close-circle"}
              size={40}
              color={clean ? t.colors.cyan : t.colors.red}
            />
          </View>
          <Text variant="title" bold tone={clean ? "cyan" : "red"}>
            {clean ? "No red flags" : "Red flags detected"}
          </Text>
          <Text tone="muted">
            {clean
              ? `All ingredients clear${profileName ? ` for ${profileName}` : ""}`
              : `${lastScan.matches.length} match${lastScan.matches.length === 1 ? "" : "es"} found${
                  profileName ? ` for ${profileName}` : ""
                }`}
          </Text>
        </Card>

        {/* Ingredient paragraph with the matched words highlighted */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">INGREDIENTS</Text>
          <Card>
            <Text style={{ lineHeight: 24 }}>
              {segments.map((seg, idx) => (
                <Text key={idx} tone={seg.flag ? "red" : "primary"} bold={seg.flag}>
                  {seg.text}
                </Text>
              ))}
            </Text>
          </Card>
        </View>

        {!clean && (
          <View style={{ gap: t.spacing.sm }}>
            <Text tone="muted" variant="caption">
              MATCHES — {lastScan.matches.length} FOUND
            </Text>
            <Card style={{ gap: t.spacing.md }}>
              {lastScan.matches.map((m, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: t.spacing.sm,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: t.colors.canvas,
                    paddingTop: i === 0 ? 0 : t.spacing.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text bold>{m.token}</Text>
                    <Text tone="muted" variant="caption">
                      matches {m.categoryName ?? m.term}
                      {m.kind === "fuzzy" ? ` (likely "${m.term}", ${(m.score * 100).toFixed(0)}%)` : ""}
                    </Text>
                  </View>
                  <Badge classification={m.classification ?? "preference"} />
                </View>
              ))}
            </Card>
          </View>
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
