import React, { useCallback, useState } from "react";
import { View, ScrollView, Pressable, Image } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, Text, Card, Button, withAlpha } from "../../src/design/components";
import { useTheme } from "../../src/design/ThemeProvider";
import { AllChip, ProfileChip } from "../../src/design/profileChips";
import { profileColor } from "../../src/design/avatar";
import {
  getActivePantryItems,
  getRecentlyDeleted,
  getProfiles,
  undoDeletePantryItem,
} from "../../src/db/repositories";
import { RECHECK_DAYS, displayName, type PantryItem, type Profile } from "../../src/domain/types";
import { elapsedSince } from "../../src/domain/time";

/**
 * MY PANTRY — saved products & recheck hub (docs/05 Tab 3, docs/17 mockup).
 * Top to bottom: the recheck to-do list (items last checked 30+ days ago), the saved-product
 * cards (each tagged with the profile it was saved for, filterable by profile), then the
 * 24-hour Recent Changes / Undo log.
 *
 * Layout: the CONTENT carries the weight, not the headings — each section is a small bold caps
 * label over its cards, with explanations living where they apply (on the recheck row, under the
 * Recent Changes rows) instead of in a paragraph under every heading. All type sizes come from the
 * theme's Dynamic Type scale.
 *
 * NO INVISIBLE FEATURES (owner's rule, CLAUDE.md "Hard rules"): every section is always on screen.
 * When one has nothing in it, it says so in plain words instead of disappearing.
 *
 * Wording rule (CLAUDE.md "Hard rules"): nothing here may say or imply a product is "safe",
 * "approved" or "cleared" — a scan only reports which of the user's red flags it did or didn't
 * find in the text it read, and the app can't guarantee a food is free of any ingredient.
 */
