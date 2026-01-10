import { Popover } from "@base-ui/react/popover";
import type * as React from "react";

import { cn } from "@/lib/utils";

const PopoverRoot = Popover.Root;

const PopoverTrigger = Popover.Trigger;

const PopoverPortal = Popover.Portal;

const PopoverPositioner = Popover.Positioner;

type PopoverPopupProps = React.ComponentPropsWithoutRef<
  typeof Popover.Popup
> & {
  rounded?: boolean;
  ref?: React.Ref<React.ComponentRef<typeof Popover.Popup>>;
};

function PopoverPopup({
  className,
  rounded = false,
  ref,
  ...props
}: PopoverPopupProps) {
  return (
    <Popover.Popup
      ref={ref}
      className={cn(
        "w-72 border bg-popover text-popover-foreground shadow-md outline-none",
        "data-[starting-style]:animate-in data-[ending-style]:animate-out",
        "data-[ending-style]:fade-out-0 data-[starting-style]:fade-in-0",
        "data-[ending-style]:zoom-out-95 data-[starting-style]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  );
}

const PopoverArrow = Popover.Arrow;

const PopoverBackdrop = Popover.Backdrop;

type PopoverTitleProps = React.ComponentPropsWithoutRef<
  typeof Popover.Title
> & {
  ref?: React.Ref<React.ComponentRef<typeof Popover.Title>>;
};

function PopoverTitle({ className, ref, ...props }: PopoverTitleProps) {
  return (
    <Popover.Title
      ref={ref}
      className={cn("text-base font-medium", className)}
      {...props}
    />
  );
}

type PopoverDescriptionProps = React.ComponentPropsWithoutRef<
  typeof Popover.Description
> & {
  ref?: React.Ref<React.ComponentRef<typeof Popover.Description>>;
};

function PopoverDescription({
  className,
  ref,
  ...props
}: PopoverDescriptionProps) {
  return (
    <Popover.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

const PopoverClose = Popover.Close;

// Compatibility layer for existing code that uses PopoverContent
type PopoverContentProps = React.ComponentPropsWithoutRef<
  typeof Popover.Popup
> & {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
  rounded?: boolean;
  ref?: React.Ref<React.ComponentRef<typeof Popover.Popup>>;
};

function PopoverContent({
  side = "bottom",
  align = "center",
  sideOffset = 4,
  alignOffset = 0,
  className,
  rounded = false,
  ref,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPortal>
      <PopoverPositioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-popover"
      >
        <PopoverPopup
          ref={ref}
          className={className}
          rounded={rounded}
          {...props}
        />
      </PopoverPositioner>
    </PopoverPortal>
  );
}

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
