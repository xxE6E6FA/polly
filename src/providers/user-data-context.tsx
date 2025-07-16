import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import {
  ANONYMOUS_MESSAGE_LIMIT,
  MONTHLY_MESSAGE_LIMIT,
} from "@shared/constants";
import type React from "react";
import { createContext, useContext, useMemo } from "react";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { isApiKeysArray } from "@/lib/type-guards";

interface MonthlyUsage {
  monthlyLimit: number;
  monthlyMessagesSent: number;
  resetDate?: number;
  needsReset?: boolean;
  remainingMessages: number;
}

interface UserData {
  canSendMessage: boolean;
  hasMessageLimit: boolean;
  hasUnlimitedCalls: boolean;
  monthlyUsage?: MonthlyUsage;
  hasUserApiKeys: boolean;
  hasUserModels: boolean;
  isAnonymous: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
}

type UserDataProviderValue = UserData & {
  user: Doc<"users">;
};

const UserDataContext = createContext<UserDataProviderValue | undefined>(
  undefined
);

function buildAnonymousUserData(user: Doc<"users">): UserData {
  const remainingMessages = Math.max(
    0,
    ANONYMOUS_MESSAGE_LIMIT - (user.messagesSent || 0)
  );
  return {
    canSendMessage: remainingMessages > 0,
    hasMessageLimit: true,
    hasUnlimitedCalls: false,
    monthlyUsage: {
      monthlyLimit: ANONYMOUS_MESSAGE_LIMIT,
      monthlyMessagesSent: user.messagesSent || 0,
      remainingMessages,
    },
    hasUserApiKeys: false,
    hasUserModels: false,
    isAnonymous: true,
    isAuthenticated: false,
    isLoading: false,
  };
}

function buildAuthenticatedUserData({
  user,
  monthlyUsageData,
  hasUserApiKeys,
  hasUserModelsData,
}: {
  user: Doc<"users">;
  monthlyUsageData: MonthlyUsage | null;
  hasUserApiKeys: boolean;
  hasUserModelsData: boolean;
}): UserData {
  const hasUnlimitedCalls = !!user.hasUnlimitedCalls;
  const monthlyLimit = monthlyUsageData?.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
  const monthlyMessagesSent = monthlyUsageData?.monthlyMessagesSent ?? 0;
  const remainingMessages = hasUnlimitedCalls
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, monthlyLimit - monthlyMessagesSent);
  return {
    canSendMessage:
      hasUnlimitedCalls || remainingMessages > 0 || hasUserModelsData,
    hasMessageLimit: !hasUnlimitedCalls,
    hasUnlimitedCalls,
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
    isAnonymous: false,
    isAuthenticated: true,
    isLoading: false,
  };
}

export const UserDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const user = usePersistentConvexQuery<Doc<"users"> | null>(
    "current-user",
    api.users.current,
    {}
  );

  const apiKeysRaw = usePersistentConvexQuery(
    "api-keys",
    api.apiKeys.getUserApiKeys,
    user && !user.isAnonymous ? {} : "skip"
  );

  const userModelsRaw = usePersistentConvexQuery(
    "user-models",
    api.userModels.getUserModels,
    user?._id ? { userId: user._id } : "skip"
  );

  const value = useMemo(() => {
    if (!user) {
      const syntheticAnonUser = {
        _creationTime: 0,
        isAnonymous: true,
        name: undefined,
        email: undefined,
        emailVerified: undefined,
        emailVerificationTime: undefined,
        image: undefined,
        messagesSent: 0,
        createdAt: 0,
      };
      return {
        ...buildAnonymousUserData(syntheticAnonUser as Doc<"users">),
        user: syntheticAnonUser as Doc<"users">,
        isLoading: false,
      };
    }
    const isAnonymous = !!user.isAnonymous;
    const apiKeysData = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];
    const hasUserApiKeys = apiKeysData.length > 0;
    const hasUserModelsData = Array.isArray(userModelsRaw)
      ? userModelsRaw.length > 0
      : false;
    if (isAnonymous) {
      return {
        ...buildAnonymousUserData(user),
        user,
        isLoading: false,
      };
    }
    return {
      ...buildAuthenticatedUserData({
        user,
        monthlyUsageData: null, // TODO: wire up real monthly usage if available
        hasUserApiKeys,
        hasUserModelsData,
      }),
      user,
      isLoading: false,
    };
  }, [user, apiKeysRaw, userModelsRaw]);

  return (
    <UserDataContext.Provider value={value}>
      {children}
    </UserDataContext.Provider>
  );
};

export function useUserDataContext() {
  const ctx = useContext(UserDataContext);
  if (!ctx) {
    throw new Error(
      "useUserDataContext must be used within a UserDataProvider"
    );
  }
  return ctx;
}
