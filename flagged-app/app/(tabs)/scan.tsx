import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Screen, Text, Button, Card } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { useAppStore } from "../../src/state/appStore";
import { getProfile } from "../../src/db/repositories";
import { canScan, evaluateScan, scansRemaining } from "../../src/domain/scanService";
import { extractIngredientList } from "../../src/matching/normalize";
import { logScanDebug } from "../../src/domain/scanDebug";
import { PhotoRecognizer } from "react-native-vision-camera-text-recognition";
import { CameraScanner } from "../../src/ocr/CameraScanner";
import { photoResultToParagraph } from "../../src/ocr/recognition";

/**
 * SCAN — the core action tab (docs/05 Tab 2).
 * State 1 Standby · State 2 Hard paywall lockout · State 3 live scan (camera).
 *
 * State 3 uses the live CameraScanner (VisionCamera + ML Kit OCR, docs/14). Paste
 * reads the clipboard; Choose Photo runs on-device OCR on a picked image. All
 * paths funnel a paragraph string into runScan().
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
  const [cameraOpen, setCameraOpen] = useState(false);

  function runScan(rawParagraph: string, source: "camera" | "paste" | "photo" = "camera") {
    setError(null);
    const profile = activeProfileId ? getProfile(activeProfileId) : null;
    if (!profile) {
      setError("No active profile.");
      return;
    }
    // Strip everything that isn't the ingredient list (2nd language, nutrition
    // panel, marketing) before it reaches the matcher or the results screen.
    const paragraph = extractIngredientList(rawParagraph);
    const evaln = evaluateScan(paragraph, profile);
    if (evaln.status === "aborted") {
      logScanDebug(source, rawParagraph, paragraph, "ABORTED (illegible)");
      // Illegible does NOT consume a free scan (docs/06/08).
      setError("Couldn't read an ingredient list. Try again — this won't use a free scan.");
      return;
    }
    logScanDebug(
      source,
      rawParagraph,
      paragraph,
      evaln.result.isClean
        ? "CLEAN"
        : `FLAGGED (${evaln.result.matches.length}) — ` +
            evaln.result.matches
              .map((mm) => mm.term + (mm.categoryName ? ` [${mm.categoryName}]` : ""))
              .join(", ")
    );
    setLastScan({ paragraph, matches: evaln.result.matches, isClean: evaln.result.isClean });
    router.push("/results");
  }

  function onCameraCapture(paragraph: string) {
    setCameraOpen(false);
    runScan(paragraph, "camera");
  }

  async function onPaste() {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text?.trim()) {
        setError("Clipboard is empty. Copy an ingredient list first.");
        return;
      }
      runScan(text, "paste");
    } catch {
      setError("Couldn't read the clipboard.");
    }
  }

  async function onChoosePhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError("Photo access is needed to scan a saved image.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      // On-device OCR on the still image (docs/06/14). Requires a dev/EAS build
      // (native module) — will not run in Expo Go.
      const result = await PhotoRecognizer({ uri: picked.assets[0].uri, orientation: "portrait" });
      runScan(photoResultToParagraph(result as any), "photo");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't read that photo.");
    }
  }

  // State 3 — live camera scan (full-screen).
  if (cameraOpen) {
    return <CameraScanner onCapture={onCameraCapture} onCancel={() => setCameraOpen(false)} />;
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
            Unlock unlimited, offline label reading for every profile in your house.
          </Text>
          <Text tone="cyan" bold>$24.99/yr · $0.07/day</Text>
          <Button title="Unlock Unlimited Scans - $24.99/yr" onPress={() => router.push("/paywall")} />
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
        <Button title="Start Camera Scanner" onPress={() => setCameraOpen(true)} />
        <Button title="Paste" kind="secondary" onPress={onPaste} />
        <Button title="Choose Photo" kind="secondary" onPress={onChoosePhoto} />
      </View>
    </Screen>
  );
}
