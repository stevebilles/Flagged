import { create } from "zustand";
import { getMetaValue, setMetaValue } from "../db/appMeta";
import { getProfiles } from "../db/repositories";
import { isPremiumCached } from "../purchases/purchases";
import type { Profile, ScanResultLike, RecheckHandoff } from "./storeTypes";

interface AppState {
  activeProfileId: string | null;
  isPremium: boolean;
  hasOnboarded: boolean;
  // ephemeral hand-off of the last scan into the results route
  lastScan: ScanResultLike | null;
  // ephemeral hand-off of a pantry recheck into the recheck-result route
  lastRecheck: RecheckHandoff | null;

  hydrate: () => void;
  setActiveProfile: (id: string) => void;
  setPremium: (v: boolean) => void;
  completeOnboarding: () => void;
  setLastScan: (s: ScanResultLike | null) => void;
  setLastRecheck: (r: RecheckHandoff | null) => void;
}

const KEY_ACTIVE_PROFILE = "activeProfileId";
const KEY_ONBOARDED = "hasOnboarded";

export const useAppStore = create<AppState>((set) => ({
  activeProfileId: null,
  isPremium: false,
  hasOnboarded: false,
  lastScan: null,
  lastRecheck: null,

  hydrate: () => {
    const profiles: Profile[] = getProfiles();
    const stored = getMetaValue(KEY_ACTIVE_PROFILE);
    const activeProfileId =
      stored && profiles.some((p) => p.profileId === stored)
        ? stored
        : profiles[0]?.profileId ?? null;
    set({
      activeProfileId,
      isPremium: isPremiumCached(),
      hasOnboarded: getMetaValue(KEY_ONBOARDED) === "1",
    });
  },

  setActiveProfile: (id) => {
    setMetaValue(KEY_ACTIVE_PROFILE, id);
    set({ activeProfileId: id });
  },
  setPremium: (v) => set({ isPremium: v }),
  completeOnboarding: () => {
    setMetaValue(KEY_ONBOARDED, "1");
    set({ hasOnboarded: true });
  },
  setLastScan: (s) => set({ lastScan: s }),
  setLastRecheck: (r) => set({ lastRecheck: r }),
}));