export default function Pantry() {
  const t = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [deleted, setDeleted] = useState<PantryItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // null = "All". A purely local view filter — unlike Home's switcher it never changes which
  // profile(s) a scan checks against.
  const [filterId, setFilterId] = useState<string | null>(null);

  // Re-read every time the tab gains focus: a save (Save to Pantry), a removal (item screen) or a
  // recheck all happen on other screens, and a tab stays mounted, so a one-time read goes stale.
  const reload = useCallback(() => {
    setItems(getActivePantryItems());
    setDeleted(getRecentlyDeleted());
    setProfiles(getProfiles());
  }, []);
  useFocusEffect(reload);

  const recheckMs = RECHECK_DAYS * 24 * 60 * 60 * 1000;
  // Clamp negative elapsed to 0 so a backwards device clock never makes an item
  // "due" early (spec Edge Cases / research R8).
  const needsRecheck = items.filter((i) => elapsedSince(i.lastVerifiedDate) > recheckMs);

  // A filter pointing at a profile that has since been deleted falls back to "All".
  const activeFilter = profiles.some((p) => p.profileId === filterId) ? filterId : null;
  // Saved Products lists EVERY saved item, including ones that are due for a recheck — being due is
  // a to-do about the item, not the item leaving the Pantry (owner, 2026-09-25). Due items appear in
  // both places, so the header and filter counts always match what's on screen.
  const shown = activeFilter ? items.filter((i) => i.profileId === activeFilter) : items;

  function hoursAgo(ms: number): string {
    const h = Math.floor(elapsedSince(ms) / (60 * 60 * 1000));
    return h < 1 ? "just now" : `${h}h ago`;
  }

  function openItem(id: string) {
    // Typed-routes types for a new file are generated on dev-server start.
    router.push(`/pantry-item?id=${id}` as never);
  }

  // Straight to the capture screen — no separate "do you have the new box?" popup first. That
  // screen carries the "only scan a NEWLY PURCHASED box" rule itself (one step, not two).
  function startRecheck(id: string) {
    router.push(`/recheck-capture?id=${id}` as never);
  }

  function profileFor(item: PantryItem): { name: string; color: string } | null {
    const index = profiles.findIndex((p) => p.profileId === item.profileId);
    return index >= 0 ? { name: displayName(profiles[index].name), color: profileColor(index) } : null;
  }

  // What the saved-products area says when there are no cards to show.
  const emptyProductsMessage =
    items.length === 0
      ? "Nothing saved yet. When a scan comes back with no red flags, you can save the product here under the profile you scanned for."
      : "Nothing saved for this profile yet.";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.xl, paddingBottom: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <View>
          <Text variant="heading" bold>My Pantry</Text>
          <Text tone="muted" variant="caption">
            {items.length} {items.length === 1 ? "item" : "items"} saved
          </Text>
        </View>

        {/* To-do list: saved items last checked more than 30 days ago. This same count drives the
            red dot on the Pantry tab icon (src/domain/pantryDue.ts). Always shown — when nothing is
            due it says so. */}
        <View style={{ gap: t.spacing.sm }}>
          <SectionLabel>Reformulation Checks</SectionLabel>
          {/* Said ONCE, above the cards (not repeated inside each one), in the mockup's own words
              (docs/screenshots/pantry.png). It tells the user WHEN to scan: after they buy the
              product again — rescanning the box already at home would just re-check the old recipe
              (the capture screen repeats "only scan a NEWLY PURCHASED box"). Only shown when
              something is due. */}
          {needsRecheck.length > 0 && (
            <Text tone="muted" variant="subheadline">
              Next time you buy one of these, scan the new package to check if the recipe has changed.
            </Text>
          )}
          {needsRecheck.length === 0 ? (
            <EmptyNote>
              Nothing to recheck yet. Items you save show up here {RECHECK_DAYS} days after their last
              check.
            </EmptyNote>
          ) : (
            needsRecheck.map((i) => (
              <RecheckRow key={i.itemId} item={i} profile={profileFor(i)} onPress={() => startRecheck(i.itemId)} />
            ))
          )}
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <SectionLabel>Saved Products</SectionLabel>

          {/* Profile filter: All plus one chip per profile, each with its own count. */}
          {profiles.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm, marginBottom: t.spacing.xs }}>
              <AllChip
                label="All"
                count={items.length}
                selected={activeFilter === null}
                onPress={() => setFilterId(null)}
              />
              {profiles.map((p, index) => (
                <ProfileChip
                  key={p.profileId}
                  profile={p}
                  index={index}
                  count={items.filter((i) => i.profileId === p.profileId).length}
                  selected={activeFilter === p.profileId}
                  onPress={() => setFilterId(p.profileId)}
                />
              ))}
            </View>
          )}

          {shown.length === 0 ? (
            <EmptyNote>{emptyProductsMessage}</EmptyNote>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
              {shown.map((i) => (
                <ItemCard key={i.itemId} item={i} profile={profileFor(i)} onPress={() => openItem(i.itemId)} />
              ))}
            </View>
          )}
        </View>

        {/* Removed in the last 24 hours — each can be undone until it's purged (docs/05). */}
        <View style={{ gap: t.spacing.sm }}>
          <SectionLabel>Recent Changes</SectionLabel>
          {deleted.length === 0 ? (
            <EmptyNote>Nothing removed in the last 24 hours.</EmptyNote>
          ) : (
            <>
              {deleted.map((i) => (
                <Card
                  key={i.itemId}
                  style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: t.spacing.sm }}
                >
                  <View style={{ flex: 1 }}>
                    <Text bold numberOfLines={1}>
                      {i.brandName}{" "}
                      <Text tone="red" variant="caption" bold>Removed</Text>{" "}
                      <Text tone="muted" variant="caption">{hoursAgo(i.deletedAt ?? 0)}</Text>
                    </Text>
                    <Text tone="muted" variant="subheadline" numberOfLines={1}>{i.productName}</Text>
                  </View>
                  <Button
                    title="Undo"
                    kind="secondary"
                    onPress={() => {
                      undoDeletePantryItem(i.itemId);
                      reload();
                    }}
                  />
                </Card>
              ))}
              <Text tone="muted" variant="caption" style={{ textAlign: "center" }}>
                Changes become permanent after 24 hours.
              </Text>
            </>
          )}
        </View>
      </ScrollView>

    </Screen>
  );
}

