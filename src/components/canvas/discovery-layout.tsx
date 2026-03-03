import { ListIcon } from "@phosphor-icons/react";
import { PanelLeftIcon } from "@/components/animate-ui/icons/panel-left";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DiscoveryLayoutProps {
  children: React.ReactNode;
  /** When true, header auto-hides and uses translucent overlay style */
  immersive?: boolean;
  /** Whether the header is visible (only applies when immersive) */
  showHeader?: boolean;
  /** Whether the sidebar panel is collapsed */
  isPanelCollapsed?: boolean;
  /** Called to expand the sidebar panel */
  onExpandPanel?: () => void;
}

export function DiscoveryLayout({
  children,
  immersive = false,
  showHeader = true,
  isPanelCollapsed = false,
  onExpandPanel,
}: DiscoveryLayoutProps) {
  return (
    <div className="flex flex-1 flex-col min-w-0">
      {/* Header */}
      {immersive ? (
        isPanelCollapsed &&
        onExpandPanel && (
          <div
            className={cn(
              "fixed top-0 left-0 z-popover pointer-events-none transition-opacity duration-300",
              showHeader ? "opacity-100" : "opacity-0"
            )}
          >
            <div className="py-4 px-3 pl-4">
              {/* Desktop: panel expand icon */}
              <Button
                variant="ghost"
                size="icon-sm"
                title="Expand panel"
                onClick={onExpandPanel}
                className="pointer-events-auto hidden sm:flex"
              >
                <PanelLeftIcon className="size-4" />
              </Button>
              {/* Mobile: menu icon to toggle sidebar overlay */}
              <Button
                variant="ghost"
                size="icon-sm"
                title="Sessions"
                onClick={onExpandPanel}
                className="pointer-events-auto flex sm:hidden"
              >
                <ListIcon className="size-4" weight="bold" />
              </Button>
            </div>
          </div>
        )
      ) : (
        <header className="flex h-16 items-center gap-3 px-4 shrink-0">
          {isPanelCollapsed && onExpandPanel && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Expand panel"
                onClick={onExpandPanel}
                className="hidden sm:flex"
              >
                <PanelLeftIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Sessions"
                onClick={onExpandPanel}
                className="flex sm:hidden"
              >
                <ListIcon className="size-4" weight="bold" />
              </Button>
            </>
          )}
        </header>
      )}

      {children}
    </div>
  );
}
