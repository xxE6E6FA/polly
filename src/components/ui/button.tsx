import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors transition-[background-color,border-color,color,box-shadow,transform] duration-normal ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[.98] active:shadow-sm",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover focus-visible:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-hover focus-visible:bg-secondary-hover",
        ghost:
          "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        action: "btn-action",
        link: "text-primary underline-offset-4 hover:underline focus-visible:underline",
        tropical:
          "bg-gradient-tropical text-white shadow-lg transition-all duration-normal ease-standard hover:scale-105 hover:shadow-xl focus-visible:scale-105 focus-visible:shadow-xl",
        // Semantic variants
        primary:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover focus-visible:bg-primary-hover",
        success:
          "bg-success text-success-foreground shadow-md transition-all duration-normal ease-standard hover:bg-success-hover hover:shadow-lg focus-visible:bg-success-hover focus-visible:shadow-lg",
        warning:
          "bg-warning text-warning-foreground shadow-md transition-all duration-normal ease-standard hover:bg-warning-hover hover:shadow-lg focus-visible:bg-warning-hover focus-visible:shadow-lg",
        info: "bg-info text-info-foreground shadow-md transition-all duration-normal ease-standard hover:bg-info-hover hover:shadow-lg focus-visible:bg-info-hover focus-visible:shadow-lg",
        danger:
          "bg-danger text-danger-foreground shadow-md transition-all duration-normal ease-standard hover:bg-danger-hover hover:shadow-lg focus-visible:bg-danger-hover focus-visible:shadow-lg",
        purple:
          "bg-accent-purple text-primary-foreground shadow-md transition-all duration-normal ease-standard hover:bg-accent-purple/90 hover:shadow-lg focus-visible:bg-accent-purple/90 focus-visible:shadow-lg",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-5",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 p-0",
        full: "h-9 w-full px-4 py-2",
        "full-lg": "h-10 w-full px-5",
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
