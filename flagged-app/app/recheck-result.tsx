import React, { useEffect, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen,
  Text,
  Card,
  Button,
  Badge,
  IngredientChip,
  withAlpha,
  type Classification,
} from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { ProductPhoto } from "../src/design/ProductPhoto";
import { useAppStore } from "../src/state/appStore";
import {
  getPantryItem,
  getProfile,
  rebaselinePantryItem,
  softDeletePantryItem,
  logScan,
  getCategories,
} from "../src/db/repositories";
import { commitRecheckStats } from "../src/domain/scanService";
import type { AttributedMatch } from "../src/domain/recheckEngine";
import { snapshotFromProfile } from "../src/domain/activation";
import { flaggedFooter, flagSource, formatDate, formatDayOrToday } from "../src/domain/recheckExplain";
import { filterSetLines, sameFilterSet } from "../src/domain/filterSet";
import { displayName } from "../src/domain/types";
import { displayTerm } from "../src/domain/displayTerm";
import { HeroCard } from "../src/design/HeroCard";

/** Header shared by both results (owner's mockups, 2026-09-25): back arrow + the screen's title
 * ("Rescan Result"), then the product's photo (carried through every recheck screen) and brand /
 * product on a row below. No status pill — the pills in the
 * mockups (CLEAN, SAME PROFILE) are mockup-only state labels, not part of the app. */
function ResultHeader({
  photoUri,
  brandName,
  productName,
  onBack,
}: {
  photoUri: string;
  brandName: string;
  productName: string;
  onBack: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back to Pantry"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: t.colors.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="chevron-back" size={18} color={t.colors.textPrimary} />
      </Pressable>
      {/* What this screen is — every other screen has a title beside its back arrow. */}
      <Text variant="title" bold>Rescan Result</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
        <ProductPhoto uri={photoUri} size={56} />
        <View style={{ flex: 1 }}>
          <Text variant="title" bold numberOfLines={1}>{brandName}</Text>
          <Text tone="muted" variant="subheadline" numberOfLines={1}>{productName}</Text>
        </View>
      </View>
    </View>
  );
}

/** One column of the "Profile at time of each scan" card: a date over the red flags the profile was
 * scanning for on that date. */
function FilterColumn({ date, lines }: { date: string; lines: string[] }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: t.spacing.xs }}>
      <Text variant="subheadline" bold>{date}</Text>
      <Text variant="caption" bold tone="muted" style={{ letterSpacing: 1 }}>SCANNING FOR</Text>
      {lines.map((line, i) => (
        <Text key={i} variant="subheadline" tone="muted">• {line}</Text>
      ))}
    </View>
  );
}

/** The side-by-side of what the profile was scanning for when the item was last checked vs. today,
 * with a one-line footer saying what that means. Shared by the clean and flagged results. */
function ProfileAtScanCard({
  thenDate,
  thenLines,
  nowDate,
  nowLines,
  footer,
}: {
  thenDate: string;
  thenLines: string[];
  nowDate: string;
  nowLines: string[];
  footer: string;
}) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.spacing.md }}>
      <Text variant="caption" bold tone="muted" style={{ letterSpacing: 1 }}>
        PROFILE AT TIME OF EACH SCAN
      </Text>
      <View style={{ flexDirection: "row" }}>
        <FilterColumn date={thenDate} lines={thenLines} />
        <View style={{ width: 1, backgroundColor: t.colors.canvas, marginHorizontal: t.spacing.md }} />
        <FilterColumn date={nowDate} lines={nowLines} />
      </View>
      <View style={{ height: 1, backgroundColor: t.colors.canvas }} />
      <Text tone="muted" variant="subheadline" style={{ fontFamily: t.fontFamily.italic }}>{footer}</Text>
    </Card>
  );
}

/** A red-flag filter as a small pill (used in the "Why is this flagging now?" card): neutral, or —
 * for a filter the user ADDED since the last check — highlighted in cyan and prefixed with "+". */
function FilterPill({ label, added }: { label: string; added?: boolean }) {
  const t = useTheme();
  const tint = added ? t.colors.cyan : t.colors.textMuted;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: withAlpha(tint, added ? 0.6 : 0.4),
        backgroundColor: withAlpha(tint, 0.12),
        borderRadius: t.radius.pill,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text variant="subheadline" bold={added} tone={added ? "cyan" : "muted"}>
        {added ? `+ ${label}` : label}
      </Text>
    </View>
  );
}

