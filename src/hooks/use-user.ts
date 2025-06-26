import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type Preloaded,
  useAction,
  useMutation,
  usePreloadedQuery,
  useQuery,
} from "convex/react";

import { api } from "../../convex/_generated/api";
import {
  getStoredAnonymousUserId,
  onAnonymousUserCreated,
  storeAnonymousUserId as storeUserId,
} from "../lib/auth-utils";
import { MONTHLY_MESSAGE_LIMIT } from "../lib/constants";
import {
  clearUserCache,
  getCachedUserData,
  setCachedUser,
} from "../lib/user-cache";
import { type User, type UserId } from "../types";

// Keep in sync with server-side ANONYMOUS_MESSAGE_LIMIT in convex/users.ts
const ANONYMOUS_MESSAGE_LIMIT = 10;

type UseUserReturn = {
  user: User | null;
  messageCount: number;
  remainingMessages: number;
  isAnonymous: boolean;
  hasMessageLimit: boolean;
  canSendMessage: boolean;
  isLoading: boolean;
  // New fields for authenticated users
  monthlyUsage?: {
    monthlyMessagesSent: number;
    monthlyLimit: number;
    remainingMessages: number;
    resetDate: number | null | undefined;
    needsReset: boolean;
  };
  hasUserApiKeys?: boolean;
  hasUnlimitedCalls?: boolean;
  isHydrated?: boolean;
};

// Helper function to compute user properties consistently

function computeUserProperties(
  user: User | null,
  messageCount: number | undefined,
  monthlyUsage:
    | {
        monthlyMessagesSent: number;
        monthlyLimit: number;
        remainingMessages: number;
        resetDate: number | null | undefined;
        needsReset: boolean;
      }
    | null
    | undefined,
  hasUserApiKeys: boolean | undefined,
  isLoading: boolean
): Omit<UseUserReturn, "user"> {
  const isAnonymous = user?.isAnonymous ?? true;

  if (isAnonymous) {
    // Anonymous users: use existing logic
    const actualMessageCount = messageCount ?? 0;
    const remainingMessages = Math.max(
      0,
      ANONYMOUS_MESSAGE_LIMIT - actualMessageCount
    );
    const hasMessageLimit = true;
    const canSendMessage = actualMessageCount < ANONYMOUS_MESSAGE_LIMIT;

    return {
      messageCount: actualMessageCount,
      remainingMessages,
      isAnonymous,
      hasMessageLimit,
      canSendMessage,
      isLoading,
      hasUnlimitedCalls: false, // Anonymous users never have unlimited calls
    };
  }
  // Authenticated users: use monthly limits
  const monthlyMessagesSent = monthlyUsage?.monthlyMessagesSent ?? 0;
  const monthlyLimit = monthlyUsage?.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyMessagesSent);

  // Can send message if has unlimited calls OR under monthly limit OR has BYOK models available
  const canSendMessage = Boolean(
    user?.hasUnlimitedCalls || monthlyRemaining > 0 || hasUserApiKeys
  );

  return {
    messageCount: 0, // Not relevant for authenticated users
    remainingMessages: user?.hasUnlimitedCalls ? -1 : monthlyRemaining, // -1 indicates unlimited
    isAnonymous,
    hasMessageLimit: !user?.hasUnlimitedCalls,
    canSendMessage,
    isLoading,
    monthlyUsage: monthlyUsage || undefined,
    hasUserApiKeys,
    hasUnlimitedCalls: user?.hasUnlimitedCalls || false,
  };
}

// Main unified user hook - works for both authenticated and anonymous users

