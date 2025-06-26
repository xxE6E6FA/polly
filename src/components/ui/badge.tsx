import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary-hover",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Semantic variants
        success:
          "border-success-border bg-success-bg text-success hover:bg-success/10",
        warning:
          "border-warning-border bg-warning-bg text-warning-foreground hover:bg-warning/10",
        info: "border-info-border bg-info-bg text-info hover:bg-info/10",
        danger:
          "border-danger-border bg-danger-bg text-danger hover:bg-danger/10",
        // Solid semantic variants
        "success-solid":
          "border-transparent bg-success text-success-foreground hover:bg-success-hover",
        "warning-solid":
          "border-transparent bg-warning text-warning-foreground hover:bg-warning-hover",
        "info-solid":
          "border-transparent bg-info text-info-foreground hover:bg-info-hover",
        "danger-solid":
          "border-transparent bg-danger text-danger-foreground hover:bg-danger-hover",
        // Subtle variants
        "success-subtle":
          "border-transparent bg-success/10 text-success hover:bg-success/20",
        "warning-subtle":
          "border-transparent bg-warning/10 text-warning-foreground hover:bg-warning/20",
        "info-subtle":
          "border-transparent bg-info/10 text-info hover:bg-info/20",
        "danger-subtle":
          "border-transparent bg-danger/10 text-danger hover:bg-danger/20",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "py-0.25 px-2 text-[10px]",
        lg: "px-3 py-1 text-sm",
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
