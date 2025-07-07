import { api } from "@convex/_generated/api";
import { type Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { storeAnonymousUserId as storeUserId } from "@/lib/auth-utils";
import { MONTHLY_MESSAGE_LIMIT } from "@/lib/constants";
import type { User } from "@/types";
import { useUserData, useUserPermissions } from "./use-user-data";

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

function computeUserProperties({
  user,
  messageCount,
  monthlyUsage,
  hasUserApiKeys,
  hasUserModels,
  isLoading,
}: {
  user: User | null;
  messageCount: number | undefined;
  monthlyUsage:
    | {
        monthlyMessagesSent: number;
        monthlyLimit: number;
        remainingMessages: number;
        resetDate: number | null | undefined;
        needsReset: boolean;
      }
    | null
    | undefined;
  hasUserApiKeys: boolean;
  hasUserModels: boolean;
  isLoading: boolean;
}): Omit<UseUserReturn, "user"> {
  const isAnonymous = !user || user.isAnonymous;
  const effectiveMessageCount = messageCount ?? 0;

  // For anonymous users
  if (isAnonymous) {
    const remainingMessages = Math.max(
      0,
      ANONYMOUS_MESSAGE_LIMIT - effectiveMessageCount
    );
    return {
      messageCount: effectiveMessageCount,
      remainingMessages,
      isAnonymous: true,
      hasMessageLimit: true,
      canSendMessage: remainingMessages > 0,
      isLoading,
      hasUnlimitedCalls: false,
      isHydrated: !isLoading,
    };
  }

  // For authenticated users
  const hasUnlimitedCalls = Boolean(user.hasUnlimitedCalls);
  const monthlyLimit = monthlyUsage?.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
  const monthlyMessagesSent = monthlyUsage?.monthlyMessagesSent ?? 0;
  const remainingMessages = hasUnlimitedCalls
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, monthlyLimit - monthlyMessagesSent);

  return {
    messageCount: effectiveMessageCount,
    remainingMessages,
    isAnonymous: false,
    hasMessageLimit: !hasUnlimitedCalls,
    canSendMessage: hasUnlimitedCalls || remainingMessages > 0 || hasUserModels,
    isLoading,
    monthlyUsage: monthlyUsage
      ? {
          monthlyMessagesSent,
          monthlyLimit,
          remainingMessages,
          resetDate: monthlyUsage.resetDate,
          needsReset: monthlyUsage.needsReset,
        }
      : undefined,
    hasUserApiKeys,
    hasUnlimitedCalls,
    isHydrated: !isLoading,
  };
}

// Preloaded user hook for SSR/initial load optimization
export function usePreloadedUser(
  preloadedUser: Preloaded<typeof api.users.getById>,
  preloadedMessageCount: Preloaded<typeof api.users.getMessageCount>,
  preloadedMonthlyUsage: Preloaded<typeof api.users.getMonthlyUsage>,
  preloadedHasUserApiKeys: Preloaded<typeof api.users.hasUserApiKeys>,
  preloadedHasUserModels: Preloaded<typeof api.userModels.hasUserModels>
): UseUserReturn {
  const user = usePreloadedQuery(preloadedUser);
  const messageCount = usePreloadedQuery(preloadedMessageCount);
  const monthlyUsage = usePreloadedQuery(preloadedMonthlyUsage);
  const hasUserApiKeys = usePreloadedQuery(preloadedHasUserApiKeys);
  const hasUserModels = usePreloadedQuery(preloadedHasUserModels);

  const initializeMessagesSent = useMutation(api.users.initializeMessagesSent);

  useEffect(() => {
    if (user && user.messagesSent === undefined) {
      initializeMessagesSent({ userId: user._id });
    }
  }, [user, initializeMessagesSent]);

  const userProperties = useMemo(
    () =>
      computeUserProperties({
        user,
        messageCount,
        monthlyUsage,
        hasUserApiKeys,
        hasUserModels,
        isLoading: false,
      }),
    [user, messageCount, monthlyUsage, hasUserApiKeys, hasUserModels]
  );

  return {
    user,
    ...userProperties,
  };
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

// Helper function for storing anonymous user ID
export const storeAnonymousUserId = storeUserId;
