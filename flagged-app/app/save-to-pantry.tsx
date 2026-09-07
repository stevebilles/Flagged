import React, { useState } from "react";
import { View, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text, Card, Button } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { addPantryItem } from "../src/db/repositories";
import { tokenize, normalizeParagraph } from "../src/matching/normalize";

/**
 * Save-to-Pantry (docs/07 Outcome A). In the full app this first opens a camera
 * to "snap the front of the packaging"; the photo capture + compression
 * (expo-image-manipulator) is a TODO. Here we capture brand/product and save.
 */
export default function SaveToPantry() {
  const t = useTheme();
  const router = useRouter();
  const lastScan = useAppStore((s) => s.lastScan);
  const [brand, setBrand] = useState("");
  const [product, setProduct] = useState("");

  function save() {
    const ingredients = lastScan ? tokenize(normalizeParagraph(lastScan.paragraph)) : [];
    addPantryItem({
      brandName: brand.trim(),
      productName: product.trim(),
      imageFilePath: "", // TODO(camera): capture + compress front-of-pack thumbnail
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
      <View style={{ gap: t.spacing.md, flex: 1, justifyContent: "center" }}>
        <Text variant="title" bold>Save to Pantry</Text>
        <Text tone="muted" variant="caption">Snap a photo of the front of the packaging (coming in the full build), then name it.</Text>
        <Card>
          <TextInput placeholder="Brand Name" placeholderTextColor={t.colors.textMuted} value={brand} onChangeText={setBrand} style={field} />
        </Card>
        <Card>
          <TextInput placeholder="Product Name" placeholderTextColor={t.colors.textMuted} value={product} onChangeText={setProduct} style={field} />
        </Card>
        <Button title="Save" onPress={save} disabled={!brand.trim() || !product.trim()} />
        <Button title="Cancel" kind="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
