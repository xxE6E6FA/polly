import React, { createContext, useContext } from "react";
import { useUserData } from "../hooks/use-user";
import type { User } from "../types";

interface UserContextType {
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
}

const UserContext = createContext<UserContextType | null>(null);

interface UserProviderProps {
  children: React.ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  // Call useUser hook only once at the provider level
  const userData = useUserData();

  return (
    <UserContext.Provider value={userData}>{children}</UserContext.Provider>
  );
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

export { UserContext };