export function useUserData(): UseUserReturn {
  // Initialize with cached data for instant rendering
  const [cachedData] = useState(() => {
    return getCachedUserData();
  });

  // First try to get authenticated user via Convex Auth
  const authenticatedUser = useQuery(api.users.getCurrentUser);

  // Get anonymous user ID from storage for fallback
  const [storedAnonymousUserId, setStoredAnonymousUserId] =
    useState<UserId | null>(() => {
      return getStoredAnonymousUserId();
    });

  // Listen for anonymous user creation event
  useEffect(() => {
    return onAnonymousUserCreated(userId => {
      setStoredAnonymousUserId(userId);
    });
  }, []);

  // Listen for graduation completion event and clear anonymous user state
  useEffect(() => {
    const handleGraduationComplete = () => {
      setStoredAnonymousUserId(null);
      clearUserCache();
    };

    window.addEventListener("user-graduated", handleGraduationComplete);
    return () => {
      window.removeEventListener("user-graduated", handleGraduationComplete);
    };
  }, []);

  // Migration helpers
  const initializeMessagesSent = useMutation(api.users.initializeMessagesSent);
  const initializeMonthlyLimits = useMutation(
    api.users.initializeMonthlyLimits
  );

  // Query anonymous user data if no authenticated user and we have a stored ID
  const anonymousUser = useQuery(
    api.users.getById,
    !authenticatedUser && storedAnonymousUserId
      ? { id: storedAnonymousUserId }
      : "skip"
  );

  // Get message count for the current user
  const currentUserId = authenticatedUser?._id || anonymousUser?._id || null;
  const messageCount = useQuery(
    api.users.getMessageCount,
    currentUserId ? { userId: currentUserId } : "skip"
  );

  // Get monthly usage for authenticated users
  const monthlyUsage = useQuery(
    api.users.getMonthlyUsage,
    authenticatedUser && !authenticatedUser.isAnonymous
      ? { userId: authenticatedUser._id }
      : "skip"
  );

  // Check if user has API keys for BYOK models
  const hasUserApiKeys = useQuery(
    api.users.hasUserApiKeys,
    authenticatedUser && !authenticatedUser.isAnonymous ? {} : "skip"
  );

  // Determine which user to use (authenticated takes priority)
  const currentUser: User | null = useMemo(() => {
    if (authenticatedUser) {
      return authenticatedUser;
    }
    if (anonymousUser && storedAnonymousUserId) {
      return anonymousUser;
    }
    return null;
  }, [authenticatedUser, anonymousUser, storedAnonymousUserId]);

  useEffect(() => {
    if (currentUser && currentUser.messagesSent === undefined) {
      initializeMessagesSent({ userId: currentUser._id });
    }
  }, [currentUser, initializeMessagesSent]);

  useEffect(() => {
    if (currentUser && !currentUser.isAnonymous) {
      initializeMonthlyLimits({ userId: currentUser._id });
    }
  }, [currentUser, initializeMonthlyLimits]);

  // Update cache when user data changes
  useEffect(() => {
    if (currentUser) {
      // Extract only the fields we need for caching
      const cacheableMonthlyUsage = monthlyUsage
        ? {
            monthlyMessagesSent: monthlyUsage.monthlyMessagesSent,
            monthlyLimit: monthlyUsage.monthlyLimit,
            remainingMessages: monthlyUsage.remainingMessages,
            resetDate: monthlyUsage.resetDate,
            needsReset: monthlyUsage.needsReset,
          }
        : undefined;

      setCachedUser(
        currentUser,
        messageCount,
        cacheableMonthlyUsage,
        hasUserApiKeys
      );
    } else if (authenticatedUser === null && !storedAnonymousUserId) {
      // Clear cache when logged out
      clearUserCache();
    }
  }, [
    currentUser,
    messageCount,
    monthlyUsage,
    hasUserApiKeys,
    authenticatedUser,
    storedAnonymousUserId,
  ]);

  // Determine loading state
  const isLoading = useMemo(() => {
    // If authenticated user query is still pending
    if (authenticatedUser === undefined) {
      return true;
    }

    // If we have no authenticated user but have a stored anonymous ID and that query is still pending
    if (
      authenticatedUser === null &&
      storedAnonymousUserId &&
      anonymousUser === undefined
    ) {
      return true;
    }

    // If we have no authenticated user and no stored anonymous user ID, we're not loading
    // (we'll wait for user to start a conversation to create anonymous user)
    if (authenticatedUser === null && !storedAnonymousUserId) {
      return false;
    }

    return false;
  }, [authenticatedUser, anonymousUser, storedAnonymousUserId]);

  // Use cached data while loading
  const effectiveUser = currentUser || cachedData?.user || null;
  const effectiveMessageCount = messageCount ?? cachedData?.messageCount;
  const effectiveMonthlyUsage = monthlyUsage ?? cachedData?.monthlyUsage;
  const effectiveHasUserApiKeys = hasUserApiKeys ?? cachedData?.hasUserApiKeys;

  const userProperties = computeUserProperties(
    effectiveUser,
    effectiveMessageCount,
    effectiveMonthlyUsage,
    effectiveHasUserApiKeys,
    isLoading
  );

  return {
    user: effectiveUser,
    ...userProperties,
  };
}

export function usePreloadedUser(
  preloadedUser: Preloaded<typeof api.users.getById>,
  preloadedMessageCount: Preloaded<typeof api.users.getMessageCount>,
  preloadedMonthlyUsage: Preloaded<typeof api.users.getMonthlyUsage>,
  preloadedHasUserApiKeys: Preloaded<typeof api.users.hasUserApiKeys>
): UseUserReturn {
  const user = usePreloadedQuery(preloadedUser);
  const messageCount = usePreloadedQuery(preloadedMessageCount);
  const monthlyUsage = usePreloadedQuery(preloadedMonthlyUsage);
  const hasUserApiKeys = usePreloadedQuery(preloadedHasUserApiKeys);

  const initializeMessagesSent = useMutation(api.users.initializeMessagesSent);

  useEffect(() => {
    if (user && user.messagesSent === undefined) {
      initializeMessagesSent({ userId: user._id });
    }
  }, [user, initializeMessagesSent]);

  const userProperties = computeUserProperties(
    user,
    messageCount,
    monthlyUsage,
    hasUserApiKeys,
    false
  );

  return {
    user,
    ...userProperties,
  };
}

// Export the centralized storeAnonymousUserId function
export const storeAnonymousUserId = storeUserId;

// Hook for ensuring a user exists (creates anonymous user if needed and not authenticated)

export function useEnsureUser() {
  const getOrCreateUser = useAction(api.conversations.getOrCreateUser);
  const [isEnsuring, setIsEnsuring] = useState(false);
  const { user } = useUserData();

  const ensureUser = useCallback(
    async (existingUserId?: UserId) => {
      // If we already have an authenticated user, return their ID
      if (user && !user.isAnonymous) {
        return user._id;
      }

      setIsEnsuring(true);
      try {
        const result = await getOrCreateUser({
          userId: existingUserId || user?._id,
        });

        // If a new anonymous user was created, store it
        if (result.isNewUser) {
          storeAnonymousUserId(result.userId);
        }

        return result.userId;
      } finally {
        setIsEnsuring(false);
      }
    },
    [getOrCreateUser, user]
  );

  return { ensureUser, isEnsuring };
}

// Re-export useUser from provider to make migration easier
// This avoids having to update all imports across the codebase
export { useUser } from "../providers/user-provider";
