import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, Pressable, Switch } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen, Text, Card, Button, Pill, Badge } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import {
  getCategories,
  getIngredientTermMap,
  getProfile,
  getQuickPacks,
  createProfile,
  updateProfile,
} from "../src/db/repositories";
import {
  addCustomIngredient,
  isPackActive,
  removeCustomIngredient,
  toggleCategory,
  toggleIngredientExcluded,
  togglePack,
} from "../src/domain/activation";
import type { Category, Profile, ParentGroup } from "../src/domain/types";

const GROUP_ORDER: ParentGroup[] = ["Allergens", "Sugars", "Additives", "Dietary"];

/**
 * Profile editor (docs/05 Home → Edit). Quick Pack pills, categories grouped by
 * parent with classification badges + on/off switches, expandable individual
 * ingredient toggles, and custom ingredients. Activation per docs/data-schema.md.
 */
export default function ProfileEdit() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; new?: string }>();
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);

  const packs = useMemo(() => getQuickPacks(), []);
  const categories = useMemo(() => getCategories(), []);
  const termById = useMemo(() => getIngredientTermMap(), []);

  const [profile, setProfile] = useState<Profile>(() => {
    if (params.new) return createProfile("New Profile");
    return getProfile(params.id ?? "") ?? createProfile("New Profile");
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  const activeSet = new Set(profile.activeCategoryIds);
  const excludedSet = new Set(profile.excludedIngredientIds);

  function persist(next: Profile) {
    setProfile(next);
    updateProfile(next);
  }

  function save() {
    updateProfile(profile);
    setActiveProfile(profile.profileId);
    router.back();
  }

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    cats: categories.filter((c) => c.parentGroup === g),
  })).filter((x) => x.cats.length > 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }}>
        <Text variant="title" bold>Edit Profile</Text>
        <Card>
          <TextInput
            value={profile.name}
            onChangeText={(v) => persist({ ...profile, name: v })}
            placeholder="Profile name"
            placeholderTextColor={t.colors.textMuted}
            style={{ color: t.colors.textPrimary, fontFamily: t.fontFamily.bold, fontSize: t.fontSize.body }}
          />
        </Card>

        {/* QUICK PACKS */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">QUICK PACKS</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {packs.map((p) => (
              <Pill
                key={p.id}
                label={p.name}
                selected={isPackActive(profile, p)}
                onPress={() => persist(togglePack(profile, p, packs))}
              />
            ))}
          </View>
        </View>

        {/* CUSTOM */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">CUSTOM — your own ingredients</Text>
          <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
            <Card style={{ flex: 1 }}>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder="e.g. carrageenan"
                placeholderTextColor={t.colors.textMuted}
                style={{ color: t.colors.textPrimary, fontFamily: t.fontFamily.regular }}
              />
            </Card>
            <Button
              title="Add"
              onPress={() => {
                if (custom.trim()) {
                  persist(addCustomIngredient(profile, custom));
                  setCustom("");
                }
              }}
            />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {profile.customIngredients.map((c) => (
              <Pill key={c} label={`${c}  ✕`} selected onPress={() => persist(removeCustomIngredient(profile, c))} />
            ))}
          </View>
        </View>

        {/* CATEGORIES grouped by parent */}
        {grouped.map(({ group, cats }) => (
          <View key={group} style={{ gap: t.spacing.sm }}>
            <Text tone="muted" variant="caption">{group.toUpperCase()}</Text>
            {cats.map((cat: Category) => (
              <Card key={cat.id} style={{ gap: t.spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text bold>{cat.name}</Text>
                    <Pressable onPress={() => setExpanded(expanded === cat.id ? null : cat.id)}>
                      <Text tone="muted" variant="caption">
                        {cat.ingredientIds.length} names · tap for details
                      </Text>
                    </Pressable>
                    <Badge classification={cat.classification} />
                  </View>
                  <Switch
                    value={activeSet.has(cat.id)}
                    onValueChange={() => persist(toggleCategory(profile, cat.id))}
                    trackColor={{ true: t.colors.cyan, false: t.colors.textMuted }}
                  />
                </View>

                {expanded === cat.id && (
                  <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: t.colors.canvas, paddingTop: t.spacing.sm }}>
                    {cat.ingredientIds.map((ingId) => {
                      const excluded = excludedSet.has(ingId);
                      return (
                        <View key={ingId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text tone={excluded ? "muted" : "primary"} style={excluded ? { textDecorationLine: "line-through" } : undefined}>
                            {termById.get(ingId) ?? ingId}
                          </Text>
                          <Switch
                            value={!excluded}
                            onValueChange={() => persist(toggleIngredientExcluded(profile, ingId))}
                            trackColor={{ true: t.colors.cyan, false: t.colors.textMuted }}
                          />
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            ))}
          </View>
        ))}

        <Button title="Done" onPress={save} />
      </ScrollView>
    </Screen>
  );
}
