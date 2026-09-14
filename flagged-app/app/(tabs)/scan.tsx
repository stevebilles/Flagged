import React, { useCallback, useMemo, useState } from "react";
import { View, LayoutChangeEvent } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Screen, Text, Button } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { useAppStore } from "../../src/state/appStore";
import { getProfile, getProfiles } from "../../src/db/repositories";
import { canScan, evaluateScan, evaluateScanForAll, scansRemaining } from "../../src/domain/scanService";
import { extractIngredientList } from "../../src/matching/normalize";
import { logScanDebug } from "../../src/domain/scanDebug";
import { recognizeText } from "vision-ocr";
import { useCameraCapture } from "../../src/ocr/CameraScanner";
import { photoResultToParagraph } from "../../src/ocr/recognition";
import { displayName } from "../../src/domain/types";

/**
 * SCAN — the core action tab (docs/05 Tab 2).
 * State 1 Standby · State 2 Hard paywall lockout · State 3 live scan (camera).
 *
 * State 3 (VisionCamera + Apple Vision OCR, docs/14) renders INLINE inside
 * this screen's own existing viewfinder box — never a full-screen takeover.
 * A real user test (2026-09-13) objected to the whole tab (header, profile,
 * buttons) disappearing to scan a label, and pointed out the dashed-border
 * guide already in the box should just become the crop tool in place,
 * rather than launching a separate screen. `useCameraCapture` supplies the
 * box content and footer buttons for whichever phase scanning is in; this
 * screen just drops them into the same slots its idle state uses. Paste
 * reads the clipboard; Choose Photo runs on-device OCR on a picked image.
 * All paths funnel a paragraph string into runScan().
 */
