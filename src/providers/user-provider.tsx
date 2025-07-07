import type React from "react";
import { createContext, useContext } from "react";

import { useUser as useUserHook } from "@/hooks/use-user";

import type { User } from "@/types";

type UserContextType = {
  user: User | null;
  messageCount: number;
  remainingMessages: number;
  isAnonymous: boolean;
  hasMessageLimit: boolean;
  canSendMessage: boolean;
  isLoading: boolean;
  monthlyUsage?: {
    monthlyMessagesSent: number;
    monthlyLimit: number;
    remainingMessages: number;
    resetDate: number | null | undefined;
    needsReset: boolean;
  };
  hasUserApiKeys?: boolean;
  hasUnlimitedCalls?: boolean;
};

const UserContext = createContext<UserContextType | null>(null);

type UserProviderProps = {
  children: React.ReactNode;
};

export const UserProvider = ({ children }: UserProviderProps) => {
  // Call useUser hook only once at the provider level
  const userData = useUserHook();

  return (
    <UserContext.Provider value={userData}>{children}</UserContext.Provider>
  );
};

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

export { UserContext };
