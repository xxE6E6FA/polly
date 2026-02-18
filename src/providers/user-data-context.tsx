import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import {
  ANONYMOUS_MESSAGE_LIMIT,
  MONTHLY_MESSAGE_LIMIT,
} from "@shared/constants";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import type React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { isApiKeysArray } from "@/lib/type-guards";
import { useToast } from "@/providers/toast-context";

type AuthState = "initializing" | "anonymous" | "authenticated";

interface MonthlyUsage {
  monthlyLimit: number;
  resetDate?: number;
  remainingMessages: number;
}

interface UserData {
  canSendMessage: boolean;
  hasMessageLimit: boolean;
  hasUnlimitedCalls: boolean;
  monthlyUsage?: MonthlyUsage;
  hasUserApiKeys: boolean;
  hasUserModels: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  // True when capability data (API keys / models) is reliable
  capabilitiesReady: boolean;
}

type UserDataProviderValue = UserData & {
  user: Doc<"users"> | null;
  apiKeys: Doc<"userApiKeys">[];
};

const UserDataContext = createContext<UserDataProviderValue | undefined>(
  undefined
);

// Split contexts to minimize re-renders in consumers
type UserIdentity = {
  user: Doc<"users"> | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

type UserCapabilities = {
  canSendMessage: boolean;
  hasUserApiKeys: boolean;
  hasUserModels: boolean;
};

type UserUsage = {
  hasMessageLimit: boolean;
  hasUnlimitedCalls: boolean;
  monthlyUsage?: MonthlyUsage;
};

const UserIdentityContext = createContext<UserIdentity | undefined>(undefined);
const UserCapabilitiesContext = createContext<UserCapabilities | undefined>(
  undefined
);
const UserUsageContext = createContext<UserUsage | undefined>(undefined);

const DEFAULT_USER_DATA: UserData = {
  canSendMessage: false,
  hasMessageLimit: true,
  hasUnlimitedCalls: false,
  monthlyUsage: undefined,
  hasUserApiKeys: false,
  hasUserModels: false,
  isAuthenticated: false,
  isLoading: false,
  capabilitiesReady: false,
};

function buildUserData(
  user: Doc<"users">,
  hasUserApiKeys: boolean,
  hasUserModels: boolean,
  monthlyMessagesSent: number
): UserData {
  if (user.isAnonymous) {
    const remainingMessages = Math.max(
      0,
      ANONYMOUS_MESSAGE_LIMIT - monthlyMessagesSent
    );
    return {
      canSendMessage: remainingMessages > 0,
      hasMessageLimit: true,
      hasUnlimitedCalls: false,
      monthlyUsage: {
        monthlyLimit: ANONYMOUS_MESSAGE_LIMIT,
        remainingMessages,
      },
      hasUserApiKeys,
      hasUserModels,
      isAuthenticated: false,
      isLoading: false,
      capabilitiesReady: true,
    };
  }

  const hasUnlimitedCalls = !!user.hasUnlimitedCalls;
  const monthlyLimit = user.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
  const remainingMessages = hasUnlimitedCalls
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, monthlyLimit - monthlyMessagesSent);

  const monthlyUsage: MonthlyUsage | undefined = hasUnlimitedCalls
    ? undefined
    : {
        monthlyLimit,
        remainingMessages,
        resetDate: user.lastMonthlyReset,
      };

  return {
    canSendMessage: hasUnlimitedCalls || remainingMessages > 0 || hasUserModels,
    hasMessageLimit: !hasUnlimitedCalls,
    hasUnlimitedCalls,
    monthlyUsage,
    hasUserApiKeys,
    hasUserModels,
    isAuthenticated: true,
    isLoading: false,
    capabilitiesReady: true,
  };
}

