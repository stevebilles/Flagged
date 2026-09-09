import React, { useMemo } from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text, Card, Pill, Button } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { useAppStore } from "../../src/state/appStore";
import { getProfiles, getStats } from "../../src/db/repositories";
import { getMetaValue } from "../../src/db/appMeta";

/** HOME — dashboard & filter hub (docs/05 Tab 1). */
export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);

  const profiles = useMemo(() => getProfiles(), [activeProfileId]);
  const stats = useMemo(() => getStats(), []);
  const firstName = getMetaValue("firstName") ?? "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }}>
        <Text variant="heading" bold>
          {firstName ? `Good Morning, ${firstName}.` : "Good Morning."}
        </Text>

        {/* Shopping For — profile chips */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">
            SHOPPING FOR
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm }}>
            {profiles.map((p) => (
              <Pill
                key={p.profileId}
                label={p.name}
                selected={p.profileId === activeProfileId}
                onPress={() => setActiveProfile(p.profileId)}
              />
            ))}
            <Pill label="Add Profile +" onPress={() => router.push("/profile-edit?new=1")} />
          </ScrollView>
          {activeProfileId && (
            <Button
              title="Edit active profile"
              kind="secondary"
              onPress={() => router.push(`/profile-edit?id=${activeProfileId}`)}
            />
          )}
        </View>

        {/* Protection Summary — the pillars of value (docs/05) */}
        <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
          <Pillar label="Labels Read" value={stats.totalLabelsRead} />
          <Pillar label="Red Flags Caught" value={stats.totalRedFlagsCaught} />
          <Pillar label="Clean Scans" value={stats.totalCleanScans} />
        </View>

        {/* Recheck pillars — meaningful once the user has a pantry (docs/05).
            Shown only once at least one is non-zero to avoid clutter early. */}
        {(stats.totalSkimpflationCaught > 0 || stats.totalReformulationsCaught > 0) && (
          <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
            <Pillar label="Skimpflation Caught" value={stats.totalSkimpflationCaught} />
            <Pillar label="Reformulations Caught" value={stats.totalReformulationsCaught} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Pillar({ label, value }: { label: string; value: number }) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, alignItems: "center" }}>
      <Text variant="display" bold tone="cyan">
        {value}
      </Text>
      <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
        {label}
      </Text>
    </Card>
  );
}
