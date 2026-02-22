import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import * as ls from "@/lib/local-storage";
import { useUserDataContext } from "@/providers/user-data-context";
import type { Profile } from "@/types";

type CachedProfiles = Record<string, Profile[]>;

function getCachedProfiles(userId: string): Profile[] | undefined {
  const store = ls.get<CachedProfiles>("profiles", {});
  const cached = store[userId];
  if (Array.isArray(cached) && cached.length > 0) {
    return cached;
  }
  return undefined;
}

function setCachedProfiles(userId: string, profiles: Profile[]): void {
  const store = ls.get<CachedProfiles>("profiles", {});
  ls.set("profiles", { ...store, [userId]: profiles });
}

export function useProfiles(): {
  profiles: Profile[] | undefined;
  isLoading: boolean;
} {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUserDataContext();
  const userId = user?._id ? String(user._id) : undefined;

  const serverProfiles = useQuery(
    api.profiles.list,
    isAuthenticated ? {} : "skip"
  );

  // Keep last fresh server result to survive brief undefined transitions
  const lastFreshRef = useRef<Profile[] | null>(null);
  if (Array.isArray(serverProfiles)) {
    lastFreshRef.current = serverProfiles;
  }

  // Write to cache when we get fresh data
  useEffect(() => {
    if (userId && Array.isArray(serverProfiles) && serverProfiles.length > 0) {
      setCachedProfiles(userId, serverProfiles);
    }
  }, [serverProfiles, userId]);

  // Resolve: server data > last fresh > localStorage cache
  if (Array.isArray(serverProfiles)) {
    return { profiles: serverProfiles, isLoading: false };
  }

  if (lastFreshRef.current) {
    return { profiles: lastFreshRef.current, isLoading: false };
  }

  if (userId) {
    const cached = getCachedProfiles(userId);
    if (cached) {
      return { profiles: cached, isLoading: false };
    }
  }

  return {
    profiles: undefined,
    isLoading: isAuthenticated,
  };
}
