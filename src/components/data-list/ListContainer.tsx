import { cn } from "@/lib/utils";

interface ListContainerProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Visual variant for the list container
   * - "contained": Border + rounded corners (default)
   * - "flush": No border, rows extend to edges
   */
  variant?: "contained" | "flush";
}

export function ListContainer({
  children,
  className,
  variant = "contained",
}: ListContainerProps) {
  return (
    <div
      className={cn(
        variant === "contained" && "border rounded-lg overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}
