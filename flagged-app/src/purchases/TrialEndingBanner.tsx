import React, { useEffect, useState } from "react";
import { View, Pressable, Linking, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, withAlpha } from "../design/components";
import { useTheme } from "../design/ThemeProvider";
import { useAppStore } from "../state/appStore";
import { MANAGE_SUBSCRIPTION_URL } from "./purchases";
import { trialBannerState } from "./trialBanner";

/** "Tue 5:42 PM" — the trial's end and cancel-by times, in the user's own locale/timezone. */
function when(ms: number): string {
  // iOS puts a narrow no-break space (U+202F) before AM/PM, which Atkinson Hyperlegible
  // renders too tight ("7:41PM") — use a normal space.
  return new Date(ms)
    .toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })
    .replace(/ /g, " ");
}

/**
 * The in-app heads-up that a free trial is about to end (docs/08). Shown at the
 * top of Home during the last 3 days of a trial that hasn't been cancelled. It
 * is the app's own reminder — Apple sends none, and we deliberately don't use
 * push notifications — so the paywall promises an "in-app reminder". It shows
 * a calm "cancel by" time (Apple needs cancelling 24h before the end), not a
 * countdown. Logic + tests: trialBanner.ts.
 */
export function TrialEndingBanner() {
  const t = useTheme();
  const trialInfo = useAppStore((s) => s.trialInfo);
  const manageUrl = MANAGE_SUBSCRIPTION_URL;
  const [now, setNow] = useState(() => Date.now());

  // Re-evaluate every minute and whenever the app returns to the foreground.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  const state = trialBannerState(trialInfo, now);
  if (!state) return null;

  const late = state.kind === "past-cutoff";
  const accent = late ? t.colors.warning : t.colors.cyan;

  return (
    <View
      accessibilityRole="summary"
      style={{
        flexDirection: "row",
        gap: t.spacing.md,
        padding: t.spacing.md,
        borderRadius: t.radius.md,
        borderWidth: 1,
        borderColor: withAlpha(accent, 0.5),
        backgroundColor: withAlpha(accent, 0.08),
      }}
    >
      <Ionicons name="time-outline" size={24} color={accent} />
      <View style={{ flex: 1, gap: t.spacing.xs }}>
        <Text bold>Your free trial ends {when(state.endsAtMs)}</Text>
        <Text variant="subheadline" tone="muted">
          {late
            ? "Your card will be charged $24.99 then. The 24-hour cancel window has passed."
            : `Cancel by ${when(state.cancelByMs)} if you don't want to be charged $24.99.`}
        </Text>
        {manageUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(manageUrl)}
            hitSlop={8}
            style={{ alignSelf: "flex-start", paddingTop: t.spacing.xs }}
          >
            <Text variant="subheadline" bold tone="cyan">
              Manage subscription
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
