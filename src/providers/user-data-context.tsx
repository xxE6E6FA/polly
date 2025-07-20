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
import { useLocation } from "react-router";
import { toast } from "sonner";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { isApiKeysArray } from "@/lib/type-guards";

type AuthState =
  | "initializing"
  | "anonymous"
  | "authenticated"
  | "transitioning";

interface MonthlyUsage {
  monthlyLimit: number;
  monthlyMessagesSent: number;
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
}

type UserDataProviderValue = UserData & {
  user: Doc<"users"> | null;
};

const UserDataContext = createContext<UserDataProviderValue | undefined>(
  undefined
);

const DEFAULT_USER_DATA: UserData = {
  canSendMessage: false,
  hasMessageLimit: true,
  hasUnlimitedCalls: false,
  monthlyUsage: undefined,
  hasUserApiKeys: false,
  hasUserModels: false,
  isAuthenticated: false,
  isLoading: false,
};

function buildUserData(
  user: Doc<"users">,
  hasUserApiKeys: boolean,
  hasUserModels: boolean
): UserData {
  if (user.isAnonymous) {
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
      hasUserApiKeys,
      hasUserModels,
      isAuthenticated: false,
      isLoading: false,
    };
  }

  const hasUnlimitedCalls = !!user.hasUnlimitedCalls;
  const monthlyLimit = user.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
  const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;
  const remainingMessages = hasUnlimitedCalls
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, monthlyLimit - monthlyMessagesSent);

  const monthlyUsage: MonthlyUsage | undefined = hasUnlimitedCalls
    ? undefined
    : {
        monthlyLimit,
        monthlyMessagesSent,
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
            toast.success("Welcome back!", {
              description: "Your anonymous conversations have been preserved.",
            });
          }
        } catch (error) {
          console.error(
            "[UserDataProvider] Failed to graduate anonymous user:",
            error
          );
          // Clear the stored ID even if graduation failed
          set(CACHE_KEYS.anonymousUserGraduation, null);
          toast.error("Failed to preserve conversations", {
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
      .catch(error => {
        console.error("[UserDataProvider] Anonymous sign-in failed:", error);
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

  const value = useMemo(() => {
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
      ...buildUserData(userRecord, hasUserApiKeys, hasUserModels),
      user: userRecord,
    };

    set(CACHE_KEYS.userData, computedValue);
    return computedValue;
  }, [userRecord, hasUserApiKeys, hasUserModels, isLoading]);

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
