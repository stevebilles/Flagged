import React, { useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text, Button, Pill } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { getQuickPacks, getProfiles, updateProfile } from "../src/db/repositories";
import { selectPack } from "../src/domain/activation";
import type { QuickPack } from "../src/domain/types";

/**
 * 6-screen onboarding (docs/04). Copy is verbatim.
 * Screen 3 lets the user pick starting Quick Packs, written to the default profile.
 */

const SCREENS = [
  {
    title: "Reading food labels is exhausting.",
    body:
      "The FDA allows thousands of confusing additives in our food, and memorizing which ones are approved for your family shouldn't be your full-time job.",
  },
  {
    title: "No barcodes. No health scores.",
    body:
      "Flagged doesn't use barcodes or arbitrary 'health scores.' Our offline X-Ray instantly reads raw text on any printed label.",
  },
  {
    title: "Personalize your scanner",
    body:
      "What are you trying to avoid? Select a starting filter to customize your X-Ray (you can change this or add more later).",
  },
  {
    title: "Your command center",
    body: "Home, Scan, Pantry, and Settings.",
  },
  {
    title: "You're all set!",
    body:
      "You have 10 free scans to test Flagged in the real world. We've unlocked every feature—including Custom Ingredients and Multiple Family Profiles—so you can see the magic for yourself.",
  },
  {
    title: "Founding Member pricing",
    body:
      "Ditch the $40/year subscriptions. After your 10 free scans, unlock unlimited scanning for life for a one-time fee of $24.99. No hidden fees. Pay once, own it forever.",
  },
];

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const packs = useMemo<QuickPack[]>(() => getQuickPacks(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isLast = step === SCREENS.length - 1;

  function togglePack(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function finish() {
    // Apply selected starting packs to the default profile (docs/04 S3).
    const profile = getProfiles()[0];
    if (profile) {
      let p = profile;
      for (const pack of packs) {
        if (selected.has(pack.id)) p = selectPack(p, pack);
      }
      updateProfile(p);
    }
    completeOnboarding();
    router.replace("/(tabs)");
  }

  const s = SCREENS[step];

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: t.spacing.lg }}>
        <Text tone="muted" variant="caption">
          {step + 1} / {SCREENS.length}
        </Text>
        <Text variant="heading" bold>
          {s.title}
        </Text>
        <Text tone="muted" variant="body">
          {s.body}
        </Text>

        {step === 2 && (
          <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: t.spacing.sm, flexDirection: "row", flexWrap: "wrap" }}>
            {packs.map((p) => (
              <Pill key={p.id} label={p.name} selected={selected.has(p.id)} onPress={() => togglePack(p.id)} />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={{ gap: t.spacing.sm, paddingBottom: t.spacing.lg }}>
        <Button
          title={isLast ? "Start My 10 Free Scans" : "Continue"}
          onPress={() => (isLast ? finish() : setStep((x) => x + 1))}
        />
        {step > 0 && !isLast && (
          <Button title="Back" kind="secondary" onPress={() => setStep((x) => x - 1)} />
        )}
      </View>
    </Screen>
  );
}
