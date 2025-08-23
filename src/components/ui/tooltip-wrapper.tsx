import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TooltipWrapperProps = {
  children: React.ReactElement;
  content?: React.ReactNode;
  open?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
  className?: string;
  disableOnTouch?: boolean;
};

/**
 * A wrapper component that properly handles tooltips with interactive elements like
 * Popover, Dropdown, Select, etc. It prevents the tooltip from showing immediately
 * after closing an interactive element while maintaining keyboard accessibility.
 *
 * Usage:
 * ```tsx
 * <TooltipWrapper content="Click to open menu" open={!dropdownOpen}>
 *   <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
 *     <DropdownMenuTrigger>...</DropdownMenuTrigger>
 *     ...
 *   </DropdownMenu>
 * </TooltipWrapper>
 * ```
 */
export const TooltipWrapper = ({
  children,
  content,
  open,
  side = "top",
  delayDuration = 700,
  className,
  disableOnTouch = true,
}: TooltipWrapperProps) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [hasRecentlyClosedInteractive, setHasRecentlyClosedInteractive] =
    useState(false);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track when the interactive element (dropdown/popover/select) closes
  useEffect(() => {
    if (open === false) {
      // Interactive element just closed
      setHasRecentlyClosedInteractive(true);
      setIsTooltipOpen(false);

      // Clear any existing timer
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }

      // Set a cooldown period before allowing tooltip to show again
      cooldownTimerRef.current = setTimeout(() => {
        setHasRecentlyClosedInteractive(false);
      }, 300); // 300ms cooldown
    }

    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, [open]);

  // If no tooltip content, just render children
  if (!content) {
    return children;
  }

  // Control tooltip visibility
  const tooltipOpen =
    open !== false && !hasRecentlyClosedInteractive && isTooltipOpen;

  return (
    <Tooltip
      open={tooltipOpen}
      onOpenChange={setIsTooltipOpen}
      delayDuration={delayDuration}
      disableOnTouch={disableOnTouch}
    >
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {typeof content === "string" ? <p>{content}</p> : content}
      </TooltipContent>
    </Tooltip>
  );
};
