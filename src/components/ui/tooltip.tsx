"use client";

import * as TooltipPrimitive from "@base-ui-components/react/tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

const TooltipProvider: React.FC<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Tooltip.Provider> & {
    delayDuration?: number;
    skipDelayDuration?: number;
    disableHoverableContent?: boolean;
  }
> = ({
  delayDuration,
  skipDelayDuration,
  disableHoverableContent,
  children,
  ...props
}) => (
  <TooltipPrimitive.Tooltip.Provider
    delay={delayDuration ?? 600}
    timeout={skipDelayDuration ?? 400}
    {...props}
  >
    {children}
  </TooltipPrimitive.Tooltip.Provider>
);
TooltipProvider.displayName = "TooltipProvider";

const Tooltip = TooltipPrimitive.Tooltip.Root;

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Tooltip.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Tooltip.Trigger>
>((props, ref) => <TooltipPrimitive.Tooltip.Trigger ref={ref} {...props} />);
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Tooltip.Popup>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Tooltip.Positioner> & {
    children?: React.ReactNode;
  }
>(({ className, side = "top", sideOffset = 4, children, ...props }, ref) => (
  <TooltipPrimitive.Tooltip.Portal>
    <TooltipPrimitive.Tooltip.Positioner
      side={side}
      sideOffset={sideOffset}
      className="z-tooltip"
      {...props}
    >
      <TooltipPrimitive.Tooltip.Popup
        ref={ref}
        className={cn(
          "overflow-hidden rounded-md border bg-popover px-2.5 py-1.5 text-xs text-foreground shadow-md",
          "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
          "data-[ending-style]:opacity-0 data-[ending-style]:scale-95",
          "transition-[opacity,transform] duration-200 origin-[var(--transform-origin)]",
          className
        )}
      >
        {children}
      </TooltipPrimitive.Tooltip.Popup>
    </TooltipPrimitive.Tooltip.Positioner>
  </TooltipPrimitive.Tooltip.Portal>
));
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
