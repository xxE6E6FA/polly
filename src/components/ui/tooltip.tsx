"use client";

import * as TooltipPrimitive from "@base-ui-components/react/tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Tooltip.Provider;

const TooltipRoot = TooltipPrimitive.Tooltip.Root;

const TooltipTrigger = TooltipPrimitive.Tooltip.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Tooltip.Positioner>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Tooltip.Positioner>
>(({ className, side = "top", sideOffset = 4, children, ...props }, ref) => (
  <TooltipPrimitive.Tooltip.Portal>
    <TooltipPrimitive.Tooltip.Positioner
      ref={ref}
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "z-[90] overflow-hidden rounded-md bg-popover px-2.5 py-1.5 text-xs text-foreground shadow-sm data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[var(--transform-origin)]",
        className
      )}
      {...props}
    >
      <TooltipPrimitive.Tooltip.Popup>
        {children}
      </TooltipPrimitive.Tooltip.Popup>
    </TooltipPrimitive.Tooltip.Positioner>
  </TooltipPrimitive.Tooltip.Portal>
));
TooltipContent.displayName = "TooltipContent";

// Export with original names for backward compatibility
export {
  TooltipRoot as Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
};
