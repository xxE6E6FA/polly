import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  ANONYMOUS_MESSAGE_LIMIT,
  MONTHLY_MESSAGE_LIMIT,
} from "@shared/constants";
import { useMemo } from "react";
import {
  isApiKeysArray,
  isMonthlyUsage,
  isUser,
  isUserSettings,
} from "@/lib/type-guards";
import { usePersistentConvexQuery } from "./use-persistent-convex-query";

interface UserData {
  user: Doc<"users">;
  isAnonymous: boolean;
  isAuthenticated: boolean;
  messageCount: number;
  remainingMessages: number;
  hasMessageLimit: boolean;
  canSendMessage: boolean;
  isLoading: boolean;
  monthlyUsage?: {
    monthlyMessagesSent: number;
    monthlyLimit: number;
    remainingMessages: number;
    resetDate?: number;
    needsReset?: boolean;
  };
  hasUserApiKeys: boolean;
  hasUserModels: boolean;
  hasUnlimitedCalls: boolean;
  isHydrated: boolean;
}

interface MonthlyUsage {
  monthlyLimit: number;
  monthlyMessagesSent: number;
  resetDate?: number;
  needsReset?: boolean;
}

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

type BuildAnonymousParams = {
  user: Doc<"users">;
  messageCount: number;
};

function buildAnonymousUserData({
  user,
  messageCount,
}: BuildAnonymousParams): UserData {
  const remainingMessages = Math.max(0, ANONYMOUS_MESSAGE_LIMIT - messageCount);

  return {
    user,
    isAnonymous: true,
    isAuthenticated: false,
    messageCount,
    remainingMessages,
    hasMessageLimit: true,
    canSendMessage: remainingMessages > 0,
    isLoading: false,
    hasUserApiKeys: false,
    hasUserModels: false,
    hasUnlimitedCalls: false,
    isHydrated: true,
  };
}

type BuildAuthenticatedParams = {
  user: Doc<"users">;
  messageCount: number;
  monthlyUsageData: MonthlyUsage | null;
  hasUserApiKeys: boolean;
  hasUserModelsData: boolean;
};

function buildAuthenticatedUserData({
  user,
  messageCount,
  monthlyUsageData,
  hasUserApiKeys,
  hasUserModelsData,
}: BuildAuthenticatedParams): UserData {
  const hasUnlimitedCalls = !!user.hasUnlimitedCalls;

  const monthlyLimit = monthlyUsageData?.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
  const monthlyMessagesSent = monthlyUsageData?.monthlyMessagesSent ?? 0;

  const remainingMessages = hasUnlimitedCalls
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, monthlyLimit - monthlyMessagesSent);

  const result: UserData = {
    user,
    isAnonymous: false,
    isAuthenticated: true,
    messageCount,
    remainingMessages,
    hasMessageLimit: !hasUnlimitedCalls,
    canSendMessage:
      hasUnlimitedCalls || remainingMessages > 0 || hasUserModelsData,
    isLoading: false,
    monthlyUsage: monthlyUsageData
      ? {
          monthlyMessagesSent,
          monthlyLimit,
          remainingMessages,
          resetDate: monthlyUsageData.resetDate,
          needsReset: monthlyUsageData.needsReset,
        }
      : undefined,
    hasUserApiKeys,
    hasUserModels: hasUserModelsData,
    hasUnlimitedCalls,
    isHydrated: true,
  };

  return result;
}

export function useUserData(): UserData | null {
  const userRaw = usePersistentConvexQuery(
    "current-user",
    api.users.current,
    {}
  );

  const user = isUser(userRaw) ? userRaw : null;

  const messageCountRaw = usePersistentConvexQuery(
    "user-message-count",
    api.users.getMessageCount,
    user?._id ? { userId: user._id } : "skip"
  );

  const monthlyUsageRaw = usePersistentConvexQuery(
    "monthly-usage",
    api.users.getMonthlyUsage,
    user && !user.isAnonymous ? { userId: user._id } : "skip"
  );

  const apiKeysRaw = usePersistentConvexQuery(
    "api-keys",
    api.apiKeys.getUserApiKeys,
    user?.isAnonymous ? "skip" : {}
  );

  // Fetch actual user models so we can determine if the user has **any** models
  const userModelsRaw = usePersistentConvexQuery(
    "user-models",
    api.userModels.getUserModels,
    user?._id ? { userId: user._id } : "skip"
  );

  return useMemo(() => {
    if (!user) {
      return null;
    }

    const isAnonymous = !!user.isAnonymous;
    const messageCount =
      typeof messageCountRaw === "number" ? messageCountRaw : 0;
    const apiKeysData = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];
    const monthlyUsageData: MonthlyUsage | null = isMonthlyUsage(
      monthlyUsageRaw
    )
      ? (monthlyUsageRaw as MonthlyUsage)
      : null;
    const hasUserApiKeys = apiKeysData.length > 0;
    const hasUserModelsData = Array.isArray(userModelsRaw)
      ? userModelsRaw.length > 0
      : false;

    if (isAnonymous) {
      return buildAnonymousUserData({ user, messageCount });
    }

    return buildAuthenticatedUserData({
      user,
      messageCount,
      monthlyUsageData,
      hasUserApiKeys,
      hasUserModelsData,
    });
  }, [user, messageCountRaw, monthlyUsageRaw, apiKeysRaw, userModelsRaw]);
}

