import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Button, Card } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { useAppStore } from "../../src/state/appStore";
import { getProfile } from "../../src/db/repositories";
import { canScan, evaluateScan, scansRemaining } from "../../src/domain/scanService";

/**
 * SCAN — the core action tab (docs/05 Tab 2).
 * State 1 Standby · State 2 Hard paywall lockout · State 3 live scan (camera).
 *
 * The live camera (State 3) uses react-native-vision-camera frame processors +
 * an on-device OCR plugin; that native piece is stubbed here (see runManualScan)
 * so the skeleton runs in any environment. See docs/06 and CAMERA TODO below.
 */
export default function Scan() {
  const t = useTheme();
  const router = useRouter();
  const isPremium = useAppStore((s) => s.isPremium);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setLastScan = useAppStore((s) => s.setLastScan);

  const remaining = useMemo(() => scansRemaining(), []);
  const locked = !canScan(isPremium);
  const [error, setError] = useState<string | null>(null);

  function runScan(paragraph: string) {
    setError(null);
    const profile = activeProfileId ? getProfile(activeProfileId) : null;
    if (!profile) {
      setError("No active profile.");
      return;
    }
    const evaln = evaluateScan(paragraph, profile);
    if (evaln.status === "aborted") {
      // Illegible does NOT consume a free scan (docs/06/08).
      setError("Couldn't read an ingredient list. Try again — this won't use a free scan.");
      return;
    }
    setLastScan({ paragraph, matches: evaln.result.matches, isClean: evaln.result.isClean });
    router.push("/results");
  }

  // TODO(camera): replace with VisionCamera live capture → sortBlocks/assembleParagraph
  // (src/ocr/stitch.ts) → runScan(paragraph). Stubbed sample for the skeleton:
  function startCameraScanner() {
    runScan(
      "Ingredients: enriched flour, sugar, palm oil, red 40, soy lecithin, salt, natural flavor."
    );
  }

  if (locked) {
    // State 2 — hard paywall lockout
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.spacing.lg }}>
          <Ionicons name="lock-closed" size={72} color={t.colors.textMuted} />
          <Text variant="title" bold style={{ textAlign: "center" }}>
            You've used all 10 free scans
          </Text>
          <Text tone="muted" style={{ textAlign: "center" }}>
            Ditch the $40/year subscriptions. Unlock unlimited, offline label reading for life.
          </Text>
          <Text tone="muted" style={{ textDecorationLine: "line-through" }}>$39.99</Text>
          <Button title="Unlock Unlimited Scans - $24.99" onPress={() => router.push("/paywall")} />
        </View>
      </Screen>
    );
  }

  // State 1 — standby
  return (
    <Screen>
      <View style={{ flex: 2, alignItems: "center", justifyContent: "center", gap: t.spacing.md }}>
        {!isPremium && (
          <Card style={{ borderRadius: t.radius.pill, paddingVertical: t.spacing.sm }}>
            <Text tone="cyan" bold>
              Scans Remaining: {remaining} / 10
            </Text>
          </Card>
        )}
        <Ionicons name="scan-outline" size={96} color={t.colors.textMuted} />
        <Text tone="muted">Point at an ingredient list — no shutter needed.</Text>
        {error && <Text tone="red" style={{ textAlign: "center" }}>{error}</Text>}
      </View>

      <View style={{ flex: 1, gap: t.spacing.sm, justifyContent: "flex-end", paddingBottom: t.spacing.lg }}>
        <Button title="Start Camera Scanner" onPress={startCameraScanner} />
        <Button title="Paste" kind="secondary" onPress={() => runScan("Ingredients: water, high fructose corn syrup, citric acid, yellow 5.")} />
        <Button title="Choose Photo" kind="secondary" onPress={() => runScan("Ingredients: oats, honey, almonds, sea salt.")} />
      </View>
    </Screen>
  );
}
