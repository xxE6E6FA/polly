import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ListLoadingStateProps {
  count?: number;
  height?: string;
  className?: string;
}

export function ListLoadingState({
  count = 6,
  height = "h-16",
  className,
}: ListLoadingStateProps) {
  return (
    <div className={cn("stack-lg", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
          key={`skeleton-${i}`}
          className={cn(height, "w-full")}
        />
      ))}
    </div>
  );
}
