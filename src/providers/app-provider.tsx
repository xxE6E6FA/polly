import type React from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PrivateModeProvider } from "@/providers/private-mode-context";
import { UserDataProvider } from "@/providers/user-data-context";
import { ConvexProvider } from "./convex-provider";
import { UIProvider } from "./ui-provider";

type AppProviderProps = {
  children: React.ReactNode;
};

export const AppProvider = ({ children }: AppProviderProps) => {
  return (
    <ErrorBoundary>
      <ConvexProvider>
        <UIProvider>
          <UserDataProvider>
            <PrivateModeProvider>{children}</PrivateModeProvider>
          </UserDataProvider>
        </UIProvider>
      </ConvexProvider>
    </ErrorBoundary>
  );
};
