import * as SwitchPrimitives from "@base-ui-components/react/switch";
import * as React from "react";

import { cn } from "@/lib/utils";

const SwitchRoot = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Switch.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Switch.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Switch.Root
    className={cn(
      // Track
      "group inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-[background-color,border-color] duration-200",
      // Focus + disabled
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      // States
      "data-[unchecked]:bg-muted/60 data-[unchecked]:border-border",
      "data-[checked]:bg-primary data-[checked]:border-primary/70",
      // Hover states
      "hover:data-[unchecked]:bg-muted",
      "hover:data-[checked]:bg-primary-hover hover:data-[checked]:border-primary",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Switch.Thumb
      className={cn(
        // Thumb uses token foreground on primary for consistent contrast
        "pointer-events-none block h-4 w-4 rounded-full bg-primary-foreground ring-0",
        // Subtle elevation and motion
        "shadow-sm duration-200 will-change-transform transition-[transform,box-shadow]",
        // Springy easing on toggle + hover/active micro-interactions
        "[transition-timing-function:cubic-bezier(.175,.885,.32,1.275)] group-hover:shadow-md group-active:shadow-sm group-active:scale-95",
        // Positions
        "translate-x-0 group-data-[unchecked]:translate-x-0 group-data-[checked]:translate-x-4"
      )}
    />
  </SwitchPrimitives.Switch.Root>
));
SwitchRoot.displayName = "Switch";

// Export with original name for backward compatibility
export { SwitchRoot as Switch };
