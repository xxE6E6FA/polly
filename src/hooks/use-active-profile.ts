import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useMemo } from "react";
import type { Profile, ProfileId } from "@/types";
import { useProfiles } from "./use-profiles";
import { useUserSettings } from "./use-user-settings";

export function useActiveProfile(): {
  activeProfile: Profile | undefined;
  setActiveProfile: (profileId: ProfileId) => Promise<void>;
  profiles: Profile[] | undefined;
  isLoading: boolean;
} {
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const userSettings = useUserSettings();
  const setActiveMutation = useMutation(api.profiles.setActive);

  const activeProfile = useMemo(() => {
    if (!profiles || profiles.length === 0) {
      return undefined;
    }

    // Try to find profile matching activeProfileId from settings
    if (userSettings?.activeProfileId) {
      const found = profiles.find(p => p._id === userSettings.activeProfileId);
      if (found) {
        return found;
      }
    }

    // Fall back to default profile
    return profiles.find(p => p.isDefault) ?? profiles[0];
  }, [profiles, userSettings?.activeProfileId]);

  const setActiveProfile = async (profileId: ProfileId) => {
    try {
      await setActiveMutation({ profileId });
    } catch (error) {
      console.error("Failed to switch profile:", error);
    }
  };

  return {
    activeProfile,
    setActiveProfile,
    profiles,
    isLoading: profilesLoading,
  };
}
