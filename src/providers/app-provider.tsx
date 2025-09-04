import type React from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BatchSelectionProvider } from "@/providers/batch-selection-context";
import { PrivateModeProvider } from "@/providers/private-mode-context";
import { SidebarWidthProvider } from "@/providers/sidebar-width-context";
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
          <TooltipProvider
            delayDuration={200}
            skipDelayDuration={400}
            disableHoverableContent
          >
            <ToastProvider>
              <UserDataProvider>
                <BatchSelectionProvider>
                  <PrivateModeProvider>
                    <SidebarWidthProvider>{children}</SidebarWidthProvider>
                  </PrivateModeProvider>
                </BatchSelectionProvider>
              </UserDataProvider>
            </ToastProvider>
          </TooltipProvider>
        </UIProvider>
      </ConvexProvider>
    </ErrorBoundary>
  );
};
