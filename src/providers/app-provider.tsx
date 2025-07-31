import type React from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { BatchSelectionProvider } from "@/providers/batch-selection-context";
import { PrivateModeProvider } from "@/providers/private-mode-context";
import { ToastProvider } from "@/providers/toast-context";
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
          <ToastProvider>
            <UserDataProvider>
              <BatchSelectionProvider>
                <PrivateModeProvider>{children}</PrivateModeProvider>
              </BatchSelectionProvider>
            </UserDataProvider>
          </ToastProvider>
        </UIProvider>
      </ConvexProvider>
    </ErrorBoundary>
  );
};
