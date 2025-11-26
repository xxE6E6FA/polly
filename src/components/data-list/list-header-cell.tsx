import { cn } from "@/lib/utils";

interface ListHeaderCellProps {
  children: React.ReactNode;
  className?: string;
  /**
   * @deprecated Width is now controlled by the grid template. Use className for styling only.
   */
  width?: string;
}

export function ListHeaderCell({ children, className }: ListHeaderCellProps) {
  return <div className={cn("text-sm font-medium", className)}>{children}</div>;
}
