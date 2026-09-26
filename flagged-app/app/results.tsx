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
  ClassificationGuide,
  type Classification,
} from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { getProfile } from "../src/db/repositories";
import { commitScanStats, commitScanStatsForAll } from "../src/domain/scanService";
import { onScanCompleted } from "../src/review/reviewTriggers";
import type { Match } from "../src/matching/matcher";
import { displayTerm as formatTerm } from "../src/domain/displayTerm";
import { HeroCard } from "../src/design/HeroCard";

/** The correctly-spelled term itself, not the raw (possibly OCR-garbled)
 * label text that triggered it — 2026-09-13: OCR will never be 100%
 * typo-free on real glossy print, on any engine, and showing its raw output
 * as if it were a finished transcript made the app look unreliable even
 * when the underlying match was already correct. A term is always shown
 * exactly as configured (the profile's own filter list), never as read.
 * Abbreviations (TBHQ, BHA, E320…) show in capitals — see `src/domain/displayTerm.ts`. */
function displayTerm(m: Match): string {
  return formatTerm(m.term);
}

/**
 * Results screen (docs/07, docs/17 mockup). Clean (cyan) vs Flagged (red).
 * Commits stats on mount (this scan successfully reached a result — docs/06/08).
 * Highlights offending tokens in the paragraph and explains the breakdown.
 */
export default function Results() {
  const t = useTheme();
  const router = useRouter();
  const lastScan = useAppStore((s) => s.lastScan);
  // Decided at scan time (a specific profile's name, or "all N profiles") —
  // not re-derived from the current active profile, which may have changed
  // since this scan ran.
  const scannedFor = lastScan?.scannedFor ?? "";

  useEffect(() => {
    if (!lastScan) return;
    const result = { tokens: [], matches: lastScan.matches, isClean: lastScan.isClean };
    const profiles = (lastScan.profileIds ?? []).map(getProfile).filter((p): p is NonNullable<typeof p> => !!p);
    if (profiles.length > 1) {
      commitScanStatsForAll(result, profiles);
    } else if (profiles.length === 1) {
      commitScanStats(result, profiles[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group matches by category (docs/17 redesign) so the card grid reads as
  // "here's what's wrong and why" instead of a flat list of terms — the
  // category is what the classification badge actually describes, so one
  // badge per group (not one per term) also removes a lot of repetition.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; title: string; classification: Classification; matches: Match[] }>();
    for (const m of lastScan?.matches ?? []) {
      const title = m.categoryName ?? displayTerm(m);
      const key = title.toLowerCase();
      const existing = map.get(key);
      if (existing) existing.matches.push(m);
      else map.set(key, { key, title, classification: m.classification ?? "preference", matches: [m] });
    }
    return Array.from(map.values());
  }, [lastScan]);

  if (!lastScan) {
    return (
      <Screen>
        <Text>No scan to show.</Text>
        <Button title="Return to Home" onPress={() => router.replace("/(tabs)")} />
      </Screen>
    );
  }

  const clean = lastScan.isClean;

  async function dismiss(to: "home" | "scan") {
    // A completed scan, clean or flagged — now that the user is leaving Results,
    // a scheduled review request may be due (docs/10).
    await onScanCompleted();
    useAppStore.getState().setLastScan(null);
    router.replace(to === "home" ? "/(tabs)" : "/(tabs)/scan");
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.colors.card,
              alignItems: "center",
              justifyContent: "center",
              marginRight: t.spacing.sm,
            }}
          >
            <Ionicons name="chevron-back" size={18} color={t.colors.textPrimary} />
          </Pressable>
          <Text variant="title" bold>Result</Text>
        </View>

        {/* Compact hero (owner, 2026-09-25) — the same card the rescan result uses; no big stamp and
            no CLEAN/FLAGGED label (a status tag reads like a verdict on the product). Same "for
            <profile>" line for clean and flagged. Neither result shows the raw OCR'd ingredient text —
            a flagged result lists just the matched red-flag terms below (their own correct spelling),
            and a clean one has nothing to list. */}
        <HeroCard
          tone={clean ? "cyan" : "red"}
          icon={clean ? "checkmark" : "flag"}
          title={
            clean
              ? "No red flags found"
              : `${lastScan.matches.length} red flag${lastScan.matches.length === 1 ? "" : "s"} on your list`
          }
          subtitle={scannedFor ? `for ${scannedFor}` : undefined}
        />

        {!clean &&
          groups.map((g) => (
            <Card key={g.key} style={{ gap: t.spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: t.spacing.sm,
                }}
              >
                <Text variant="title" bold style={{ flex: 1 }}>
                  {g.title}
                </Text>
                <Badge classification={g.classification} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
                {g.matches.map((m, i) => (
                  <IngredientChip key={i} label={displayTerm(m)} />
                ))}
              </View>
            </Card>
          ))}

        {/* Reminder of what REGULATED/ADVISORY/PREFERENCE mean — same card
            as the profile editor (docs/05/09), shown here too since a user
            landing straight on a flagged result may never have visited
            Profile to see it explained the first time. */}
        {!clean && <ClassificationGuide />}

        {/* A notice, not a caption: it stands in for the Save to Pantry button a clean
            result shows, so a user looking for that button finds why it's missing. Filled
            panel with an accent bar and left-aligned text — deliberately NOT outlined, so it
            can't be mistaken for one of the (outlined, centered) buttons below. */}
        {!clean && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "stretch",
              overflow: "hidden",
              borderRadius: t.radius.sm,
              backgroundColor: t.colors.card,
            }}
          >
            <View style={{ width: 4, backgroundColor: t.colors.textMuted }} />
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: t.spacing.sm,
                padding: t.spacing.md,
              }}
            >
              <Ionicons name="information-circle" size={20} color={t.colors.textMuted} style={{ marginTop: 1 }} />
              <Text variant="subheadline" style={{ flex: 1 }}>
                Flagged items can't be saved to your Pantry — only clean scans can.
              </Text>
            </View>
          </View>
        )}

        <View style={{ gap: t.spacing.sm }}>
          {clean && <Button title="Save to Pantry" onPress={() => router.push("/save-to-pantry")} />}
          {/* Reaching this screen at all already required an active
              entitlement (docs/08: Scan tab hard-locks otherwise), so there's
              no in-result upsell branch anymore — always offer to scan again. */}
          <Button title="Scan Another Item" kind="secondary" onPress={() => dismiss("scan")} />
          <Button title="Return to Home" kind="secondary" onPress={() => dismiss("home")} />
        </View>

        {/* Compliance disclaimer (Terms of Service §2, condensed) — the app flags candidate
            matches from OCR'd text, it doesn't verify safety. Always the LAST thing on the
            screen, below the action buttons, never in the middle of the content. */}
        <View style={{ flexDirection: "row", gap: t.spacing.sm, alignItems: "flex-start" }}>
          <Ionicons name="shield-outline" size={16} color={t.colors.textMuted} style={{ marginTop: 2 }} />
          <Text tone="muted" variant="caption" style={{ flex: 1, lineHeight: 18 }}>
            Flagged is an informational tool that reads the label text you scan. Always verify the
            physical label. This isn't medical advice, and it can't guarantee a food is free of any
            ingredient.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
