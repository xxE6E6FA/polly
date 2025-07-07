import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

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
          "bg-gradient-tropical text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl",
        // Semantic variants
        primary:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover",
        success:
          "bg-success text-success-foreground shadow-md transition-all duration-200 hover:bg-success-hover hover:shadow-lg",
        warning:
          "bg-warning text-warning-foreground shadow-md transition-all duration-200 hover:bg-warning-hover hover:shadow-lg",
        info: "bg-info text-info-foreground shadow-md transition-all duration-200 hover:bg-info-hover hover:shadow-lg",
        danger:
          "bg-danger text-danger-foreground shadow-md transition-all duration-200 hover:bg-danger-hover hover:shadow-lg",
        // Legacy accent color variants (for backward compatibility)
        coral:
          "bg-primary text-primary-foreground shadow-md transition-all duration-200 hover:bg-primary-hover hover:shadow-lg",
        emerald:
          "bg-success text-success-foreground shadow-md transition-all duration-300 hover:scale-105 hover:bg-success-hover hover:shadow-lg",
        yellow:
          "bg-warning text-warning-foreground shadow-md transition-all duration-200 hover:bg-warning-hover hover:shadow-lg",
        purple:
          "bg-[hsl(260_85%_60%)] text-white shadow-md transition-all duration-200 hover:bg-[hsl(260_85%_55%)] hover:shadow-lg dark:text-white",
        blue: "bg-secondary text-secondary-foreground shadow-md transition-all duration-300 hover:scale-105 hover:bg-secondary-hover hover:shadow-lg",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-caption",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 p-0",
        full: "h-9 w-full px-4 py-2",
        "full-lg": "h-10 w-full px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonProps = {
  asChild?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
