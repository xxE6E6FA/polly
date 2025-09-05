import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Track
      "group inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-[background-color,border-color] duration-200",
      // Focus + disabled
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      // States
      "data-[state=unchecked]:bg-muted/60 data-[state=unchecked]:border-border",
      "data-[state=checked]:bg-primary data-[state=checked]:border-primary/70",
      // Hover states
      "hover:data-[state=unchecked]:bg-muted",
      "hover:data-[state=checked]:bg-primary-hover hover:data-[state=checked]:border-primary",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Thumb uses token foreground on primary for consistent contrast
        "pointer-events-none block h-4 w-4 rounded-full bg-primary-foreground ring-0",
        // Subtle elevation and motion
        "shadow-sm duration-200 will-change-transform transition-[transform,box-shadow]",
        // Springy easing on toggle + hover/active micro-interactions
        "[transition-timing-function:cubic-bezier(.175,.885,.32,1.275)] group-hover:shadow-md group-active:shadow-sm group-active:scale-95",
        // Positions
        "translate-x-0 group-data-[state=unchecked]:translate-x-0 group-data-[state=checked]:translate-x-4"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
