import React from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Text } from "../src/design/components";
import { useTheme } from "../src/design/ThemeProvider";

/**
 * Subscription details (docs/08): the longer-form subscription wording that
 * Apple expects users to be able to read before subscribing (App Review
 * Guideline 3.1.2 — what you get, price and length, free-trial terms and what
 * stops working when it ends, auto-renewal and how to cancel). The paywall
 * itself keeps a one-line summary and links here so it stays uncluttered.
 *
 * Standard auto-renewal wording — have it reviewed before release; this is not
 * legal advice.
 */

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What you get",
    body: [
      "Flagged Pro unlocks scanning: read any ingredient list with your camera, pasted text, or a photo, and instantly see whether it contains anything on your family's red-flag profiles. Everything is read and checked on your device.",
      "Every feature is included — a profile for each person in your house, custom ingredients, and your Pantry with 30-day rechecks.",
    ],
  },
  {
    title: "Price and length",
    body: [
      "Flagged Pro is an auto-renewing annual subscription: $24.99 per year (about $2.08 a month). New subscribers who are eligible start with a 7-day free trial. If you've already used the free trial, you're charged $24.99 when you subscribe.",
    ],
  },
  {
    title: "If you're eligible for the 7-day free trial",
    body: [
      "You aren't charged during the 7-day free trial. When the trial ends, your Apple ID is charged $24.99 and the subscription renews each year, unless you cancel at least 24 hours before the trial ends.",
      "If you cancel during the trial, you won't be charged, and you keep access until the trial ends. Any unused portion of a free trial is forfeited if you purchase a subscription before it ends.",
    ],
  },
  {
    title: "What happens when the trial or subscription ends",
    body: [
      "Scanning (camera, Paste Text, and Choose Photo) needs an active free trial or subscription, so it locks when yours ends.",
      "Home, your Pantry, Settings, and your profiles stay available, and everything you've saved stays on your device.",
    ],
  },
  {
    title: "Renewal and payment",
    body: [
      "Payment is charged to your Apple ID account at confirmation of purchase (after the free trial ends, if you started one).",
      "Your subscription renews automatically each year unless auto-renew is turned off at least 24 hours before the end of the current period. Your account is charged $24.99 for renewal within 24 hours before the end of the current period.",
    ],
  },
  {
    title: "Manage or cancel",
    body: [
      "You can manage your subscription and turn off auto-renew at any time in your iPhone's Settings: tap your name, then Subscriptions. Cancelling stops future renewals; it doesn't refund the current period.",
      "Already subscribed on this Apple ID? Open the Settings tab in Flagged and tap Restore Purchase to regain access.",
    ],
  },
];

export default function SubscriptionDetails() {
  const t = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={12}
        style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.xs, paddingBottom: t.spacing.md }}
      >
        <Ionicons name="chevron-back" size={22} color={t.colors.cyan} />
        <Text tone="cyan" bold>
          Back
        </Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={{ gap: t.spacing.lg, paddingBottom: t.spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading" bold>
          Subscription details
        </Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={{ gap: t.spacing.sm }}>
            <Text variant="title" bold>
              {s.title}
            </Text>
            {s.body.map((p, i) => (
              <Text key={i} variant="subheadline" tone="muted">
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
