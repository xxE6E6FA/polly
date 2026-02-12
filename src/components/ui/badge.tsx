import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Badge variants using CVA (class-variance-authority).
 *
 * ## Base Variants
 * @variant default - Primary badge with solid background
 * @variant secondary - Subtle badge with muted background
 * @variant destructive - Red badge for errors/alerts
 * @variant outline - Border-only badge, minimal emphasis
 *
 * ## Semantic Variants (with border + light background)
 * @variant success - Green, for completed/positive status
 * @variant warning - Yellow, for caution/pending status
 * @variant info - Blue, for informational status
 * @variant danger - Red, for error/negative status
 *
 * ## Solid Semantic Variants (full color background)
 * @variant success-solid - Solid green background
 * @variant warning-solid - Solid yellow background
 * @variant info-solid - Solid blue background
 * @variant danger-solid - Solid red background
 *
 * ## Subtle Variants (10% opacity background)
 * @variant success-subtle - Very light green
 * @variant warning-subtle - Very light yellow
 * @variant info-subtle - Very light blue
 * @variant danger-subtle - Very light red
 *
 * @size default - Standard badge size
 * @size sm - Compact badge
 * @size lg - Large badge
 */
const badgeVariants = cva(
  "flex items-center align-middle rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        /** Primary badge with solid background */
        default: "border-transparent bg-primary text-primary-foreground",
        /** Subtle badge with muted background */
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        /** Red badge for errors/alerts */
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        /** Border-only badge, minimal emphasis */
        outline: "text-foreground",
        /** Green with border + light background */
        success: "border-success-border bg-success-bg text-success",
        /** Yellow with border + light background */
        warning: "border-warning-border bg-warning-bg text-warning-foreground",
        /** Blue with border + light background */
        info: "border-info-border bg-info-bg text-info",
        /** Red with border + light background */
        danger: "border-danger-border bg-danger-bg text-danger",
        /** Solid green background */
        "success-solid":
          "border-transparent bg-success text-success-foreground",
        /** Solid yellow background */
        "warning-solid":
          "border-transparent bg-warning text-warning-foreground",
        /** Solid blue background */
        "info-solid": "border-transparent bg-info text-info-foreground",
        /** Solid red background */
        "danger-solid": "border-transparent bg-danger text-danger-foreground",
        /** Very light green (10% opacity) */
        "success-subtle": "border-transparent bg-success/10 text-success",
        /** Very light yellow (10% opacity) */
        "warning-subtle":
          "border-transparent bg-warning/10 text-warning-foreground",
        /** Very light blue (10% opacity) */
        "info-subtle": "border-transparent bg-info/10 text-info",
        /** Very light red (10% opacity) */
        "danger-subtle": "border-transparent bg-danger/10 text-danger",
        /** Status: Free/available - green */
        "status-free":
          "border-success-border bg-success-bg text-success dark:border-success-border dark:bg-success-bg dark:text-success",
        /** Status: Limit reached - orange */
        "status-limit":
          "border-warning-border bg-warning-bg text-warning-foreground",
        /** Status: Unavailable/error - red */
        "status-unavailable": "border-danger-border bg-danger-bg text-danger",
      },
      size: {
        /** Standard badge size */
        default: "px-2.5 py-0.5 gap-2 text-xs",
        /** Extra compact badge for status indicators */
        xs: "h-5 shrink-0 px-1.5 py-0 text-overline",
        /** Compact badge */
        sm: "py-0.25 px-2 gap-1 text-overline",
        /** Large badge */
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

export { Badge };
