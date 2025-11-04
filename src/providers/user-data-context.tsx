import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import {
  ANONYMOUS_MESSAGE_LIMIT,
  MONTHLY_MESSAGE_LIMIT,
} from "@shared/constants";
import { useMutation, useQuery } from "convex/react";
import type React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useMessageSentCount } from "@/hooks/use-message-sent-count";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { isApiKeysArray } from "@/lib/type-guards";
import { useToast } from "@/providers/toast-context";

type AuthState =
  | "initializing"
  | "anonymous"
  | "authenticated"
  | "transitioning";

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
  const { signIn } = useAuthActions();
  const authToken = useAuthToken();
  const location = useLocation();
  const hasAttemptedSignIn = useRef(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("initializing");
  const [isGraduating, setIsGraduating] = useState(false);
  const graduateAnonymousUser = useMutation(api.users.graduateAnonymousUser);
  const { monthlyMessagesSent } = useMessageSentCount();
  const managedToast = useToast();

  const userRecordRaw = useQuery(api.users.current);
  const userRecord = userRecordRaw;

  const isOAuthCallback = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return (
      searchParams.has("code") ||
      searchParams.has("state") ||
      searchParams.has("error")
    );
  }, [location.search]);

  const apiKeysRaw = useQuery(
    api.apiKeys.getUserApiKeys,
    userRecord && !userRecord.isAnonymous ? {} : "skip"
  );

  const hasUserModelsRaw = useQuery(
    api.userModels.hasUserModels,
    userRecord && !userRecord.isAnonymous ? {} : "skip"
  );

  const cachedValue = get(
    CACHE_KEYS.userData,
    null
  ) as UserDataProviderValue | null;
  const hasCachedData = cachedValue && !cachedValue.isLoading;

  const isLoading =
    !hasCachedData &&
    (authState === "initializing" ||
      authState === "transitioning" ||
      isSigningIn);

  const apiKeysData = isApiKeysArray(apiKeysRaw) ? apiKeysRaw : [];
  const hasUserApiKeysRaw = apiKeysData.length > 0;

  const hasUserApiKeysFromCache = cachedValue?.hasUserApiKeys ?? false;
  const hasUserModelsFromCache = cachedValue?.hasUserModels ?? false;

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
    // Anonymous users don't need capability checks for the checklist
    if (userRecord?.isAnonymous) {
      return true;
    }
    // Authenticated users: wait until both queries resolve to avoid stale cache flashes
    const apiKeysResolved = apiKeysRaw !== undefined;
    const modelsResolved = hasUserModelsRaw !== undefined;
    return apiKeysResolved && modelsResolved;
  }, [userRecord?.isAnonymous, apiKeysRaw, hasUserModelsRaw]);

  // Handle anonymous user graduation
  useEffect(() => {
    const handleUserGraduation = async () => {
      const anonymousUserId = get(CACHE_KEYS.anonymousUserGraduation, null);

      if (
        anonymousUserId &&
        userRecord &&
        !userRecord.isAnonymous &&
        !isGraduating
      ) {
        setIsGraduating(true);

        try {
          // Graduate the anonymous user by transferring their data
          const result = await graduateAnonymousUser({
            anonymousUserId: anonymousUserId as Id<"users">,
            newUserId: userRecord._id,
          });

          // Clear the stored anonymous user ID
          set(CACHE_KEYS.anonymousUserGraduation, null);

          // Only show success toast if there was actually data to graduate
          if (result && result.conversationsTransferred > 0) {
            managedToast.success("Welcome back!", {
              description: "Your anonymous conversations have been preserved.",
            });
          }
        } catch (_error) {
          // Clear the stored ID even if graduation failed
          set(CACHE_KEYS.anonymousUserGraduation, null);
          managedToast.error("Failed to preserve conversations", {
            description: "Your conversations may not have been transferred.",
          });
        } finally {
          setIsGraduating(false);
        }
      }
    };

    // Only handle graduation if this is an OAuth callback and we have a user
    if (isOAuthCallback && userRecord && authState === "authenticated") {
      handleUserGraduation();
    }
  }, [
    userRecord,
    isOAuthCallback,
    graduateAnonymousUser,
    isGraduating,
    authState,
    managedToast.success,
    managedToast.error,
  ]);

  useEffect(() => {
    if (authToken === null && userRecord === null) {
      setAuthState("initializing");
    } else if (authToken !== null && userRecord === null) {
      setAuthState("transitioning");
    } else if (userRecord?.isAnonymous) {
      setAuthState("anonymous");
    } else if (userRecord && !userRecord.isAnonymous) {
      setAuthState("authenticated");
    }
  }, [authToken, userRecord]);

  useEffect(() => {
    const shouldSignInAnonymously =
      authState === "initializing" && authToken === null && userRecord === null;

    if (
      isOAuthCallback ||
      hasAttemptedSignIn.current ||
      isSigningIn ||
      !shouldSignInAnonymously
    ) {
      return;
    }

    hasAttemptedSignIn.current = true;
    setIsSigningIn(true);

    signIn("anonymous")
      .then(result => {
        if (!result.signingIn) {
          hasAttemptedSignIn.current = false;
        }
      })
      .catch(_error => {
        hasAttemptedSignIn.current = false;
      })
      .finally(() => {
        setIsSigningIn(false);
      });
  }, [authState, authToken, userRecord, isOAuthCallback, signIn, isSigningIn]);

  useEffect(() => {
    if (authState === "authenticated" || authState === "anonymous") {
      hasAttemptedSignIn.current = false;

      // Clear anonymous user graduation cache if we're authenticated but not from an OAuth callback
      // This prevents stale graduation attempts for existing users signing in
      if (authState === "authenticated" && !isOAuthCallback) {
        const anonymousUserId = get(CACHE_KEYS.anonymousUserGraduation, null);
        if (anonymousUserId) {
          set(CACHE_KEYS.anonymousUserGraduation, null);
        }
      }
    } else if (authState === "transitioning" || isOAuthCallback) {
      hasAttemptedSignIn.current = true;
    }
  }, [authState, isOAuthCallback]);

  const combinedValue = useMemo(() => {
    if (isLoading) {
      return {
        ...DEFAULT_USER_DATA,
        isLoading: true,
        user: null,
      };
    }

    if (!userRecord) {
      return get(CACHE_KEYS.userData, {
        ...DEFAULT_USER_DATA,
        user: null,
      });
    }

    const computedValue = {
      ...buildUserData(
        userRecord,
        hasUserApiKeys,
        hasUserModels,
        monthlyMessagesSent
      ),
      capabilitiesReady,
      user: userRecord,
    };
    return computedValue;
  }, [
    userRecord,
    hasUserApiKeys,
    hasUserModels,
    isLoading,
    monthlyMessagesSent,
    capabilitiesReady,
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
