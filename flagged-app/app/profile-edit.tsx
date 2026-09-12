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
  createProfile,
  updateProfile,
} from "../src/db/repositories";
import {
  addCustomIngredient,
  removeCustomIngredient,
  toggleCategory,
  toggleIngredientExcluded,
} from "../src/domain/activation";
import type { Category, Profile, ParentGroup } from "../src/domain/types";

const GROUP_ORDER: ParentGroup[] = ["Allergens", "Sugars", "Additives", "Dietary"];

/**
 * Profile editor (docs/05 Home → Edit). Categories grouped by parent with
 * classification badges + on/off switches, expandable individual ingredient
 * toggles, and custom ingredients. Activation per docs/data-schema.md.
 *
 * Quick Packs (bulk-select bundles of categories) were removed from this
 * screen — several packs share a category with each other, and turning one
 * off/on had knock-on effects on the others that kept confusing users no
 * matter how it was explained. Toggling categories directly has no such
 * coupling: each switch does exactly what it shows.
 */
export default function ProfileEdit() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; new?: string }>();
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);

  const categories = useMemo(() => getCategories(), []);
  const termById = useMemo(() => getIngredientTermMap(), []);

  const [profile, setProfile] = useState<Profile>(() => {
    if (params.new) return createProfile("New Profile");
    return getProfile(params.id ?? "") ?? createProfile("New Profile");
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [customNote, setCustomNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const activeSet = new Set(profile.activeCategoryIds);
  const excludedSet = new Set(profile.excludedIngredientIds);

  // Every default ingredient term, lowercased, mapped to the category that
  // owns it — used both to answer "what category is X in?" (search) and to
  // stop a custom ingredient from duplicating one already in the dictionary.
  const termToCategory = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) {
      for (const ingId of cat.ingredientIds) {
        const term = termById.get(ingId);
        if (term) map.set(term.toLowerCase(), cat);
      }
    }
    return map;
  }, [categories, termById]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const results: { ingredientId: string; term: string; category: Category }[] = [];
    for (const cat of categories) {
      for (const ingId of cat.ingredientIds) {
        const term = termById.get(ingId);
        if (term && term.toLowerCase().includes(q)) {
          results.push({ ingredientId: ingId, term, category: cat });
        }
      }
    }
    return results;
  }, [search, categories, termById]);

  function persist(next: Profile) {
    setProfile(next);
    updateProfile(next);
  }

  // Search result tap: make sure this exact ingredient is switched on — turn
  // on its category if needed, and un-exclude the ingredient if it had been
  // individually excluded — then jump to it in the list below.
  function activateIngredient(categoryId: string, ingredientId: string) {
    let next = profile;
    if (!activeSet.has(categoryId)) next = toggleCategory(next, categoryId);
    if (excludedSet.has(ingredientId)) next = toggleIngredientExcluded(next, ingredientId);
    persist(next);
    setExpanded(categoryId);
    setSearch("");
  }

  function addCustom() {
    const t = custom.trim();
    if (!t) return;
    const lower = t.toLowerCase();
    if (profile.customIngredients.includes(lower)) {
      setCustomNote(`"${t}" is already in your custom list.`);
      return;
    }
    const existing = termToCategory.get(lower);
    if (existing) {
      setCustomNote(`"${t}" is already tracked under ${existing.name} — turn that filter on above instead of adding it as custom.`);
      return;
    }
    persist(addCustomIngredient(profile, t));
    setCustom("");
    setCustomNote(null);
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

        {/* FIND AN INGREDIENT */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">FIND AN INGREDIENT</Text>
          <Card>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="e.g. red 40, aspartame, MSG"
              placeholderTextColor={t.colors.textMuted}
              style={{ color: t.colors.textPrimary, fontFamily: t.fontFamily.regular, fontSize: t.fontSize.body }}
            />
          </Card>
          {search.trim().length > 0 &&
            (searchResults.length > 0 ? (
              <View style={{ gap: t.spacing.xs }}>
                {searchResults.slice(0, 15).map((r) => (
                  <Pressable
                    key={r.ingredientId}
                    onPress={() => activateIngredient(r.category.id, r.ingredientId)}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}
                  >
                    <Text style={{ flexShrink: 1 }}>{r.term}</Text>
                    <Text tone={activeSet.has(r.category.id) && !excludedSet.has(r.ingredientId) ? "cyan" : "muted"} variant="caption">
                      {activeSet.has(r.category.id) && !excludedSet.has(r.ingredientId)
                        ? `${r.category.name} · on`
                        : `${r.category.name} · tap to turn on`}
                    </Text>
                  </Pressable>
                ))}
                {searchResults.length > 15 && (
                  <Text tone="muted" variant="caption">
                    +{searchResults.length - 15} more — keep typing to narrow it down.
                  </Text>
                )}
              </View>
            ) : (
              <Text tone="muted">
                No match in our list for "{search.trim()}" — add it as a custom ingredient below.
              </Text>
            ))}
        </View>

        {/* CUSTOM */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">CUSTOM — your own ingredients</Text>
          <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
            <Card style={{ flex: 1 }}>
              <TextInput
                value={custom}
                onChangeText={(v) => {
                  setCustom(v);
                  setCustomNote(null);
                }}
                placeholder="e.g. carrageenan"
                placeholderTextColor={t.colors.textMuted}
                style={{ color: t.colors.textPrimary, fontFamily: t.fontFamily.regular }}
              />
            </Card>
            <Button title="Add" onPress={addCustom} disabled={!custom.trim()} />
          </View>
          {customNote && (
            <Text tone="warning" variant="caption">
              {customNote}
            </Text>
          )}
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
