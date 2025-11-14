import { cn } from "@/lib/utils";

interface ListContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function ListContainer({ children, className }: ListContainerProps) {
  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {children}
    </div>
  );
}