export function useUserSettingsData(
  userId?: Id<"users">
): Doc<"userSettings"> | null {
  const settings = usePersistentConvexQuery<Doc<"userSettings"> | null>(
    "userSettings",
    api.userSettings.getUserSettings,
    userId ? { userId } : "skip"
  );

  return settings ?? null;
}

export function useUserMonthlyUsage(
  isAnonymous: boolean,
  userId?: Id<"users">
): {
  monthlyMessagesSent: number;
  monthlyLimit: number;
  remainingMessages: number;
  resetDate?: number;
  needsReset?: boolean;
} {
  const monthlyUsage = usePersistentConvexQuery(
    "monthlyUsage",
    api.users.getMonthlyUsage,
    !isAnonymous && userId ? { userId } : "skip"
  );

  return isMonthlyUsage(monthlyUsage)
    ? monthlyUsage
    : {
        monthlyMessagesSent: 0,
        monthlyLimit: MONTHLY_MESSAGE_LIMIT,
        remainingMessages: MONTHLY_MESSAGE_LIMIT,
      };
}

export function useUserApiKeys(isAnonymous: boolean) {
  const apiKeys = usePersistentConvexQuery(
    "apiKeys",
    api.apiKeys.getUserApiKeys,
    isAnonymous ? "skip" : {}
  );

  return isApiKeysArray(apiKeys) ? apiKeys : [];
}

export function useUserDataWithContext() {
  const userData = useUserData();

  // Always call hooks unconditionally
  const userSettings = usePersistentConvexQuery(
    "userSettings",
    api.userSettings.getUserSettings,
    userData?.user._id ? { userId: userData.user._id } : "skip"
  );

  const apiKeysRaw = usePersistentConvexQuery(
    "apiKeys",
    api.apiKeys.getUserApiKeys,
    userData?.isAnonymous ? "skip" : {}
  );

  const monthlyUsageRaw = usePersistentConvexQuery(
    "monthlyUsage",
    api.users.getMonthlyUsage,
    userData && !userData.isAnonymous && userData.user._id
      ? { userId: userData.user._id }
      : "skip"
  );

  return useMemo(() => {
    if (!userData) {
      return null;
    }

    const safeUserSettings = isUserSettings(userSettings) ? userSettings : null;
    const apiKeysData = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];
    const monthlyUsageData = isMonthlyUsage(monthlyUsageRaw)
      ? monthlyUsageRaw
      : null;

    const hasUserApiKeys = apiKeysData.length > 0;
    const hasUnlimitedCalls = !userData.isAnonymous || hasUserApiKeys;

    const monthlyLimit =
      monthlyUsageData?.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
    const monthlyMessagesSent = monthlyUsageData?.monthlyMessagesSent ?? 0;
    const hasMessageLimit = userData.isAnonymous && !hasUserApiKeys;

    const remainingMessages = hasMessageLimit
      ? Math.max(0, monthlyLimit - monthlyMessagesSent)
      : Number.POSITIVE_INFINITY;

    return {
      userData,
      userSettings: safeUserSettings,
      hasUserApiKeys,
      hasUnlimitedCalls,
      monthlyUsage: {
        monthlyLimit,
        monthlyMessagesSent,
        remainingMessages,
        resetDate: monthlyUsageData?.resetDate,
        needsReset: monthlyUsageData?.needsReset,
      },
      hasMessageLimit,
      remainingMessages,
      apiKeysData,
      isLoading: false,
    };
  }, [userData, userSettings, apiKeysRaw, monthlyUsageRaw]);
}
