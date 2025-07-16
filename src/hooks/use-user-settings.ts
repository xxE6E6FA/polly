import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { usePersistentConvexQuery } from "./use-persistent-convex-query";

export type UserSettings = Doc<"userSettings"> | null;

export function useUserSettings(
  userId?: Id<"users">
): UserSettings | undefined {
  return usePersistentConvexQuery<UserSettings>(
    "user-settings",
    api.userSettings.getUserSettings,
    { userId }
  );
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
