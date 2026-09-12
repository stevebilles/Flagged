import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, Pressable, Switch, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Pill, Badge } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import {
  getCategories,
  getIngredientTermMap,
  getProfile,
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
} from "../src/db/repositories";
import {
  addCustomIngredient,
  removeCustomIngredient,
  toggleCategory,
  toggleIngredientExcluded,
} from "../src/domain/activation";
import { profileColor } from "../src/design/avatar";
import type { Classification } from "../src/design/components";
import type { Category, Profile, ParentGroup } from "../src/domain/types";

const GROUP_ORDER: ParentGroup[] = ["Allergens", "Sugars", "Additives", "Dietary"];

const CLASSIFICATION_GUIDE: { classification: Classification; description: string }[] = [
  { classification: "regulated", description: "Legally required to be declared on food labels (e.g. allergens, nitrates)." },
  { classification: "advisory", description: "Not required by law but flagged based on scientific or health research." },
  { classification: "preference", description: "Personal dietary choices — no established health risk, your call." },
];

/**
 * Profile editor (docs/05 Home → Edit, docs/17 profile_edit mockups).
 * Categories grouped by parent with classification badges + on/off switches,
 * expandable individual ingredient toggles, a combined ingredient
 * search/custom-add box, and profile deletion. Activation per docs/data-schema.md.
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
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);

  const categories = useMemo(() => getCategories(), []);
  const termById = useMemo(() => getIngredientTermMap(), []);

  const [profile, setProfile] = useState<Profile>(() => {
    if (params.new) return createProfile("New Profile");
    return getProfile(params.id ?? "") ?? createProfile("New Profile");
  });
  // Position among all profiles (same creation order Home uses) — the avatar
  // dot's color comes from this, not the id, so it can never collide with
  // another profile's color the way a hash could.
  const profileIndex = useMemo(() => {
    const idx = getProfiles().findIndex((p) => p.profileId === profile.profileId);
    return idx === -1 ? 0 : idx;
  }, [profile.profileId]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [customNote, setCustomNote] = useState<string | null>(null);

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
    const q = query.trim().toLowerCase();
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
  }, [query, categories, termById]);

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
    setQuery("");
  }

  function addCustom() {
    const term = query.trim();
    if (!term) return;
    const lower = term.toLowerCase();
    if (profile.customIngredients.includes(lower)) {
      setCustomNote(`"${term}" is already in your custom list.`);
      return;
    }
    const existing = termToCategory.get(lower);
    if (existing) {
      setCustomNote(`"${term}" is already tracked under ${existing.name} — turn that filter on above instead of adding it as custom.`);
      return;
    }
    persist(addCustomIngredient(profile, term));
    setQuery("");
    setCustomNote(null);
  }

  function confirmDelete() {
    Alert.alert(
      `Delete ${profile.name}?`,
      `This removes ${profile.name}'s profile and filters. Pantry items already saved for ${profile.name} are kept, but won't show under this profile anymore.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteProfile(profile.profileId);
            if (activeProfileId === profile.profileId) {
              setActiveProfile(getProfiles()[0]?.profileId ?? "");
            }
            router.back();
          },
        },
      ]
    );
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

  const categoryCount = profile.activeCategoryIds.length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={t.colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={save}
            style={({ pressed }) => ({
              backgroundColor: t.colors.cyan,
              borderRadius: t.radius.md,
              paddingVertical: 8,
              paddingHorizontal: t.spacing.md,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: "#0B1220", fontFamily: t.fontFamily.bold }}>Save</Text>
          </Pressable>
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: profileColor(profileIndex) }} />
            <TextInput
              value={profile.name}
              onChangeText={(v) => persist({ ...profile, name: v })}
              placeholder="Profile name"
              placeholderTextColor={t.colors.textMuted}
              style={{ flex: 1, color: t.colors.textPrimary, fontFamily: t.fontFamily.bold, fontSize: t.fontSize.heading }}
            />
          </View>
          <Text tone="muted" variant="caption">
            {categoryCount} {categoryCount === 1 ? "category" : "categories"} active
          </Text>
        </View>

        {/* CUSTOM INGREDIENTS (search the dictionary or add your own) */}
        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">CUSTOM INGREDIENTS</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
            <Card style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
              <Ionicons name="search" size={18} color={t.colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={(v) => {
                  setQuery(v);
                  setCustomNote(null);
                }}
                placeholder="Search or add an ingredient..."
                placeholderTextColor={t.colors.textMuted}
                style={{ flex: 1, color: t.colors.textPrimary, fontFamily: t.fontFamily.regular, fontSize: t.fontSize.body }}
              />
            </Card>
            <Pressable
              onPress={addCustom}
              disabled={!query.trim()}
              style={{
                width: 44,
                height: 44,
                borderRadius: t.radius.md,
                backgroundColor: t.colors.cyan,
                alignItems: "center",
                justifyContent: "center",
                opacity: query.trim() ? 1 : 0.5,
              }}
            >
              <Ionicons name="add" size={22} color="#0B1220" />
            </Pressable>
          </View>
          <Text tone="muted" variant="caption">
            Type an ingredient and tap + to add it. We'll let you know if it's already covered by a default category.
          </Text>

          {query.trim().length > 0 &&
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
              <Text tone="muted">No match in our list for "{query.trim()}" — tap + above to add it as custom.</Text>
            ))}

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

        {/* CLASSIFICATION GUIDE */}
        <Card style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">CLASSIFICATION GUIDE</Text>
          {CLASSIFICATION_GUIDE.map((row) => (
            <View key={row.classification} style={{ flexDirection: "row", alignItems: "flex-start", gap: t.spacing.sm }}>
              <Badge classification={row.classification} />
              <Text tone="muted" variant="caption" style={{ flex: 1 }}>
                {row.description}
              </Text>
            </View>
          ))}
        </Card>

        {/* CATEGORIES grouped by parent — one row each, grouped into one card per section */}
        {grouped.map(({ group, cats }) => (
          <View key={group} style={{ gap: t.spacing.sm }}>
            <Text tone="muted" variant="caption">{group.toUpperCase()}</Text>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {cats.map((cat: Category, idx) => (
                <View
                  key={cat.id}
                  style={{
                    paddingHorizontal: t.spacing.md,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: t.colors.canvas,
                  }}
                >
                  <Pressable
                    onPress={() => setExpanded(expanded === cat.id ? null : cat.id)}
                    style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm, paddingVertical: t.spacing.sm }}
                  >
                    <Ionicons
                      name={expanded === cat.id ? "chevron-down" : "chevron-forward"}
                      size={16}
                      color={t.colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text bold>{cat.name}</Text>
                      <Text tone="muted" variant="caption">{cat.ingredientIds.length} ingredients</Text>
                    </View>
                    <Badge classification={cat.classification} />
                    <Switch
                      value={activeSet.has(cat.id)}
                      onValueChange={() => persist(toggleCategory(profile, cat.id))}
                      trackColor={{ true: t.colors.cyan, false: t.colors.textMuted }}
                    />
                  </Pressable>

                  {expanded === cat.id && (
                    <View style={{ gap: 4, paddingBottom: t.spacing.sm }}>
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
                </View>
              ))}
            </Card>
          </View>
        ))}

        <Pressable
          onPress={confirmDelete}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: t.spacing.sm,
            paddingVertical: 14,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.colors.red,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="trash-outline" size={18} color={t.colors.red} />
          <Text style={{ color: t.colors.red, fontFamily: t.fontFamily.bold, fontSize: t.fontSize.body }}>
            Delete Profile
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