/**
 * The flagged rescan's "Why is this flagging now?" card (owner's mockup, 2026-09-25): what the
 * profile was scanning for when the item was last checked, an arrow, what it's scanning for in
 * today's scan (each set as pills), and a one-line footer. The two halves are labelled in parallel
 * ("Profile of last scan" / "Profile of today's scan"). When the profile changed (`updated`), the
 * filters added since the last scan are highlighted in cyan with a "+" — the only use of cyan here.
 */
function WhyFlaggingCard({
  thenDate,
  thenLines,
  nowLines,
  footer,
  updated,
  title = "WHY IS THIS FLAGGING NOW?",
}: {
  thenDate: string;
  thenLines: string[];
  nowLines: string[];
  footer: string;
  updated: boolean;
  title?: string;
}) {
  const t = useTheme();
  const rule = withAlpha(t.colors.textMuted, 0.3);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <View style={{ padding: t.spacing.md }}>
        <Text variant="caption" bold tone="muted" style={{ letterSpacing: 1 }}>{title}</Text>
      </View>
      <View style={{ height: 1, backgroundColor: t.colors.canvas }} />

      <View style={{ padding: t.spacing.md, gap: t.spacing.md }}>
        <View style={{ gap: t.spacing.sm }}>
          {/* Parallel labels (owner, 2026-09-25): "Profile of last scan" / "Profile of today's scan". */}
          <Text variant="subheadline" bold>Profile of last scan · {thenDate}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {thenLines.map((line, i) => (
              <FilterPill key={i} label={line} />
            ))}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
          <View style={{ flex: 1, height: 1, backgroundColor: rule }} />
          <Ionicons name="arrow-down" size={16} color={t.colors.textMuted} />
          <View style={{ flex: 1, height: 1, backgroundColor: rule }} />
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <Text variant="subheadline" bold>Profile of today's scan</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {nowLines.map((line, i) => (
              <FilterPill key={i} label={line} added={updated && !thenLines.includes(line)} />
            ))}
          </View>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: t.colors.canvas }} />
      <View style={{ padding: t.spacing.md, gap: t.spacing.sm }}>
        <Text tone="muted" variant="subheadline" style={{ fontFamily: t.fontFamily.italic }}>{footer}</Text>
      </View>
    </Card>
  );
}

/** One card per flagged filter (name + classification badge + the terms found), like the main Results
 * screen. Shared by the new-red-flags screen and the "nothing new" screen. */
function FlagGroupCards({ matches }: { matches: AttributedMatch[] }) {
  const t = useTheme();
  const groups = new Map<string, { key: string; title: string; classification: Classification; terms: string[] }>();
  for (const m of matches) {
    const title = m.categoryName ?? displayTerm(m.term);
    const key = title.toLowerCase();
    const existing = groups.get(key);
    if (existing) existing.terms.push(displayTerm(m.term));
    else groups.set(key, { key, title, classification: m.classification ?? "preference", terms: [displayTerm(m.term)] });
  }
  return (
    <>
      {Array.from(groups.values()).map((g) => (
        <Card key={g.key} style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: t.spacing.sm }}>
            <Text variant="title" bold style={{ flex: 1 }}>{g.title}</Text>
            <Badge classification={g.classification} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
            {g.terms.map((term, i) => (
              <IngredientChip key={i} label={term} />
            ))}
          </View>
        </Card>
      ))}
    </>
  );
}

/**
 * Recheck result (docs/07 §7.1, redesigned 2026-09-14; both screens rebuilt to the owner's mockups
 * 2026-09-25). Three outcomes:
 *  1. identical        → no red flags found — verdict card + the filter sets side by side; a clean
 *                        rescan becomes the item's new baseline
 *  2. known_flags      → flags were found, but ALL of them were already found at the last scan —
 *                        "nothing new" (owner, 2026-09-25); same layout as (1), with those known
 *                        flags listed underneath so they're never hidden
 *  3. changed_flagged  → new red flag detected — the flagged terms grouped by filter, the same
 *                        side-by-side, and Remove / Keep anyway
 * Always resolves the item's OWN profile (`item.profileId`), never whichever
 * profile happens to be globally active — a real bug, fixed the same day.
 * Stats are committed once, on mount (this recheck reached a result).
 */
