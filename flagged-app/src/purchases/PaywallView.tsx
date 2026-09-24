import React, { useEffect, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text, Button, withAlpha } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import { useAppStore } from "../state/appStore";
import { purchaseAnnual, getTrialEligibility } from "./purchases";
import { paywallCopy, type TrialEligibility } from "./trialEligibility";
import { markPremiumInstalled } from "../review/reviewTriggers";

/**
 * The paywall (docs/08): $24.99/yr with a 7-day free trial. Shown in the Scan
 * tab for anyone who isn't premium (docs/05 State 2), and reusable by the
 * onboarding soft paywall and the /paywall route later.
 *
 * Built to the Figma mockup's layout and copy, but in Flagged's own design
 * system (docs/09): Atkinson Hyperlegible via the shared `Text`, brand cyan
 * instead of the mockup's green, theme spacing/radius tokens, and only the
 * Dynamic Type sizes (the mockup's ~11px footers use `caption`, 13pt).
 */

const FEATURES: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
}[] = [
  { icon: "shield-checkmark", title: "Scan any label, anywhere:", body: "No barcode needed" },
  {
    icon: "people",
    title: "Built for real families:",
    body: "Create a red-flag profile for every person in your house",
  },
  {
    icon: "locate",
    title: "Track ingredients beyond the defaults:",
    body: "Add any ingredient you want flagged — not just the ones on the built-in list",
  },
  {
    icon: "notifications",
    title: "Catch silent reformulations:",
    body: "Save a clean scan to your pantry. After 30 days, the app flags it for a recheck so you can catch any changes",
  },
];

export function PaywallView({
  onPurchased,
  onDismiss,
}: {
  /** Called after a successful purchase (the Scan tab needs nothing — it unlocks itself). */
  onPurchased?: () => void;
  /** If given, shows a "Not now" button (used when the paywall is its own screen). */
  onDismiss?: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const setPremium = useAppStore((s) => s.setPremium);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only promise the free trial to people who'll actually get it (trialEligibility.ts).
  // Starts as "checking" (shown with the trial wording — the lookup is quick); an
  // ineligible or undetermined answer switches to plain "Subscribe" wording.
  const [eligibility, setEligibility] = useState<TrialEligibility>("checking");
  useEffect(() => {
    let cancelled = false;
    getTrialEligibility().then((e) => {
      if (!cancelled) setEligibility(e);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const copy = paywallCopy(eligibility);

  async function startTrial() {
    setBusy(true);
    setError(null);
    try {
      const active = await purchaseAnnual();
      if (active) {
        setPremium(true);
        markPremiumInstalled();
        onPurchased?.();
      }
    } catch (e: any) {
      // Closing Apple's purchase sheet isn't an error — just return to the paywall quietly.
      if (e?.userCancelled) return;
      setError(e?.message ?? "Purchase unavailable in this build (configure RevenueCat keys).");
    } finally {
      setBusy(false);
    }
  }

  const hairline = withAlpha(t.colors.textMuted, 0.25);
  // Flexible spacers: gaps between blocks grow (up to xl) before the ends do.
  const gapSpacer = { flexGrow: 3, flexShrink: 1, minHeight: t.spacing.sm, maxHeight: t.spacing.xl } as const;
  const endSpacer = { flexGrow: 1, flexShrink: 1 } as const;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        // The flexible spacers below (gapSpacer between blocks, endSpacer above and
        // below the whole layout) share any spare height: each gap grows up to a sensible
        // maximum, and whatever is left is split evenly above and below the content. So the
        // layout stays balanced whether or not the trial wording is shown, instead of
        // stretching into big gaps when there's less text. On a short phone the minimum
        // gaps apply and it scrolls.
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={endSpacer} />
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="caption" bold tone="cyan" style={{ letterSpacing: 1.5 }}>
            FLAGGED PRO
          </Text>
          <Text variant="heading" bold>
            Your red flags.{" "}
            <Text variant="heading" bold tone="cyan" style={{ fontFamily: t.fontFamily.boldItalic }}>
              Every label.
            </Text>
          </Text>
          <Text tone="muted" variant="subheadline">
            Scan any ingredient list and instantly know if it contains anything your family avoids —
            no matter what it's called.
          </Text>
        </View>

        <View style={gapSpacer} />
        <View style={{ gap: t.spacing.sm }}>
          <View
            style={{
              borderRadius: t.radius.lg,
              borderWidth: 1,
              borderColor: withAlpha(t.colors.cyan, 0.5),
              backgroundColor: withAlpha(t.colors.cyan, 0.08),
              padding: t.spacing.md,
              gap: t.spacing.xs,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text variant="display" bold tone="cyan">
                $24.99
                <Text variant="subheadline" tone="muted">
                  {"  "}/ year
                </Text>
              </Text>
              {copy.showTrialPill && (
                <View
                  style={{
                    backgroundColor: t.colors.cyan,
                    borderRadius: t.radius.pill,
                    paddingHorizontal: t.spacing.sm + 4,
                    paddingVertical: t.spacing.xs,
                  }}
                >
                  <Text variant="caption" bold style={{ color: t.colors.canvas }}>
                    7-day free trial
                  </Text>
                </View>
              )}
            </View>
            <Text variant="subheadline" tone="muted">
              Only $2.08/mo · Just $0.07/day
            </Text>
          </View>

          {copy.showTrialReminder && (
            <Text variant="subheadline" tone="muted" style={{ textAlign: "center" }}>
              You'll see an in-app reminder before your trial ends, so you can cancel before your card
              is charged.
            </Text>
          )}
        </View>

        <View style={gapSpacer} />
        <View>
          {FEATURES.map((f, i) => (
            <View
              key={f.title}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: t.spacing.md,
                paddingTop: i === 0 ? 0 : t.spacing.sm,
                paddingBottom: i === FEATURES.length - 1 ? 0 : t.spacing.sm,
                borderBottomWidth: i < FEATURES.length - 1 ? 1 : 0,
                borderBottomColor: hairline,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: t.radius.md,
                  backgroundColor: t.colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={f.icon} size={22} color={t.colors.cyan} />
              </View>
              <Text variant="subheadline" tone="muted" style={{ flex: 1 }}>
                <Text variant="subheadline" bold>
                  {f.title}
                </Text>{" "}
                {f.body}
              </Text>
            </View>
          ))}
        </View>
        {/* Bottom spacer: with the top one, splits any leftover height evenly around the layout. */}
        <View style={endSpacer} />
      </ScrollView>

      <View style={{ gap: t.spacing.sm }}>
        {error && (
          <Text tone="red" variant="subheadline" style={{ textAlign: "center" }}>
            {error}
          </Text>
        )}
        <Button
          title={copy.cta}
          loading={busy}
          onPress={startTrial}
          style={{
            shadowColor: t.colors.cyan,
            shadowOpacity: 0.4,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
          }}
        />
        {/* Short subscription summary (App Store Review Guideline 3.1.2: trial
            length, price after the trial). The full wording — including
            auto-renewal and how to cancel — is on the Subscription details
            screen. The Terms of Service / Privacy Policy links live in Settings,
            not here (Apple requires them in the app and App Store metadata, not
            on this screen). */}
        <Text tone="muted" variant="caption" style={{ textAlign: "center" }}>
          {copy.summary}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/subscription-details")}
          hitSlop={8}
          style={{ alignSelf: "center" }}
        >
          <Text tone="cyan" variant="caption" bold>
            Subscription details
          </Text>
        </Pressable>
        {onDismiss && <Button title="Not now" kind="secondary" onPress={onDismiss} />}
      </View>
    </View>
  );
}
