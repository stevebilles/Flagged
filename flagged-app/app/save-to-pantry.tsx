import React, { useState } from "react";
import { ScrollView, TextInput, Image } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { addPantryItem } from "../src/db/repositories";
import { tokenize, normalizeParagraph } from "../src/matching/normalize";
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

  function save() {
    const ingredients = lastScan ? tokenize(normalizeParagraph(lastScan.paragraph)) : [];
    addPantryItem({
      // The profile this card belongs to (docs/17 Pantry mockup) — the profile
      // that was active when the scan ran, even if it was checked via "All".
      profileId: activeProfileId ?? lastScan?.profileIds?.[0] ?? "",
      brandName: brand.trim(),
      productName: product.trim(),
      imageFilePath: photoUri,
      originalIngredients: ingredients,
    });
    useAppStore.getState().setLastScan(null);
    router.replace("/(tabs)/pantry");
  }

  const field = {
    color: t.colors.textPrimary,
    fontFamily: t.fontFamily.regular,
    fontSize: t.fontSize.body,
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: t.spacing.md, flexGrow: 1, justifyContent: "center" }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="title" bold>Save to Pantry</Text>
        <Text tone="muted" variant="caption">
          Snap a photo of the front of the packaging, then name it.
        </Text>

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
