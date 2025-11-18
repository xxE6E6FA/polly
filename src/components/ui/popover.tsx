import { Popover } from "@base-ui-components/react/popover";
import * as React from "react";

import { cn } from "@/lib/utils";

const PopoverRoot = Popover.Root;

const PopoverTrigger = Popover.Trigger;

const PopoverPortal = Popover.Portal;

type PopoverContentProps = React.ComponentPropsWithoutRef<
  typeof Popover.Popup
> & {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  // Legacy Radix props - accepted but ignored for Base UI compatibility
  forceMount?: boolean;
  avoidCollisions?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
};

const popoverContentBaseClasses =
  "z-[80] w-72 rounded-md border border-border bg-popover text-foreground shadow-lg outline-none transition-[background-color,border-color,color,box-shadow,opacity] duration-200 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0";

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof Popover.Popup>,
  PopoverContentProps
>(
  (
    {
      className,
      align = "center",
      side = "bottom",
      sideOffset = 4,
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
      <Popover.Positioner side={side} align={align} sideOffset={sideOffset}>
        <Popover.Popup
          ref={ref}
          className={cn(popoverContentBaseClasses, className)}
          {...props}
        />
      </Popover.Positioner>
    </PopoverPortal>
  )
);
PopoverContent.displayName = "PopoverContent";

export { PopoverRoot as Popover, PopoverTrigger, PopoverContent };
