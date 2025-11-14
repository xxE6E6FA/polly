import { cn } from "@/lib/utils";

interface ListHeaderCellProps {
  children: React.ReactNode;
  className?: string;
  width?: string;
}

export function ListHeaderCell({
  children,
  className,
  width,
}: ListHeaderCellProps) {
  return (
    <div className={cn("text-sm font-medium", width, className)}>
      {children}
    </div>
  );
}
