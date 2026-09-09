import React, { useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { View, ActivityIndicator, AppState, AppStateStatus } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "../src/design/ThemeProvider";
import { useAppFonts } from "../src/design/useAppFonts";
import { bootstrap } from "../src/bootstrap/init";
import { useAppStore } from "../src/state/appStore";
import { refreshEntitlement } from "../src/purchases/purchases";
import { onAppForeground } from "../src/review/reviewTriggers";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useAppFonts();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    bootstrap()
      .catch((e) => console.warn("bootstrap failed", e))
      .finally(() => setReady(true));
  }, []);

  // On return to the foreground: re-check the purchase entitlement (best-effort,
  // never blocks — a paid user offline keeps the cached value) and evaluate the
  // "Habit" review trigger (docs/08, docs/10).
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next: AppStateStatus) => {
      const cameToForeground =
        appState.current.match(/inactive|background/) && next === "active";
      appState.current = next;
      if (!cameToForeground) return;

      try {
        const premium = await refreshEntitlement();
        useAppStore.getState().setPremium(premium);
        await onAppForeground(premium);
      } catch (e) {
        console.warn("foreground refresh failed", e);
      }
    });
    return () => sub.remove();
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
