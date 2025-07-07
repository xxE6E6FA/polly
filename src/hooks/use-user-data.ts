import { api } from "@convex/_generated/api";
import { useMemo } from "react";
import { MONTHLY_MESSAGE_LIMIT } from "@/lib/constants";
import {
  clearUserCache,
  getCachedUserData,
  setCachedUser,
} from "@/lib/user-cache";
import type { User, UserId } from "@/types";
import { useConvexWithCache } from "./use-convex-cache";

const ANONYMOUS_MESSAGE_LIMIT = 10;

interface UserDataReturn {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAnonymous: boolean;
}

// Core user data hook - focused only on user entity
export function useUserData(): UserDataReturn {
  const { data: user, isLoading } = useConvexWithCache(
    api.users.current,
    {},
    {
      queryKey: "currentUser",
      getCachedData: () => getCachedUserData()?.user || null,
      setCachedData: user => {
        if (user) {
          const cached = getCachedUserData();
          setCachedUser(
            user,
            cached?.messageCount,
            cached?.monthlyUsage,
            cached?.hasUserApiKeys
          );
        }
      },
      clearCachedData: clearUserCache,
      invalidationEvents: ["user-graduated"],
    }
  );

  const isAuthenticated = Boolean(user && !user.isAnonymous);
  const isAnonymous = Boolean(user?.isAnonymous);

  return {
    user,
    isLoading,
    isAuthenticated,
    isAnonymous,
  };
}

// Message count hook
export function useUserMessageCount(userId: UserId | null) {
  return useConvexWithCache(
    api.users.getMessageCount,
    userId ? { userId } : "skip",
    {
      queryKey: ["messageCount", userId || ""],
      getCachedData: () => getCachedUserData()?.messageCount ?? null,
      setCachedData: count => {
        const cached = getCachedUserData();
        if (cached?.user && typeof count === "number") {
          setCachedUser(
            cached.user,
            count,
            cached.monthlyUsage,
            cached.hasUserApiKeys
          );
        }
      },
      clearCachedData: clearUserCache,
      invalidationEvents: ["user-graduated"],
    }
  );
}

// Monthly usage hook for authenticated users
export function useUserMonthlyUsage(
  userId: UserId | null,
  isAnonymous: boolean
) {
  return useConvexWithCache(
    api.users.getMonthlyUsage,
    !isAnonymous && userId ? { userId } : "skip",
    {
      queryKey: ["monthlyUsage", userId || ""],
      getCachedData: () => getCachedUserData()?.monthlyUsage ?? null,
      setCachedData: usage => {
        const cached = getCachedUserData();
        if (cached?.user && usage) {
          setCachedUser(
            cached.user,
            cached.messageCount,
            usage,
            cached.hasUserApiKeys
          );
        }
      },
      clearCachedData: clearUserCache,
      invalidationEvents: ["user-graduated"],
    }
  );
}

// API keys hook
export function useUserApiKeys(isAnonymous: boolean) {
  return useConvexWithCache(
    api.users.hasUserApiKeys,
    isAnonymous ? "skip" : {},
    {
      queryKey: "hasUserApiKeys",
      getCachedData: () => getCachedUserData()?.hasUserApiKeys ?? null,
      setCachedData: hasKeys => {
        const cached = getCachedUserData();
        if (cached?.user && typeof hasKeys === "boolean") {
          setCachedUser(
            cached.user,
            cached.messageCount,
            cached.monthlyUsage,
            hasKeys
          );
        }
      },
      clearCachedData: clearUserCache,
      invalidationEvents: ["user-graduated"],
    }
  );
}

// User models hook
export function useUserModels(isAnonymous: boolean) {
  return useConvexWithCache(
    api.userModels.hasUserModels,
    isAnonymous ? "skip" : {},
    {
      queryKey: "hasUserModels",
      getCachedData: () => getCachedUserData()?.hasUserModels ?? null,
      setCachedData: hasModels => {
        const cached = getCachedUserData();
        if (cached?.user && typeof hasModels === "boolean") {
          setCachedUser(
            cached.user,
            cached.messageCount,
            cached.monthlyUsage,
            cached.hasUserApiKeys
          );
        }
      },
      clearCachedData: clearUserCache,
      invalidationEvents: ["user-graduated"],
    }
  );
}

// Computed user permissions and limits
export function useUserPermissions() {
  const { user, isAnonymous } = useUserData();
  const { data: messageCount } = useUserMessageCount(user?._id || null);
  const { data: monthlyUsage } = useUserMonthlyUsage(
    user?._id || null,
    isAnonymous
  );
  const { data: hasUserApiKeys } = useUserApiKeys(isAnonymous);
  const { data: hasUserModels } = useUserModels(isAnonymous);

  return useMemo(() => {
    const effectiveMessageCount = messageCount ?? 0;
    const hasUnlimitedCalls = Boolean(user?.hasUnlimitedCalls);

    if (isAnonymous) {
      const remainingMessages = Math.max(
        0,
        ANONYMOUS_MESSAGE_LIMIT - effectiveMessageCount
      );
      return {
        messageCount: effectiveMessageCount,
        remainingMessages,
        hasMessageLimit: true,
        canSendMessage: remainingMessages > 0,
        hasUnlimitedCalls: false,
        hasUserApiKeys: false,
        hasUserModels: false,
        monthlyUsage: undefined,
      };
    }

    // For authenticated users
    const monthlyLimit = monthlyUsage?.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
    const monthlyMessagesSent = monthlyUsage?.monthlyMessagesSent ?? 0;
    const remainingMessages = hasUnlimitedCalls
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, monthlyLimit - monthlyMessagesSent);

    return {
      messageCount: effectiveMessageCount,
      remainingMessages,
      hasMessageLimit: !hasUnlimitedCalls,
      canSendMessage:
        hasUnlimitedCalls || remainingMessages > 0 || Boolean(hasUserModels),
      hasUnlimitedCalls,
      hasUserApiKeys: Boolean(hasUserApiKeys),
      hasUserModels: Boolean(hasUserModels),
      monthlyUsage: monthlyUsage
        ? {
            monthlyMessagesSent,
            monthlyLimit,
            remainingMessages,
            resetDate: monthlyUsage.resetDate,
            needsReset: monthlyUsage.needsReset,
          }
        : undefined,
    };
  }, [
    user,
    isAnonymous,
    messageCount,
    monthlyUsage,
    hasUserApiKeys,
    hasUserModels,
  ]);
}

// Main composite hook for backward compatibility
export function useUser() {
  const userData = useUserData();
  const permissions = useUserPermissions();

  return {
    ...userData,
    ...permissions,
    // Computed properties
    isHydrated: !userData.isLoading,
  };
}
