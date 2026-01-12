"use client";

import * as TooltipPrimitive from "@base-ui/react/tooltip";
import type * as React from "react";

import { cn } from "@/lib/utils";

type TooltipProviderProps = React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Tooltip.Provider
> & {
  delayDuration?: number;
  skipDelayDuration?: number;
  disableHoverableContent?: boolean;
};

function TooltipProvider({
  delayDuration,
  skipDelayDuration,
  disableHoverableContent,
  children,
  ...props
}: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Tooltip.Provider
      delay={delayDuration ?? 600}
      timeout={skipDelayDuration ?? 400}
      {...props}
    >
      {children}
    </TooltipPrimitive.Tooltip.Provider>
  );
}

const Tooltip = TooltipPrimitive.Tooltip.Root;

type TooltipTriggerProps = React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Tooltip.Trigger
> & {
  ref?: React.Ref<React.ComponentRef<typeof TooltipPrimitive.Tooltip.Trigger>>;
  /**
   * Override the provider's delay duration for this specific trigger.
   *
   * Recommended values:
   * - Quick actions (icon buttons, copy buttons): 200ms
   * - Explanatory tooltips: 600ms (default)
   *
   * @example
   * <TooltipTrigger delayDuration={200}>
   *   <IconButton />
   * </TooltipTrigger>
   */
  delayDuration?: number;
};

function TooltipTrigger({ ref, delayDuration, ...props }: TooltipTriggerProps) {
  return (
    <TooltipPrimitive.Tooltip.Trigger
      ref={ref}
      delay={delayDuration}
      {...props}
    />
  );
}

type TooltipContentProps = React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Tooltip.Positioner
> & {
  children?: React.ReactNode;
  ref?: React.Ref<React.ComponentRef<typeof TooltipPrimitive.Tooltip.Popup>>;
};

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  children,
  ref,
  ...props
}: TooltipContentProps) {
  return (
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
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
