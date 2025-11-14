import { cn } from "@/lib/utils";

interface ListHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function ListHeader({ children, className }: ListHeaderProps) {
  return (
    <div className={cn("bg-muted/50 border-b", className)}>
      <div className="flex items-center p-4">{children}</div>
    </div>
  );
}
