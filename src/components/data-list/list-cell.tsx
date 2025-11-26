import { cn } from "@/lib/utils";

interface ListCellProps {
  children: React.ReactNode;
  className?: string;
  /**
   * @deprecated Width is now controlled by the grid template. Use className for styling only.
   */
  width?: string;
}

export function ListCell({ children, className }: ListCellProps) {
  return <div className={cn(className)}>{children}</div>;
}
