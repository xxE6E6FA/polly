import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";

export type UserSettings = Doc<"userSettings"> | null;

export function getInitialUserSettings(): UserSettings | null {
  return get(CACHE_KEYS.userSettings, null);
}

export function useUserSettings(): UserSettings | undefined {
  const { isAuthenticated } = useConvexAuth();

  // Skip until auth is ready so pre-auth null doesn't override cached settings
  const userSettingsRaw = useQuery(
    api.userSettings.getUserSettings,
    isAuthenticated ? {} : "skip"
  ) as UserSettings | undefined;

  const userSettings = useMemo(() => {
    if (userSettingsRaw) {
      return userSettingsRaw;
    }
    return get(CACHE_KEYS.userSettings, null);
  }, [userSettingsRaw]);

  useEffect(() => {
    if (userSettings) {
      set(CACHE_KEYS.userSettings, userSettings);
    }
  }, [userSettings]);

  return userSettings;
}
