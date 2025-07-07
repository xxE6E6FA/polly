import type React from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PrivateModeProvider } from "@/contexts/private-mode-context";
import { ConvexProvider } from "./convex-provider";
import { QueryProvider } from "./query-provider";
import { SidebarProvider } from "./sidebar-provider";
import { ThemeProvider } from "./theme-provider";
import { ThinkingProvider } from "./thinking-provider";
import { UserProvider } from "./user-provider";

type AppProviderProps = {
  children: React.ReactNode;
};

export const AppProvider = ({ children }: AppProviderProps) => {
  return (
    <ErrorBoundary>
      <ConvexProvider>
        <QueryProvider>
          <ThemeProvider>
            <UserProvider>
              <PrivateModeProvider>
                <SidebarProvider>
                  <ThinkingProvider>{children}</ThinkingProvider>
                </SidebarProvider>
              </PrivateModeProvider>
            </UserProvider>
          </ThemeProvider>
        </QueryProvider>
      </ConvexProvider>
    </ErrorBoundary>
  );
};