export const UserDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isGraduating, setIsGraduating] = useState(false);
  const graduateAnonymousUser = useAction(api.users.graduateAnonymousUser);
  const ensureUser = useMutation(api.users.ensureUser);
  const managedToast = useToast();
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const ensuringUserRef = useRef(false);

  const userRecord = useQuery(api.users.current);

  const apiKeysRaw = useQuery(
    api.apiKeys.getUserApiKeys,
    userRecord && !userRecord.isAnonymous ? {} : "skip"
  );

  const hasUserModelsRaw = useQuery(
    api.userModels.hasUserModels,
    userRecord && !userRecord.isAnonymous ? {} : "skip"
  );

  // Read cached value once on mount using useState initializer for stability
  const [initialCachedValue] = useState(() => {
    return get(CACHE_KEYS.userData, null) as UserDataProviderValue | null;
  });
  const hasCachedData = initialCachedValue && !initialCachedValue.isLoading;

  // JIT user creation: when Convex auth validates (Clerk JWT) but no user
  // record exists yet, call ensureUser to create/link the user document.
  // The reactive query will then pick up the new record automatically.
  useEffect(() => {
    if (
      isConvexAuthenticated &&
      userRecord === null &&
      !ensuringUserRef.current
    ) {
      ensuringUserRef.current = true;
      ensureUser()
        .catch(err => {
          console.error("[UserData] ensureUser failed:", err);
        })
        .finally(() => {
          ensuringUserRef.current = false;
        });
    }
  }, [isConvexAuthenticated, userRecord, ensureUser]);

  const authState = useMemo<AuthState>(() => {
    // undefined = query still loading
    if (userRecord === undefined) {
      return "initializing";
    }
    // null = query loaded but no user record; if Convex auth validated,
    // ensureUser is in flight — keep showing loading state
    if (userRecord === null) {
      if (isConvexAuthenticated) {
        return "initializing";
      }
      return "anonymous";
    }
    if (userRecord.isAnonymous) {
      return "anonymous";
    }
    return "authenticated";
  }, [userRecord, isConvexAuthenticated]);

  const isLoading = !hasCachedData && authState === "initializing";

  const apiKeysData = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];
  const hasUserApiKeysRaw = apiKeysData.length > 0;

  const hasUserApiKeysFromCache = initialCachedValue?.hasUserApiKeys ?? false;
  const hasUserModelsFromCache = initialCachedValue?.hasUserModels ?? false;

  const hasUserApiKeys = useMemo(
    () => hasUserApiKeysRaw || hasUserApiKeysFromCache,
    [hasUserApiKeysRaw, hasUserApiKeysFromCache]
  );

  const hasUserModels = useMemo(
    () => hasUserModelsRaw || hasUserModelsFromCache,
    [hasUserModelsFromCache, hasUserModelsRaw]
  );

  // Determine when capability data (api keys/models) is reliable for UI gating.
  const capabilitiesReady = useMemo(() => {
    if (userRecord?.isAnonymous) {
      return true;
    }
    const apiKeysResolved = apiKeysRaw !== undefined;
    const modelsResolved = hasUserModelsRaw !== undefined;
    return apiKeysResolved && modelsResolved;
  }, [userRecord?.isAnonymous, apiKeysRaw, hasUserModelsRaw]);

  // Handle anonymous user graduation when Clerk user signs in
  useEffect(() => {
    if (authState !== "authenticated" || !userRecord || isGraduating) {
      return;
    }

    const storedAnonToken = get(CACHE_KEYS.anonymousGraduationToken, null) as
      | string
      | null;

    if (!storedAnonToken) {
      return;
    }

    const handleGraduation = async () => {
      setIsGraduating(true);
      try {
        const result = await graduateAnonymousUser({
          anonymousToken: storedAnonToken,
        });

        set(CACHE_KEYS.anonymousGraduationToken, null);
        set(CACHE_KEYS.anonymousUserGraduation, null);

        if (result && result.conversationsTransferred > 0) {
          managedToast.success("Welcome back!", {
            description: "Your anonymous conversations have been preserved.",
          });
        }
      } catch (_error) {
        set(CACHE_KEYS.anonymousGraduationToken, null);
        set(CACHE_KEYS.anonymousUserGraduation, null);
        managedToast.error("Failed to preserve conversations", {
          description: "Your conversations may not have been transferred.",
        });
      } finally {
        setIsGraduating(false);
      }
    };

    handleGraduation();
  }, [
    authState,
    userRecord,
    graduateAnonymousUser,
    isGraduating,
    managedToast.success,
    managedToast.error,
  ]);

  const combinedValue = useMemo(() => {
    // Priority 1: Use fresh data from Convex query
    if (userRecord) {
      const monthlyMessagesSent = userRecord.monthlyMessagesSent ?? 0;
      return {
        ...buildUserData(
          userRecord,
          hasUserApiKeys,
          hasUserModels,
          monthlyMessagesSent
        ),
        capabilitiesReady,
        user: userRecord,
        apiKeys: apiKeysData,
      };
    }

    // Priority 2: Use cached data while waiting for query (instant UI)
    if (initialCachedValue?.user) {
      return {
        ...initialCachedValue,
        user: initialCachedValue.user,
        apiKeys: initialCachedValue.apiKeys ?? [],
        isLoading: false,
      };
    }

    // Priority 3: Show loading state (no cache, waiting for query)
    if (isLoading) {
      return {
        ...DEFAULT_USER_DATA,
        isLoading: true,
        user: null,
        apiKeys: [],
      };
    }

    // Priority 4: No data available
    return {
      ...DEFAULT_USER_DATA,
      user: null,
      apiKeys: [],
    };
  }, [
    userRecord,
    initialCachedValue,
    hasUserApiKeys,
    hasUserModels,
    isLoading,
    capabilitiesReady,
    apiKeysData,
  ]);

  // Debounce cache write to avoid synchronous storage churn
  const cacheWriteTimeout = useRef<number | null>(null);
  const lastCachedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!combinedValue?.user) {
      return;
    }
    const currentUserId = String(combinedValue.user._id);
    if (currentUserId === lastCachedUserIdRef.current) {
      return;
    }
    if (cacheWriteTimeout.current) {
      clearTimeout(cacheWriteTimeout.current);
    }
    cacheWriteTimeout.current = window.setTimeout(() => {
      set(CACHE_KEYS.userData, combinedValue);
      lastCachedUserIdRef.current = currentUserId;
    }, 50);
    return () => {
      if (cacheWriteTimeout.current) {
        clearTimeout(cacheWriteTimeout.current);
      }
    };
  }, [combinedValue]);

  // Derived split values with stable memos
  const identityValue = useMemo<UserIdentity>(() => {
    return {
      user: combinedValue.user,
      isAuthenticated: combinedValue.isAuthenticated,
      isLoading: combinedValue.isLoading,
    };
  }, [
    combinedValue.user,
    combinedValue.isAuthenticated,
    combinedValue.isLoading,
  ]);

  const capabilitiesValue = useMemo<UserCapabilities>(() => {
    return {
      canSendMessage: combinedValue.canSendMessage,
      hasUserApiKeys: combinedValue.hasUserApiKeys,
      hasUserModels: combinedValue.hasUserModels,
    };
  }, [
    combinedValue.canSendMessage,
    combinedValue.hasUserApiKeys,
    combinedValue.hasUserModels,
  ]);

  const usageValue = useMemo<UserUsage>(() => {
    return {
      hasMessageLimit: combinedValue.hasMessageLimit,
      hasUnlimitedCalls: combinedValue.hasUnlimitedCalls,
      monthlyUsage: combinedValue.monthlyUsage,
    };
  }, [
    combinedValue.hasMessageLimit,
    combinedValue.hasUnlimitedCalls,
    combinedValue.monthlyUsage,
  ]);

  return (
    <UserIdentityContext.Provider value={identityValue}>
      <UserCapabilitiesContext.Provider value={capabilitiesValue}>
        <UserUsageContext.Provider value={usageValue}>
          <UserDataContext.Provider value={combinedValue}>
            {children}
          </UserDataContext.Provider>
        </UserUsageContext.Provider>
      </UserCapabilitiesContext.Provider>
    </UserIdentityContext.Provider>
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

export function useUserIdentity(): UserIdentity {
  const ctx = useContext(UserIdentityContext);
  if (!ctx) {
    throw new Error("useUserIdentity must be used within a UserDataProvider");
  }
  return ctx;
}

export function useUserCapabilities(): UserCapabilities {
  const ctx = useContext(UserCapabilitiesContext);
  if (!ctx) {
    throw new Error(
      "useUserCapabilities must be used within a UserDataProvider"
    );
  }
  return ctx;
}

export function useUserUsage(): UserUsage {
  const ctx = useContext(UserUsageContext);
  if (!ctx) {
    throw new Error("useUserUsage must be used within a UserDataProvider");
  }
  return ctx;
}
