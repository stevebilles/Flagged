import React, { useMemo, useState } from "react";
import { ScrollView, TextInput, Image } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { addPantryItem, getProfile } from "../src/db/repositories";
import { snapshotFromProfile } from "../src/domain/activation";
import { displayName } from "../src/domain/types";
import { captureFrontOfPackThumbnail } from "../src/domain/pantryImage";

/**
 * Save-to-Pantry (docs/07 Outcome A): snap the front of the packaging, then
 * name it. The photo is compressed to a local thumbnail; only its URI is stored.
 */
export default function SaveToPantry() {
  const t = useTheme();
  const router = useRouter();
  const lastScan = useAppStore((s) => s.lastScan);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const [brand, setBrand] = useState("");
  const [product, setProduct] = useState("");
  const [photoUri, setPhotoUri] = useState<string>("");
  const [capturing, setCapturing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function takePhoto() {
    setCapturing(true);
    setNote(null);
    try {
      const uri = await captureFrontOfPackThumbnail();
      if (uri) setPhotoUri(uri);
      else setNote("No photo added — you can still save without one.");
    } catch {
      setNote("Couldn't open the camera. You can still save without a photo.");
    } finally {
      setCapturing(false);
    }
  }

  // Every profile this clean scan was run for — one for a normal scan, every profile for an "All
  // profiles" scan. Each gets its OWN card, tagged to it and carrying that profile's own filters
  // (the "who was this scanned for" answer the recheck later depends on), instead of one card
  // guessed onto whichever profile happens to be active.
  const profileIds = lastScan?.profileIds?.length ? lastScan.profileIds : activeProfileId ? [activeProfileId] : [];
  const savingFor = useMemo(
    () => profileIds.map((id) => getProfile(id)).filter((p): p is NonNullable<typeof p> => !!p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastScan, activeProfileId]
  );

  function save() {
    // No ingredient text is stored (docs/07 §7.1, 2026-09-14) — a Pantry save
    // only ever happens on a clean result, so what matters for the recheck
    // later is exactly what each profile was screening for right now. addPantryItem stamps the
    // save time and the snapshot time (docs/03 §3.2).
    const targets = savingFor.length > 0 ? savingFor : [null];
    for (const profile of targets) {
      addPantryItem({
        profileId: profile?.profileId ?? "",
        brandName: brand.trim(),
        productName: product.trim(),
        imageFilePath: photoUri,
        profileSnapshot: profile
          ? snapshotFromProfile(profile)
          : { activeCategoryIds: [], excludedIngredientIds: [], customIngredients: [] },
      });
    }
    useAppStore.getState().setLastScan(null);
    router.replace("/(tabs)/pantry");
  }

  const field = {
    color: t.colors.textPrimary,
    fontFamily: t.fontFamily.regular,
    fontSize: t.fontSize.body,
  };

  return (
    // Centered with the keyboard down; once it's up the content is taller than the space left,
    // so it starts at the top and scrolls on short phones.
    <Screen keyboardAvoiding>
      <ScrollView
        contentContainerStyle={{ gap: t.spacing.md, flexGrow: 1, justifyContent: "center" }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="title" bold>Save to Pantry</Text>
        <Text tone="muted" variant="caption">
          Snap a photo of the front of the packaging, then name it.
        </Text>
        {savingFor.length > 0 && (
          <Text tone="muted" variant="caption">
            {savingFor.length === 1
              ? `Saving under ${displayName(savingFor[0].name)}.`
              : `Saving a copy under each profile you scanned for: ${savingFor.map((p) => displayName(p.name)).join(", ")}.`}
          </Text>
        )}

        <Card style={{ alignItems: "center", gap: t.spacing.sm }}>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{ width: 140, height: 140, borderRadius: t.radius.md }}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="camera-outline" size={64} color={t.colors.textMuted} />
          )}
          <Button
            title={photoUri ? "Retake photo" : "Take photo"}
            kind="secondary"
            loading={capturing}
            onPress={takePhoto}
          />
        </Card>

        {note && <Text tone="muted" variant="caption">{note}</Text>}

        <Card>
          <TextInput placeholder="Brand Name" placeholderTextColor={t.colors.textMuted} value={brand} onChangeText={setBrand} style={field} />
        </Card>
        <Card>
          <TextInput placeholder="Product Name" placeholderTextColor={t.colors.textMuted} value={product} onChangeText={setProduct} style={field} />
        </Card>
        <Button title="Save" onPress={save} disabled={!brand.trim() || !product.trim()} />
        <Button title="Cancel" kind="secondary" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
