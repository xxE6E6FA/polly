import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ListContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const ListContainer = forwardRef<HTMLDivElement, ListContainerProps>(
  ({ children, className }, ref) => {
    return (
      <div ref={ref} className={cn("overflow-visible", className)}>
        {children}
      </div>
    );
  }
);

ListContainer.displayName = "ListContainer";
