import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const pickerTriggerVariants = cva(
  [
    // Base styles
    "inline-flex items-center justify-center gap-1.5",
    "whitespace-nowrap font-medium transition-all duration-200 ease-in-out",
    "cursor-pointer select-none",
    // Focus states
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    // Disabled state
    "disabled:pointer-events-none disabled:opacity-50",
    // Active press effect
    "active:scale-[0.97]",
    // SVG styling
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // Default: Subtle background with clear border - stands out without being too prominent
        default: [
          "border border-border/60 bg-muted/80 text-foreground/90",
          "hover:bg-muted hover:border-border hover:text-foreground",
          "shadow-sm hover:shadow",
        ],
        // Active: Primary accent for currently selected/active states
        active: [
          "border border-primary/40 bg-primary/10 text-primary",
          "hover:bg-primary/15 hover:border-primary/50",
          "shadow-sm shadow-primary/10 hover:shadow-primary/20",
        ],
        // Ghost: Minimal styling, blends in more
        ghost: [
          "border border-transparent bg-transparent text-muted-foreground",
          "hover:bg-muted/60 hover:text-foreground hover:border-border/40",
        ],
        // Accent: For highlighting important pickers (model picker)
        accent: [
          "border border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 text-foreground/90",
          "hover:from-primary/15 hover:to-primary/10 hover:border-primary/40",
          "shadow-sm hover:shadow",
        ],
      },
      size: {
        // Pill: Standard picker size (desktop)
        pill: "h-8 px-2.5 text-xs rounded-full [&_svg]:h-3.5 [&_svg]:w-3.5",
        // Icon: Mobile size - circular
        icon: "h-8 w-8 rounded-full p-0 [&_svg]:h-4 [&_svg]:w-4",
        // Small pill for compact contexts
        sm: "h-7 px-2 text-xs rounded-full [&_svg]:h-3 [&_svg]:w-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "pill",
    },
  }
);

export interface PickerTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof pickerTriggerVariants> {
  /** Show an indicator dot for active/modified state */
  showIndicator?: boolean;
  /** Custom indicator color class */
  indicatorClassName?: string;
}

const PickerTrigger = React.forwardRef<HTMLButtonElement, PickerTriggerProps>(
  (
    {
      className,
      variant,
      size,
      showIndicator = false,
      indicatorClassName,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        type="button"
        ref={ref}
        className={cn(
          pickerTriggerVariants({ variant, size }),
          showIndicator && "relative",
          className
        )}
        {...props}
      >
        {children}
        {showIndicator && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary",
              "ring-2 ring-background",
              indicatorClassName
            )}
            aria-hidden="true"
          />
        )}
      </button>
    );
  }
);

PickerTrigger.displayName = "PickerTrigger";

export { PickerTrigger, pickerTriggerVariants };
