import { forwardRef } from "react";

import { cn } from "@/lib/utils";

interface BackdropProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Backdrop = forwardRef<HTMLDivElement, BackdropProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "fixed inset-0 bg-background/80 backdrop-blur-sm [animation-duration:200ms] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0",
          className
        )}
        {...props}
      />
    );
  }
);

Backdrop.displayName = "Backdrop";
