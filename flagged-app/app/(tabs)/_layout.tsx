import React, { useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/design/ThemeProvider";
import { getActivePantryItems } from "../../src/db/repositories";
import { countDuePantryItems } from "../../src/domain/pantryDue";

/** The 4-tab hub: Home · Scan · Pantry · Settings (docs/05). No FAB. */
export default function TabsLayout() {
  const t = useTheme();

  // Red dot on the Pantry tab while any saved item is due for its 30-day recheck
  // (docs/05, docs/08) — the in-app stand-in for a notification. Re-checked when
  // the tabs change and when the app returns to the foreground.
  const [dueCount, setDueCount] = useState(0);
  const refreshDue = useCallback(() => setDueCount(countDuePantryItems(getActivePantryItems())), []);
  useEffect(() => {
    refreshDue();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refreshDue();
    });
    return () => sub.remove();
  }, [refreshDue]);

  return (
    <Tabs
      screenListeners={{ focus: refreshDue, state: refreshDue }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.cyan,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.card, borderTopColor: t.colors.canvas },
        tabBarLabelStyle: { fontFamily: t.fontFamily.regular },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: "Scan", tabBarIcon: ({ color, size }) => <Ionicons name="scan-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: "Pantry",
          tabBarAccessibilityLabel: dueCount > 0 ? "Pantry, items due for a recheck" : "Pantry",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="file-tray-stacked-outline" color={color} size={size} />
              {dueCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -5,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: t.colors.red,
                  }}
                />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
