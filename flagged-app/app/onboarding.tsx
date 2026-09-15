import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text, Button, Pill } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { getQuickPacks, getProfiles, updateProfile } from "../src/db/repositories";
import { setMetaValue } from "../src/db/appMeta";
import { selectPack } from "../src/domain/activation";
import type { QuickPack } from "../src/domain/types";

/**
 * 7-screen onboarding (docs/04). Copy is verbatim.
 * Screen 3 picks starting Quick Packs; Screen 4 (optional) captures a first name.
 * Both are written to the default profile on finish.
 */

const PACKS_STEP = 2;
const NAME_STEP = 3;

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
    title: "What should we call you?",
    body:
      "We use your first name to personalize the app — like your Home greeting. It stays on this device and is never uploaded anywhere.",
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
      "After your 10 free scans, unlock unlimited scanning for $24.99/year — less than $0.07 a day, for every profile in your house. Cancel anytime.",
  },
];

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const packs = useMemo<QuickPack[]>(() => getQuickPacks(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");

  const isLast = step === SCREENS.length - 1;

  function togglePack(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function finish() {
    const trimmedName = name.trim();
    // Apply selected starting packs + the entered name to the default profile
    // (docs/04 S3 & S4). Name also feeds the Home greeting via app_meta.
    const profile = getProfiles()[0];
    if (profile) {
      let p = profile;
      for (const pack of packs) {
        if (selected.has(pack.id)) p = selectPack(p, pack);
      }
      if (trimmedName) p = { ...p, name: trimmedName };
      updateProfile(p);
    }
    if (trimmedName) setMetaValue("firstName", trimmedName);
    completeOnboarding();
    router.replace("/(tabs)");
  }

  function advance() {
    isLast ? finish() : setStep((x) => x + 1);
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

        {step === PACKS_STEP && (
          <ScrollView
            style={{ maxHeight: 260 }}
            contentContainerStyle={{ gap: t.spacing.sm, flexDirection: "row", flexWrap: "wrap" }}
          >
            {packs.map((p) => (
              <Pill key={p.id} label={p.name} selected={selected.has(p.id)} onPress={() => togglePack(p.id)} />
            ))}
          </ScrollView>
        )}

        {step === NAME_STEP && (
          <View
            style={{
              backgroundColor: t.colors.card,
              borderRadius: t.radius.md,
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.sm,
            }}
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="First name"
              placeholderTextColor={t.colors.textMuted}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={advance}
              style={{
                color: t.colors.textPrimary,
                fontFamily: t.fontFamily.regular,
                fontSize: t.fontSize.body,
                paddingVertical: t.spacing.sm,
              }}
            />
          </View>
        )}
      </View>

      <View style={{ gap: t.spacing.sm, paddingBottom: t.spacing.lg }}>
        <Button title={isLast ? "Start My 10 Free Scans" : "Continue"} onPress={advance} />
        {step === NAME_STEP && (
          <Button title="Skip" kind="secondary" onPress={() => setStep((x) => x + 1)} />
        )}
        {step > 0 && step !== NAME_STEP && !isLast && (
          <Button title="Back" kind="secondary" onPress={() => setStep((x) => x - 1)} />
        )}
      </View>
    </Screen>
  );
}
