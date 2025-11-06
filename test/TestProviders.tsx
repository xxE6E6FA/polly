import React from "react";
import { MemoryRouter } from "react-router-dom";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BatchSelectionProvider } from "@/providers/batch-selection-context";
import { PrivateModeProvider } from "@/providers/private-mode-context";
import { SidebarWidthProvider } from "@/providers/sidebar-width-context";
import { ToastProvider } from "@/providers/toast-context";
import { UIProvider } from "@/providers/ui-provider";
import type { ReactNode } from "react";

type TestProvidersProps = {
  children: ReactNode;
  withTooltips?: boolean;
};

/**
 * Lightweight provider stack for DOM tests.
 *
 * Notes:
 * - MemoryRouter wraps ErrorBoundary so error states can render Links
 * - Intentionally excludes Convex/Auth providers to keep tests pure
 */
export function TestProviders({ children, withTooltips = false }: TestProvidersProps) {
  const inner = (
    <UIProvider>
      {withTooltips ? (
        <TooltipProvider delayDuration={200} skipDelayDuration={400} disableHoverableContent>
          <ToastProvider>
            <BatchSelectionProvider>
              <PrivateModeProvider>
                <SidebarWidthProvider>{children}</SidebarWidthProvider>
              </PrivateModeProvider>
            </BatchSelectionProvider>
          </ToastProvider>
        </TooltipProvider>
      ) : (
        <ToastProvider>
          <BatchSelectionProvider>
            <PrivateModeProvider>
              <SidebarWidthProvider>{children}</SidebarWidthProvider>
            </PrivateModeProvider>
          </BatchSelectionProvider>
        </ToastProvider>
      )}
    </UIProvider>
  );

  return (
    <MemoryRouter>
      <ErrorBoundary>{inner}</ErrorBoundary>
    </MemoryRouter>
  );
}
