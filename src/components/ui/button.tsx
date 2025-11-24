import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium cursor-pointer transition-colors transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[.98] active:shadow-sm",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover focus-visible:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:bg-destructive/90",
        outline:
          "border border-input-border bg-background shadow-sm hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-hover focus-visible:bg-secondary-hover",
        ghost:
          "hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
        action: "btn-action",
        link: "text-primary underline-offset-4 hover:underline focus-visible:underline",
        tropical:
          "bg-gradient-tropical text-white shadow-lg transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl focus-visible:scale-105 focus-visible:shadow-xl",
        // Semantic variants
        primary:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover focus-visible:bg-primary-hover",
        success:
          "bg-success text-success-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-success-hover hover:shadow-lg focus-visible:bg-success-hover focus-visible:shadow-lg",
        warning:
          "bg-warning text-warning-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-warning-hover hover:shadow-lg focus-visible:bg-warning-hover focus-visible:shadow-lg",
        info: "bg-info text-info-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-info-hover hover:shadow-lg focus-visible:bg-info-hover focus-visible:shadow-lg",
        danger:
          "bg-danger text-danger-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-danger-hover hover:shadow-lg focus-visible:bg-danger-hover focus-visible:shadow-lg",
        purple:
          "bg-accent-purple text-primary-foreground shadow-md transition-all duration-200 ease-in-out hover:bg-accent-purple/90 hover:shadow-lg focus-visible:bg-accent-purple/90 focus-visible:shadow-lg",
        "chat-input":
          "dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted",
        "chat-trigger":
          "bg-muted/60 text-foreground hover:bg-muted focus-visible:bg-muted",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-md",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-5",
        icon: "h-9 w-9 rounded-md",
        "icon-sm": "h-8 w-8 p-0 rounded-md",
        "icon-pill": "h-8 w-8 p-0 rounded-full",
        pill: "h-8 w-auto gap-2 px-2.5 text-xs rounded-full",
        full: "h-9 w-full px-4 py-2 rounded-md",
        "full-lg": "h-10 w-full px-5 rounded-md",
      },
      rounded: {
        true: "rounded-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      rounded: false,
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
