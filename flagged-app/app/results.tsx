import React, { useEffect, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text, Card, Button, Badge } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";
import { useAppStore } from "../src/state/appStore";
import { getProfile } from "../src/db/repositories";
import { commitScanStats, commitScanStatsForAll, canScan } from "../src/domain/scanService";
import { onFlaggedResultDismissed } from "../src/review/reviewTriggers";
import { cleanForDisplay } from "../src/matching/normalize";
import type { Match } from "../src/matching/matcher";

/** The correctly-spelled term itself, not the raw (possibly OCR-garbled)
 * label text that triggered it — 2026-09-13: OCR will never be 100%
 * typo-free on real glossy print, on any engine, and showing its raw output
 * as if it were a finished transcript made the app look unreliable even
 * when the underlying match was already correct. A term is always shown
 * exactly as configured (the profile's own filter list), never as read. */
function displayTerm(m: Match): string {
  return m.term.charAt(0).toUpperCase() + m.term.slice(1);
}

/** "matches Sofia's Big-9 Allergens filter" / "...Sofia & Steve's..." (docs/17 "All" mode). */
function matchCaption(m: Match): string {
  const filter = m.categoryName ?? m.term;
  // A fuzzy match's confidence is worth surfacing (it's not a certain read),
  // but never alongside the raw token that triggered it — see displayTerm.
  const fuzzy = m.kind === "fuzzy" ? ` · ${(m.score * 100).toFixed(0)}% match` : "";
  if (m.profileNames && m.profileNames.length > 0) {
    const names = m.profileNames;
    const who =
      names.length === 1 ? `${names[0]}'s` : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}'s`;
    return `matches ${who} ${filter} filter${fuzzy}`;
  }
  return `matches ${filter}${fuzzy}`;
}

/**
 * Results screen (docs/07, docs/17 mockup). Clean (cyan) vs Flagged (red).
 * Commits stats on mount (this scan successfully reached a result — docs/06/08).
 * Highlights offending tokens in the paragraph and explains the breakdown.
 */
export default function Results() {
  const t = useTheme();
  const router = useRouter();
  const isPremium = useAppStore((s) => s.isPremium);
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
      commitScanStatsForAll(result, profiles, isPremium);
    } else if (profiles.length === 1) {
      commitScanStats(result, profiles[0], isPremium);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Split the paragraph so ONLY the exact matched words/phrases are highlighted —
  // not the whole comma-chunk they sit in (which was reddening "Contains:" etc).
  const segments = useMemo(() => {
    // Cosmetic-only cleanup (0->O, a lone apostrophe standing in for a
    // dropped comma) for what's SHOWN — the raw text used for matching
    // upstream is untouched. Cleaning before highlighting also means a term
    // matched via the matcher's own digit-cleanup fallback (e.g. "oat" found
    // inside a raw "0at") now actually lines up with the highlighted text.
    const para = cleanForDisplay(lastScan?.paragraph ?? "");
    const tokens = Array.from(
      new Set((lastScan?.matches ?? []).map((m) => m.token.trim()).filter((s) => s.length > 1))
    ).sort((a, b) => b.length - a.length); // longest first: "wheat flour" before "wheat"
    if (tokens.length === 0) return [{ text: para, flag: false }];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z])(${tokens.map(esc).join("|")})(?![A-Za-z])`, "gi");
    const out: { text: string; flag: boolean }[] = [];
    let last = 0;
    for (let m = re.exec(para); m; m = re.exec(para)) {
      if (m.index > last) out.push({ text: para.slice(last, m.index), flag: false });
      out.push({ text: m[0], flag: true });
      last = m.index + m[0].length;
    }
    if (last < para.length) out.push({ text: para.slice(last), flag: false });
    return out;
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
  const justHitLimit = !isPremium && !canScan(false);

  async function dismiss(to: "home" | "scan") {
    if (!clean) await onFlaggedResultDismissed(lastScan!.matches.length);
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

        <Card style={{ alignItems: "center", gap: t.spacing.sm }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: clean ? "rgba(34,211,238,0.12)" : "rgba(239,68,68,0.12)",
            }}
          >
            <Ionicons
              name={clean ? "checkmark-circle" : "close-circle"}
              size={40}
              color={clean ? t.colors.cyan : t.colors.red}
            />
          </View>
          <Text variant="title" bold tone={clean ? "cyan" : "red"}>
            {clean ? "No red flags" : "Red flags detected"}
          </Text>
          <Text tone="muted">
            {clean
              ? `All ingredients clear${scannedFor ? ` for ${scannedFor}` : ""}`
              : `${lastScan.matches.length} match${lastScan.matches.length === 1 ? "" : "es"} found${
                  scannedFor ? ` for ${scannedFor}` : ""
                }`}
          </Text>
        </Card>

        {/* Ingredient paragraph with the matched words highlighted — only for
            a CLEAN result. A flagged result shows just the matched red-flag
            terms below (their own correct spelling, not the raw OCR read) —
            not a raw transcript for the user to proofread (2026-09-13). */}
        {clean && (
          <View style={{ gap: t.spacing.sm }}>
            <Text tone="muted" variant="caption">INGREDIENTS</Text>
            <Card>
              <Text style={{ lineHeight: 24 }}>
                {segments.map((seg, idx) => (
                  <Text key={idx} tone={seg.flag ? "red" : "primary"} bold={seg.flag}>
                    {seg.text}
                  </Text>
                ))}
              </Text>
            </Card>
          </View>
        )}

        <View style={{ gap: t.spacing.sm }}>
          <Text tone="muted" variant="caption">
            MATCHES — {lastScan.matches.length} FOUND
          </Text>
          <Card style={{ gap: t.spacing.md }}>
            {clean ? (
              <Text tone="muted">Nothing matched any active filters in this label.</Text>
            ) : (
              lastScan.matches.map((m, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: t.spacing.sm,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: t.colors.canvas,
                    paddingTop: i === 0 ? 0 : t.spacing.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text bold>{displayTerm(m)}</Text>
                    <Text tone="muted" variant="caption">
                      {matchCaption(m)}
                    </Text>
                  </View>
                  <Badge classification={m.classification ?? "preference"} />
                </View>
              ))
            )}
          </Card>
        </View>

        <View style={{ gap: t.spacing.sm }}>
          {clean ? (
            <Button title="Save to Pantry" onPress={() => router.push("/save-to-pantry")} />
          ) : (
            <Text tone="muted" variant="caption" style={{ textAlign: "center" }}>
              Flagged items can't be saved to your Pantry — only clean scans can.
            </Text>
          )}
          {justHitLimit ? (
            <Button title="Unlock Unlimited Scans" onPress={() => router.push("/paywall")} />
          ) : (
            <Button title="Scan Another Item" kind="secondary" onPress={() => dismiss("scan")} />
          )}
          <Button title="Return to Home" kind="secondary" onPress={() => dismiss("home")} />
        </View>
      </ScrollView>
    </Screen>
  );
}
