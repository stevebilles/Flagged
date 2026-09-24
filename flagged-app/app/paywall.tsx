import React from "react";
import { useRouter } from "expo-router";
import { Screen } from "../src/design/components";
import { PaywallView } from "../src/purchases/PaywallView";

/**
 * Standalone paywall route (docs/08). The Scan tab now shows the paywall inline
 * for non-subscribers, so nothing navigates here today; it's kept for the
 * onboarding soft paywall (not built yet) and renders the same PaywallView.
 */
export default function Paywall() {
  const router = useRouter();
  return (
    <Screen>
      <PaywallView onPurchased={() => router.back()} onDismiss={() => router.back()} />
    </Screen>
  );
}
