import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "flex items-center align-middle rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        // Semantic variants
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning-foreground",
        info: "border-info-border bg-info-bg text-info",
        danger: "border-danger-border bg-danger-bg text-danger",
        // Solid semantic variants
        "success-solid":
          "border-transparent bg-success text-success-foreground",
        "warning-solid":
          "border-transparent bg-warning text-warning-foreground",
        "info-solid": "border-transparent bg-info text-info-foreground",
        "danger-solid": "border-transparent bg-danger text-danger-foreground",
        // Subtle variants
        "success-subtle": "border-transparent bg-success/10 text-success",
        "warning-subtle":
          "border-transparent bg-warning/10 text-warning-foreground",
        "info-subtle": "border-transparent bg-info/10 text-info",
        "danger-subtle": "border-transparent bg-danger/10 text-danger",
      },
      size: {
        default: "px-2.5 py-0.5 gap-2 text-xs",
        sm: "py-0.25 px-2 gap-1 text-[10px]",
        lg: "px-3 py-1 gap-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type BadgeProps = {} & React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

const Badge = ({ className, variant, size, ...props }: BadgeProps) => {
  return (
    <div
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
};

export { Badge, badgeVariants };