export default function Scan() {
  const t = useTheme();
  const router = useRouter();
  const isPremium = useAppStore((s) => s.isPremium);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const scanAllProfiles = useAppStore((s) => s.scanAllProfiles);
  const setLastScan = useAppStore((s) => s.setLastScan);

  // Re-read on every focus, not just first mount — a scan completed elsewhere
  // (or the dev "reset free scans" button) must update this immediately.
  const [remaining, setRemaining] = useState(() => scansRemaining());
  useFocusEffect(
    useCallback(() => {
      setRemaining(scansRemaining());
      // Reset on the way BACK to this tab, not on the way out (see
      // onCameraCapture) — so a finished scan's last screen doesn't flash
      // to idle mid-transition, but revisiting Scan later still starts
      // fresh instead of showing a stale confirmDone/camera screen.
      setCameraOpen(false);
    }, [])
  );
  const locked = !canScan(isPremium);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  // Who this scan will run for, and whether that's actually possible right now
  // (mirrors Home's "no silent empty state" rule — explain, don't just vanish).
  const scanContext = useMemo(() => {
    if (scanAllProfiles) {
      const count = getProfiles().length;
      return count > 0
        ? { label: `All Profiles (${count})`, ready: true as const }
        : { label: "No profiles yet — add one from Home before scanning", ready: false as const };
    }
    // Check the profile itself, not truthiness of its name — an empty (not
    // yet named) name is a valid, falsy string that would otherwise wrongly
    // read as "no profile selected" even though one genuinely is.
    const profile = activeProfileId ? getProfile(activeProfileId) : null;
    return profile
      ? { label: displayName(profile.name), ready: true as const }
      : { label: "No profile selected — add one from Home before scanning", ready: false as const };
  }, [scanAllProfiles, activeProfileId]);

  function runScan(rawParagraph: string, source: "camera" | "paste" | "photo" = "camera") {
    setError(null);
    // Strip everything that isn't the ingredient list (2nd language, nutrition
    // panel, marketing) before it reaches the matcher or the results screen.
    const paragraph = extractIngredientList(rawParagraph);

    let evaln;
    let scannedFor: string;
    let profileIds: string[];
    if (scanAllProfiles) {
      const profiles = getProfiles();
      if (profiles.length === 0) {
        setError("No profiles yet — add one from Home first.");
        return;
      }
      evaln = evaluateScanForAll(paragraph, profiles);
      scannedFor = `all ${profiles.length} profile${profiles.length === 1 ? "" : "s"}`;
      profileIds = profiles.map((p) => p.profileId);
    } else {
      const profile = activeProfileId ? getProfile(activeProfileId) : null;
      if (!profile) {
        setError("No active profile.");
        return;
      }
      evaln = evaluateScan(paragraph, profile);
      scannedFor = displayName(profile.name);
      profileIds = [profile.profileId];
    }

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
    setLastScan({ paragraph, matches: evaln.result.matches, isClean: evaln.result.isClean, scannedFor, profileIds });
    router.push("/results");
  }

  function onCameraCapture(paragraph: string) {
    // Deliberately NOT resetting cameraOpen here: doing so used to flip this
    // screen back to its idle "POINT AT INGREDIENT LIST" state a frame
    // before the push to /results finished animating in, flashing the idle
    // box behind the transition (2026-09-13). The camera stays "open"
    // (still showing its last confirmDone content) all the way through the
    // navigation instead — see the useFocusEffect below, which resets it
    // only once this tab is actually revisited, not on the way out.
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
      const result = await recognizeText(picked.assets[0].uri);
      runScan(photoResultToParagraph(result), "photo");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't read that photo.");
    }
  }

  const { boxContent, footer } = useCameraCapture({
    active: cameraOpen,
    boxWidth: boxSize.width,
    boxHeight: boxSize.height,
    onCapture: onCameraCapture,
    onCancel: () => setCameraOpen(false),
  });

  const onBoxLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBoxSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

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

  // State 1 — standby / State 3 — live scan, same shell either way (2026-09-13:
  // the whole tab used to disappear behind a full-screen camera; now only the
  // box and button contents change).
  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="heading" bold>Scan</Text>
        {!isPremium && (
          <View
            style={{
              borderRadius: t.radius.pill,
              borderWidth: 1,
              borderColor: t.colors.cyan,
              paddingVertical: 6,
              paddingHorizontal: t.spacing.sm,
            }}
          >
            <Text tone="cyan" bold variant="caption">
              {remaining} / 10 SCANS LEFT
            </Text>
          </View>
        )}
      </View>

      <View
        onLayout={onBoxLayout}
        style={{
          flex: 1,
          marginTop: t.spacing.lg,
          borderRadius: t.radius.lg,
          backgroundColor: t.colors.card,
          alignItems: "center",
          justifyContent: "center",
          gap: t.spacing.sm,
          overflow: "hidden",
        }}
      >
        {cameraOpen ? (
          boxContent
        ) : (
          <View
            style={{
              width: "70%",
              height: "48%",
              borderWidth: 2,
              borderStyle: "dashed",
              borderRadius: t.radius.md,
              borderColor: t.colors.cyan,
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="scan-outline" size={28} color={t.colors.cyan} />
            <Text tone="cyan" bold variant="caption" style={{ textAlign: "center" }}>
              POINT AT{"\n"}INGREDIENT LIST
            </Text>
          </View>
        )}
      </View>

      {!cameraOpen && (
        <>
          <Text tone="muted" variant="caption" style={{ textAlign: "center", marginTop: t.spacing.sm }}>
            Hold steady over the ingredient list
          </Text>
          <Text tone="muted" style={{ textAlign: "center", marginTop: t.spacing.xs }}>
            {scanContext.ready ? (
              <>
                Profile: <Text tone="cyan" bold>{scanContext.label}</Text>
              </>
            ) : (
              <Text tone="warning" bold>{scanContext.label}</Text>
            )}
          </Text>
        </>
      )}
      {error && (
        <Text tone="red" style={{ textAlign: "center", marginTop: t.spacing.xs }}>
          {error}
        </Text>
      )}

      <View style={{ gap: t.spacing.sm, marginTop: t.spacing.lg, paddingBottom: t.spacing.lg }}>
        {cameraOpen ? (
          footer
        ) : (
          <>
            <Button title="🎥  Scan Label" onPress={() => setCameraOpen(true)} />
            <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
              <Button title="Paste Text" kind="secondary" onPress={onPaste} style={{ flex: 1 }} />
              <Button title="Choose Photo" kind="secondary" onPress={onChoosePhoto} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
