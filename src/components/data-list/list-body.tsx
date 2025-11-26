import { cn } from "@/lib/utils";

interface ListBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function ListBody({ children, className }: ListBodyProps) {
  return <div className={cn("divide-y", className)}>{children}</div>;
}
