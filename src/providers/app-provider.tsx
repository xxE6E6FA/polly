import React from "react";
import { ConvexProvider } from "./convex-provider";
import { ThemeProvider } from "./theme-provider";
import { UserProvider } from "./user-provider";
import { QueryProvider } from "./query-provider";
import { SidebarProvider } from "./sidebar-provider";
import { ThinkingProvider } from "./thinking-provider";
import { ErrorBoundary } from "../components/ui/error-boundary";

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  return (
    <ErrorBoundary>
      <ConvexProvider>
        <QueryProvider>
          <ThemeProvider>
            <UserProvider>
              <SidebarProvider>
                <ThinkingProvider>{children}</ThinkingProvider>
              </SidebarProvider>
            </UserProvider>
          </ThemeProvider>
        </QueryProvider>
      </ConvexProvider>
    </ErrorBoundary>
  );
}
