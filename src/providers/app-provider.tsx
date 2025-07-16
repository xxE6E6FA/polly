import type React from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PrivateModeProvider } from "@/contexts/private-mode-context";
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
          <PrivateModeProvider>{children}</PrivateModeProvider>
        </UIProvider>
      </ConvexProvider>
    </ErrorBoundary>
  );
};
