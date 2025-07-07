import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";

export function useUserSettings(userId?: Id<"users">) {
  return useQuery(api.userSettings.getUserSettings, { userId });
}

export function useUserSettingsMutations() {
  const updateUserSettings = useMutation(api.userSettings.updateUserSettings);
  const togglePersonasEnabled = useMutation(
    api.userSettings.togglePersonasEnabled
  );

  return {
    updateUserSettings,
    togglePersonasEnabled,
  };
}