export default function RecheckResult() {
  const t = useTheme();
  const router = useRouter();
  const handoff = useAppStore((s) => s.lastRecheck);
  const item = useMemo(() => (handoff ? getPantryItem(handoff.itemId) : null), [handoff]);

  useEffect(() => {
    const profile = item ? getProfile(item.profileId) : null;
    if (handoff && profile) commitRecheckStats(handoff.outcome, profile);
    // A clean rescan becomes the item's new baseline right away (docs/07 §7.1): its filters are
    // re-recorded as of THIS scan and the 30-day timer restarts, so next time the left side of the
    // "profile at time of each scan" card shows this scan's date and filters. Done here, on open —
    // not on a button — so leaving by the back arrow or a swipe can't skip it. (The screen below
    // still shows the PREVIOUS baseline, read before this runs.)
    // Same for "nothing new": the flags it found were already found (and kept) at the last scan.
    if (handoff && item && profile && handoff.outcome.kind !== "changed_flagged") {
      rebaselinePantryItem(item.itemId, snapshotFromProfile(profile), handoff.scannedAt);
    }
    // Append-only entry in the item's scan history: when this rescan happened, what it found, and the
    // profile's red-flag settings it used (docs/03 §3.2b) — so the user can always go back to the
    // filters used at any scan, even after the item's current baseline moves forward.
    if (handoff && item) {
      logScan({
        itemId: item.itemId,
        profileId: item.profileId,
        at: handoff.scannedAt,
        kind: "rescan",
        outcome: handoff.outcome.kind === "identical" ? "no_red_flags" : "flagged",
        // Recorded even for "nothing new", so the NEXT rescan compares against these terms.
        matchedTerms: handoff.outcome.kind === "identical" ? [] : handoff.outcome.matches.map((m) => m.term),
        snapshot: profile ? snapshotFromProfile(profile) : null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!handoff || !item) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: t.spacing.md }}>
          <Text>No recheck to show.</Text>
          <Button title="Back to Pantry" onPress={() => router.replace("/(tabs)/pantry")} />
        </View>
      </Screen>
    );
  }

  const { itemId, brandName, productName, outcome, scannedAt } = handoff;

  function done() {
    useAppStore.getState().setLastRecheck(null);
    router.replace("/(tabs)/pantry");
  }

  function keep() {
    // Baseline against the profile's CURRENT filters (docs/07 §7.1) — a
    // "Keep" means the user accepted today's flagged state as the new normal.
    const profile = getProfile(item!.profileId);
    if (profile) rebaselinePantryItem(itemId, snapshotFromProfile(profile), scannedAt);
    done();
  }

  function remove() {
    softDeletePantryItem(itemId);
    done();
  }

  // What the "profile at time of each scan" card compares: the filters recorded when the item was
  // last checked (`snapshotAt`) vs. the profile's filters today (docs/07 §7.1).
  const profile = getProfile(item.profileId);
  const categories = getCategories();
  const nowFilters = profile ? snapshotFromProfile(profile) : item.profileSnapshot;
  const sameFilters = sameFilterSet(item.profileSnapshot, nowFilters);
  const thenDate = formatDate(item.snapshotAt);
  const nowDate = formatDayOrToday(scannedAt);
  const thenLines = filterSetLines(item.profileSnapshot, categories);
  const nowLines = filterSetLines(nowFilters, categories);

  // --- Outcome 1: no red flags found (owner's mockup, 2026-09-25) --------------
  // Header (back · photo · brand/product) → verdict card → profile-at-time-of-each-scan → button.
  // No "CLEAN" pill/tag (owner, 2026-09-25): a status tag can be read as a safety claim and works
  // against the disclaimer — the verdict card says "No red flags found" and nothing more.
  // Wording follows the app's rule (CLAUDE.md): "No red flags found", never "clear"/"all good".
  // Leaving via the back arrow or the button both just return to the Pantry — the clean result was
  // already recorded when the screen opened (see the effect above).
  //
  // "Nothing new" (known_flags, owner 2026-09-25): every flag found was already found at the last scan
  // — e.g. the user kept the product anyway — so this is the same screen with an honest headline:
  // NOT "No red flags found" (they are on the label), and a flag icon rather than a checkmark. The
  // known flags are listed underneath so it's never hidden that they're there.
  if (outcome.kind !== "changed_flagged") {
    const whose = profile ? `${displayName(profile.name)}'s` : "this";
    const known = outcome.kind === "known_flags";
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ gap: t.spacing.lg, paddingBottom: t.spacing.lg }} showsVerticalScrollIndicator={false}>
          <ResultHeader
            photoUri={item.imageFilePath}
            brandName={brandName}
            productName={productName}
            onBack={done}
          />

          <HeroCard
            tone="cyan"
            icon={known ? "flag" : "checkmark"}
            // "Nothing new": ONE sentence, all bold, no second line (owner, 2026-09-25).
            title={known ? `No new red flags found for ${whose} current profile` : "No red flags found"}
            subtitle={known ? undefined : `No new red flags found for ${whose} current profile.`}
          />

          {/* Only claims "same" when the two sets truly are the same; if the user changed their
              filters since the item was last checked, it says so instead. */}
          {known ? (
            // Flags were found, so this is a flagged rescan: it gets the flagged screen's pill-style
            // card (not the clean screen's side-by-side bullets), titled for what it is.
            <WhyFlaggingCard
              title="PROFILE AT TIME OF EACH SCAN"
              thenDate={thenDate}
              thenLines={thenLines}
              nowLines={nowLines}
              footer={
                sameFilters
                  ? "Same filter set — no new red flags detected."
                  : "Your filters changed since your last scan — no new red flags detected."
              }
              updated={!sameFilters}
            />
          ) : (
            <ProfileAtScanCard
              thenDate={thenDate}
              thenLines={thenLines}
              nowDate={nowDate}
              nowLines={nowLines}
              footer={
                sameFilters
                  ? "Same filter set — no new red flags detected."
                  : "Your filters changed since you saved this — no red flags detected with the current set."
              }
            />
          )}

          {outcome.kind === "known_flags" && (
            <>
              <Text variant="caption" bold tone="muted" style={{ letterSpacing: 1 }}>
                SAME RED FLAGS AS YOUR LAST SCAN
              </Text>
              <FlagGroupCards matches={outcome.matches} />
            </>
          )}

          {known ? (
            // Owner (2026-09-25): keep Remove available here too — nothing new was found, but the
            // flags are still on the label and the user may still want the product out of the Pantry.
            <View style={{ gap: t.spacing.sm }}>
              <Button title="Back to Pantry" onPress={done} />
              <Button title="Remove from Pantry" kind="secondary" onPress={remove} />
            </View>
          ) : (
            <Button title="Back to Pantry" onPress={done} />
          )}
        </ScrollView>
      </Screen>
    );
  }

  // --- Outcome 2: new red flag detected (owner's mockup, 2026-09-25) ------------
  // Header → red banner → profile-at-time-of-each-scan (right under the banner: it's the visual clue
  // for why this is flagging) → the flagged terms grouped by filter (like the main Results screen) →
  // Remove / Keep anyway. (The mockup's "SAME PROFILE" pill is a mockup-only state label, so there
  // is no pill.)
  // The card's footer is ONE short line (owner, 2026-09-25: the long "what changed and when" text was
  // too much): same filters → likely a product reformulation; changed filters → says so and links to
  // the Scan History, where every scan's red flags are listed. (The exact change times are still
  // recorded in the profile change log — see docs/03 §3.2a.)
  const flagCount = outcome.matches.length;
  const forName = profile ? displayName(profile.name) : "this profile";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg, paddingBottom: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <ResultHeader
          photoUri={item.imageFilePath}
          brandName={brandName}
          productName={productName}
          onBack={done}
        />

        <HeroCard
          tone="red"
          icon="flag"
          title={flagCount === 1 ? "New red flag detected" : "New red flags detected"}
          subtitle={`for ${forName}`}
        />

        {/* Right under the banner (owner, 2026-09-25): the side-by-side is the immediate visual clue
            for WHY this is flagging now, so it shouldn't need a scroll to reach. */}
        <WhyFlaggingCard
          thenDate={thenDate}
          thenLines={thenLines}
          nowLines={nowLines}
          footer={flaggedFooter(sameFilters, flagSource(outcome.matches))}
          updated={!sameFilters}
        />

        <FlagGroupCards matches={outcome.matches} />

        <View style={{ gap: t.spacing.sm }}>
          <Button title="Remove from Pantry" kind="destructive" onPress={remove} />
          <Button title="Keep anyway" kind="secondary" onPress={keep} />
        </View>
      </ScrollView>
    </Screen>
  );
}
