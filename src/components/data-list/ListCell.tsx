import { cn } from "@/lib/utils";

interface ListCellProps {
  children: React.ReactNode;
  className?: string;
  width?: string;
}

export function ListCell({ children, className, width }: ListCellProps) {
  return <div className={cn(width, className)}>{children}</div>;
}
