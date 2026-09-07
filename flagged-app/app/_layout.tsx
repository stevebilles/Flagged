import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "../src/design/ThemeProvider";
import { useAppFonts } from "../src/design/useAppFonts";
import { bootstrap } from "../src/app/init";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    bootstrap()
      .catch((e) => console.warn("bootstrap failed", e))
      .finally(() => setReady(true));
  }, []);

  // Wait for both app bootstrap and fonts. Don't block forever if a font fails
  // to load — fall through to the system font rather than hang.
  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111827" }}>
        <ActivityIndicator color="#22D3EE" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="results" options={{ presentation: "card" }} />
      </Stack>
    </ThemeProvider>
  );
}
