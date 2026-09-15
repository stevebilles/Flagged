import React, { useCallback, useMemo, useState } from "react";
import { View, LayoutChangeEvent } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Screen, Text, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { getPantryItem, getProfile } from "../src/db/repositories";
import { extractIngredientList } from "../src/matching/normalize";
import { evaluateScan } from "../src/domain/scanService";
import { evaluateRecheck } from "../src/domain/recheckEngine";
import { logScanDebug } from "../src/domain/scanDebug";
import { useCameraCapture } from "../src/ocr/CameraScanner";

/**
 * Recheck capture (docs/07 §7.1). Reached from the Pantry intercept modal after
 * the user confirms they have a NEWLY PURCHASED box. Runs a completely fresh
 * scan and compares it against the item's saved profile snapshot — no
 * ingredient text is stored or diffed (2026-09-14; see docs/07 §7.1 for why).
 *
 * Always evaluated against the item's OWN profile (`item.profileId`), never
 * whichever profile happens to be globally active (a real bug, fixed the same
 * day) — a card saved under Steve's profile must always recheck against
 * Steve's filters, regardless of which profile tab is currently open.
 *
 * Renders the camera/crop tool inline in this screen's own icon/title area
 * (docs/14, 2026-09-13) rather than a full-screen takeover, matching the
 * Scan tab's own approach.
 */
export default function RecheckCapture() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setLastRecheck = useAppStore((s) => s.setLastRecheck);

  const item = useMemo(() => (id ? getPantryItem(id) : null), [id]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  function runRecheck(rawParagraph: string, source: "camera" | "paste" = "camera") {
    setError(null);
    if (!item) {
      setError("That pantry item no longer exists.");
      return;
    }
    const profile = getProfile(item.profileId);
    if (!profile) {
      setError("This item's profile no longer exists.");
      return;
    }
    // See scan.tsx's runScan: a camera capture is already scoped to the
    // guide box (guideBox.ts) — the box IS the search area, so its text is
    // used as-is rather than hunting for "the ingredients section" inside
    // an already-targeted capture (real 2026-09-13 failure: that hunt broke
    // on an OCR punctuation slip and extracted the wrong language).
    const paragraph = source === "camera" ? rawParagraph : extractIngredientList(rawParagraph);
    // Reusing evaluateScan (matching + attribution, same as a normal Scan)
    // rather than reimplementing it here also means a recheck now correctly
    // rejects an illegible capture instead of silently mismatching, which
    // the old text-diff version never checked for.
    const evaln = evaluateScan(paragraph, profile);
    if (evaln.status === "aborted") {
      setError("Couldn't read an ingredient list. Try again.");
      return;
    }
    const outcome = evaluateRecheck(evaln.result.isClean, evaln.result.matches, item.profileSnapshot);
    logScanDebug("recheck", rawParagraph, paragraph, `recheck → ${outcome.kind}`);

    setLastRecheck({
      itemId: item.itemId,
      brandName: item.brandName,
      productName: item.productName,
      outcome,
    });
    // Typed-routes types for this new file are generated on dev-server start.
    router.replace("/recheck-result" as never);
  }

  async function onPaste() {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text?.trim()) {
        setError("Clipboard is empty. Copy the new ingredient list first.");
        return;
      }
      runRecheck(text, "paste");
    } catch {
      setError("Couldn't read the clipboard.");
    }
  }

  const { boxContent, footer } = useCameraCapture({
    active: cameraOpen,
    boxWidth: boxSize.width,
    boxHeight: boxSize.height,
    onCapture: (p) => {
      setCameraOpen(false);
      runRecheck(p);
    },
    onCancel: () => setCameraOpen(false),
  });

  const onBoxLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBoxSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  return (
    <Screen>
      <View
        onLayout={onBoxLayout}
        style={{
          flex: 2,
          alignItems: "center",
          justifyContent: "center",
          gap: t.spacing.md,
          borderRadius: t.radius.lg,
          backgroundColor: cameraOpen ? t.colors.card : undefined,
          overflow: "hidden",
        }}
      >
        {cameraOpen ? (
          boxContent
        ) : (
          <>
            <Ionicons name="repeat" size={72} color={t.colors.textMuted} />
            <Text variant="title" bold style={{ textAlign: "center" }}>
              {item ? `${item.brandName} — ${item.productName}` : "Recheck"}
            </Text>
            <Text tone="muted" style={{ textAlign: "center" }}>
              Scan the ingredient list on the newly purchased box.
            </Text>
            {error && <Text tone="red" style={{ textAlign: "center" }}>{error}</Text>}
          </>
        )}
      </View>

      <View style={{ flex: 1, gap: t.spacing.sm, justifyContent: "flex-end", paddingBottom: t.spacing.lg }}>
        {cameraOpen ? (
          footer
        ) : (
          <>
            <Button title="Open camera" onPress={() => setCameraOpen(true)} />
            <Button title="Paste" kind="secondary" onPress={onPaste} />
            <Button title="Cancel" kind="secondary" onPress={() => router.back()} />
          </>
        )}
      </View>
    </Screen>
  );
}