/** A section's label: small bold caps, identical for all three sections (no per-section color or
 * marker — a due item is already obvious from its amber-edged "Recheck" card). */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" bold style={{ letterSpacing: 1 }}>
      {children.toUpperCase()}
    </Text>
  );
}

/** What a section says when it has nothing in it — one quiet style for all three. */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <Text tone="muted" variant="subheadline">{children}</Text>
    </Card>
  );
}

/** "● Sofia" — which profile an item was saved for. */
function ProfileTag({ color, name }: { color: string; name: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text tone="muted" variant="caption" numberOfLines={1} style={{ flex: 1 }}>{name}</Text>
    </View>
  );
}

/** One item due for a recheck: a slim row with an amber left edge, a small product photo (when it
 * has one), brand over product, and the profile it belongs to. (The "buy it again first, then scan the NEW package" instruction is shown
 * once above the list, not repeated here.) Tapping goes straight to the recheck capture screen. */
function RecheckRow({
  item,
  profile,
  onPress,
}: {
  item: PantryItem;
  profile: { name: string; color: string } | null;
  onPress: () => void;
}) {
  const t = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!item.imageFilePath && !imageFailed;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Recheck ${item.brandName} ${item.productName}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        overflow: "hidden",
        borderRadius: t.radius.md,
        backgroundColor: t.colors.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 4, backgroundColor: t.colors.warning }} />
      {/* The item's saved product photo, small, so the user can spot the right product at a glance.
          Only when it has one (and it loads) — no photo, no thumbnail. Nothing new is stored. */}
      {showImage && (
        <Image
          source={{ uri: item.imageFilePath }}
          style={{
            width: 64,
            height: 64,
            borderRadius: t.radius.sm,
            alignSelf: "center",
            marginLeft: t.spacing.md,
          }}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      )}
      <View style={{ flex: 1, padding: t.spacing.md, gap: t.spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text bold numberOfLines={1}>{item.brandName}</Text>
            <Text tone="muted" variant="subheadline" numberOfLines={1}>{item.productName}</Text>
          </View>
          <Text tone="cyan" bold>Recheck →</Text>
        </View>
        {profile && <ProfileTag color={profile.color} name={profile.name} />}
      </View>
    </Pressable>
  );
}

/** One saved product: the front-of-pack photo the user took (a brand-initial tile if there isn't
 * one, or it can't be read) with a "● Steve" label on it showing the profile it was saved for
 * (`profile` is null only if that profile has since been deleted), then brand over product. */
function ItemCard({
  item,
  profile,
  onPress,
}: {
  item: PantryItem;
  profile: { name: string; color: string } | null;
  onPress: () => void;
}) {
  const t = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!item.imageFilePath && !imageFailed;
  const initial = (item.brandName || item.productName).trim().charAt(0).toUpperCase() || "?";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.brandName} ${item.productName}${profile ? `, saved for ${profile.name}` : ""}`}
      onPress={onPress}
      style={({ pressed }) => ({ width: "48%", opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ height: 120, backgroundColor: t.colors.canvas, alignItems: "center", justifyContent: "center" }}>
          {showImage ? (
            <Image
              source={{ uri: item.imageFilePath }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Text variant="heading" bold tone="muted">{initial}</Text>
          )}
          {profile && (
            <View
              style={{
                position: "absolute",
                left: t.spacing.sm,
                bottom: t.spacing.sm,
                maxWidth: "88%",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: withAlpha(t.colors.canvas, 0.82),
                borderRadius: t.radius.pill,
                paddingVertical: 3,
                paddingHorizontal: t.spacing.sm,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: profile.color }} />
              <Text variant="caption" bold numberOfLines={1} style={{ flexShrink: 1 }}>{profile.name}</Text>
            </View>
          )}
        </View>
        <View style={{ padding: t.spacing.md, gap: 2 }}>
          <Text variant="subheadline" bold numberOfLines={1}>{item.brandName}</Text>
          <Text tone="muted" variant="caption" numberOfLines={2}>{item.productName}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
