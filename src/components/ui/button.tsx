import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-hover",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        action: "btn-action",
        link: "text-primary underline-offset-4 hover:underline",
        tropical:
          "bg-gradient-tropical text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300",
        // Semantic variants
        primary:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover",
        success:
          "bg-success text-success-foreground shadow-md hover:bg-success-hover hover:shadow-lg transition-all duration-200",
        warning:
          "bg-warning text-warning-foreground shadow-md hover:bg-warning-hover hover:shadow-lg transition-all duration-200",
        info: "bg-info text-info-foreground shadow-md hover:bg-info-hover hover:shadow-lg transition-all duration-200",
        danger:
          "bg-danger text-danger-foreground shadow-md hover:bg-danger-hover hover:shadow-lg transition-all duration-200",
        // Legacy accent color variants (for backward compatibility)
        coral:
          "bg-primary text-primary-foreground shadow-md hover:bg-primary-hover hover:shadow-lg transition-all duration-200",
        emerald:
          "bg-success text-success-foreground shadow-md hover:bg-success-hover hover:shadow-lg hover:scale-105 transition-all duration-300",
        yellow:
          "bg-warning text-warning-foreground shadow-md hover:bg-warning-hover hover:shadow-lg transition-all duration-200",
        purple:
          "bg-[hsl(260_85%_60%)] text-white dark:text-white shadow-md hover:bg-[hsl(260_85%_55%)] hover:shadow-lg transition-all duration-200",
        blue: "bg-secondary text-secondary-foreground shadow-md hover:bg-secondary-hover hover:shadow-lg hover:scale-105 transition-all duration-300",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-caption",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 p-0",
        full: "h-9 px-4 py-2 w-full",
        "full-lg": "h-10 px-8 w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
