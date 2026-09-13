import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Screen, Text, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import {
  getCategories,
  getIngredientTermMap,
  getPantryItem,
  getProfile,
} from "../src/db/repositories";
import { normalizeParagraph, tokenize, extractIngredientList } from "../src/matching/normalize";
import { effectiveRedFlagMeta, effectiveRedFlagTerms } from "../src/domain/activation";
import { evaluateRecheck } from "../src/domain/diffEngine";
import { attributeMatches } from "../src/domain/scanService";
import { logScanDebug } from "../src/domain/scanDebug";
import { CameraScanner } from "../src/ocr/CameraScanner";

/**
 * Recheck capture (docs/07 §7.1). Reached from the Pantry intercept modal after
 * the user confirms they have a NEWLY PURCHASED box. Captures the new ingredient
 * list, diffs it against the saved baseline, and routes to the recheck result.
 */
export default function RecheckCapture() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setLastRecheck = useAppStore((s) => s.setLastRecheck);

  const item = useMemo(() => (id ? getPantryItem(id) : null), [id]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runRecheck(rawParagraph: string) {
    setError(null);
    if (!item) {
      setError("That pantry item no longer exists.");
      return;
    }
    const paragraph = extractIngredientList(rawParagraph);
    const profile = activeProfileId ? getProfile(activeProfileId) : null;
    if (!profile) {
      setError("No active profile.");
      return;
    }
    const categories = getCategories();
    const termMap = getIngredientTermMap();
    const terms = effectiveRedFlagTerms(profile, categories, termMap);
    const meta = effectiveRedFlagMeta(profile, categories, termMap);
    const newIngredients = tokenize(normalizeParagraph(paragraph));

    const outcome = evaluateRecheck(item.originalIngredients, newIngredients, terms);
    if (outcome.kind === "changed_flagged") {
      outcome.matches = attributeMatches(outcome.matches, meta);
    }
    logScanDebug("recheck", rawParagraph, paragraph, `recheck → ${outcome.kind}`);

    setLastRecheck({
      itemId: item.itemId,
      brandName: item.brandName,
      productName: item.productName,
      newIngredients,
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
      runRecheck(text);
    } catch {
      setError("Couldn't read the clipboard.");
    }
  }

  if (cameraOpen) {
    return (
      <CameraScanner
        onCapture={(p) => {
          setCameraOpen(false);
          runRecheck(p);
        }}
        onCancel={() => setCameraOpen(false)}
      />
    );
  }

  return (
    <Screen>
      <View style={{ flex: 2, alignItems: "center", justifyContent: "center", gap: t.spacing.md }}>
        <Ionicons name="repeat" size={72} color={t.colors.textMuted} />
        <Text variant="title" bold style={{ textAlign: "center" }}>
          {item ? `${item.brandName} — ${item.productName}` : "Recheck"}
        </Text>
        <Text tone="muted" style={{ textAlign: "center" }}>
          Scan the ingredient list on the newly purchased box.
        </Text>
        {error && <Text tone="red" style={{ textAlign: "center" }}>{error}</Text>}
      </View>

      <View style={{ flex: 1, gap: t.spacing.sm, justifyContent: "flex-end", paddingBottom: t.spacing.lg }}>
        <Button title="Open camera" onPress={() => setCameraOpen(true)} />
        <Button title="Paste" kind="secondary" onPress={onPaste} />
        <Button title="Cancel" kind="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
