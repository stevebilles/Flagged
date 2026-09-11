import { create } from "zustand";
import { getMetaValue, setMetaValue } from "../db/appMeta";
import { getProfiles } from "../db/repositories";
import { isPremiumCached } from "../purchases/purchases";
import type { Profile, ScanResultLike, RecheckHandoff } from "./storeTypes";

interface AppState {
  activeProfileId: string | null;
  // "All profiles" scan mode (docs/17): a shared flag, not a Home-local toggle,
  // so Scan checks everyone's combined filters when it's on. No stored data of
  // its own — it's computed live from every real profile at scan time.
  scanAllProfiles: boolean;
  isPremium: boolean;
  hasOnboarded: boolean;
  // ephemeral hand-off of the last scan into the results route
  lastScan: ScanResultLike | null;
  // ephemeral hand-off of a pantry recheck into the recheck-result route
  lastRecheck: RecheckHandoff | null;

  hydrate: () => void;
  setActiveProfile: (id: string) => void;
  setScanAllProfiles: (v: boolean) => void;
  setPremium: (v: boolean) => void;
  completeOnboarding: () => void;
  setLastScan: (s: ScanResultLike | null) => void;
  setLastRecheck: (r: RecheckHandoff | null) => void;
}

const KEY_ACTIVE_PROFILE = "activeProfileId";
const KEY_SCAN_ALL = "scanAllProfiles";
const KEY_ONBOARDED = "hasOnboarded";

export const useAppStore = create<AppState>((set) => ({
  activeProfileId: null,
  scanAllProfiles: false,
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
      scanAllProfiles: getMetaValue(KEY_SCAN_ALL) === "1",
      isPremium: isPremiumCached(),
      hasOnboarded: getMetaValue(KEY_ONBOARDED) === "1",
    });
  },

  setActiveProfile: (id) => {
    setMetaValue(KEY_ACTIVE_PROFILE, id);
    set({ activeProfileId: id, scanAllProfiles: false });
  },
  setScanAllProfiles: (v) => {
    setMetaValue(KEY_SCAN_ALL, v ? "1" : "0");
    set({ scanAllProfiles: v });
  },
  setPremium: (v) => set({ isPremium: v }),
  completeOnboarding: () => {
    setMetaValue(KEY_ONBOARDED, "1");
    set({ hasOnboarded: true });
  },
  setLastScan: (s) => set({ lastScan: s }),
  setLastRecheck: (r) => set({ lastRecheck: r }),
}));
