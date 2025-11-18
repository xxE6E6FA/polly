import { Popover } from "@base-ui-components/react/popover";
import * as React from "react";

import { cn } from "@/lib/utils";

const PopoverRoot = Popover.Root;

const PopoverTrigger = Popover.Trigger;

const PopoverPortal = Popover.Portal;

const PopoverPositioner = Popover.Positioner;

const PopoverPopup = React.forwardRef<
  React.ElementRef<typeof Popover.Popup>,
  React.ComponentPropsWithoutRef<typeof Popover.Popup>
>(({ className, ...props }, ref) => (
  <Popover.Popup
    ref={ref}
    className={cn(
      "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none",
      "data-[starting-style]:animate-in data-[ending-style]:animate-out",
      "data-[ending-style]:fade-out-0 data-[starting-style]:fade-in-0",
      "data-[ending-style]:zoom-out-95 data-[starting-style]:zoom-in-95",
      "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
      "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
));
PopoverPopup.displayName = "PopoverPopup";

const PopoverArrow = Popover.Arrow;

const PopoverBackdrop = Popover.Backdrop;

const PopoverTitle = React.forwardRef<
  React.ElementRef<typeof Popover.Title>,
  React.ComponentPropsWithoutRef<typeof Popover.Title>
>(({ className, ...props }, ref) => (
  <Popover.Title
    ref={ref}
    className={cn("text-base font-medium", className)}
    {...props}
  />
));
PopoverTitle.displayName = "PopoverTitle";

const PopoverDescription = React.forwardRef<
  React.ElementRef<typeof Popover.Description>,
  React.ComponentPropsWithoutRef<typeof Popover.Description>
>(({ className, ...props }, ref) => (
  <Popover.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
PopoverDescription.displayName = "PopoverDescription";

const PopoverClose = Popover.Close;

// Compatibility layer for existing code that uses PopoverContent
type PopoverContentProps = React.ComponentPropsWithoutRef<
  typeof Popover.Popup
> & {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
  // Legacy Radix props - accepted but ignored for Base UI compatibility
  forceMount?: boolean;
  avoidCollisions?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
};

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof Popover.Popup>,
  PopoverContentProps
>(
  (
    {
      side = "bottom",
      align = "center",
      sideOffset = 4,
      alignOffset = 0,
      // Destructure and ignore legacy Radix props
      forceMount,
      avoidCollisions,
      onOpenAutoFocus,
      onCloseAutoFocus,
      onInteractOutside,
      ...props
    },
    ref
  ) => (
    <PopoverPortal>
      <PopoverPositioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <PopoverPopup ref={ref} {...props} />
      </PopoverPositioner>
    </PopoverPortal>
  )
);
PopoverContent.displayName = "PopoverContent";

export {
  PopoverRoot as Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverPortal,
  PopoverPositioner,
  PopoverPopup,
  PopoverArrow,
  PopoverBackdrop,
  PopoverTitle,
  PopoverDescription,
  PopoverClose,
};
