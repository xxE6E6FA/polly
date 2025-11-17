import { forwardRef } from "react";

import { cn } from "@/lib/utils";

type BackdropProps = {
  variant?: "default" | "heavy";
  blur?: "sm" | "md" | "lg";
} & React.HTMLAttributes<HTMLDivElement>;

export const Backdrop = forwardRef<HTMLDivElement, BackdropProps>(
  ({ className, variant = "default", blur = "sm", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "fixed inset-0",
          // Base colors - use theme variables
          variant === "default"
            ? "bg-foreground/20 dark:bg-foreground/10"
            : "bg-foreground/80",
          // Blur effect
          blur === "sm" && "backdrop-blur-sm",
          blur === "md" && "backdrop-blur-md",
          blur === "lg" && "backdrop-blur-lg",
          // Animations
          "transition-all duration-300 ease-out",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className
        )}
        {...props}
      />
    );
  }
);

Backdrop.displayName = "Backdrop";
