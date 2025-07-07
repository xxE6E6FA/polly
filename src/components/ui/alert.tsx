import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        success:
          "border-success-border bg-success-bg text-success [&>svg]:text-success",
        warning:
          "border-warning-border bg-warning-bg text-warning-foreground [&>svg]:text-warning-foreground",
        info: "border-info-border bg-info-bg text-info [&>svg]:text-info",
        danger:
          "border-danger-border bg-danger-bg text-danger [&>svg]:text-danger",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(alertVariants({ variant }), className)}
    role="alert"
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

// Helper component to automatically include the appropriate icon
const AlertIcon = ({
  variant,
}: {
  variant?: VariantProps<typeof alertVariants>["variant"];
}) => {
  switch (variant) {
    case "success":
      return <CheckCircleIcon className="h-4 w-4" />;
    case "warning":
      return <WarningIcon className="h-4 w-4" />;
    case "info":
      return <InfoIcon className="h-4 w-4" />;
    case "danger":
    case "destructive":
      return <XCircleIcon className="h-4 w-4" />;
    default:
      return <InfoIcon className="h-4 w-4" />;
  }
};

export { Alert, AlertDescription, AlertIcon, AlertTitle, alertVariants };
