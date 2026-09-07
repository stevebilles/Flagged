import { Redirect } from "expo-router";
import { useAppStore } from "../src/state/appStore";

/** Entry: route to onboarding until completed, then the tab hub. */
export default function Index() {
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  return <Redirect href={hasOnboarded ? "/(tabs)" : "/onboarding"} />;
}
