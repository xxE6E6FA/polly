import { cn } from "@/lib/utils";

type SkeletonTextProps = {
  className?: string;
  lines?: number;
  /** When false, skeleton is hidden but remains mounted to preserve animation state */
  visible?: boolean;
};

// Width variations for natural text appearance
const widths = ["w-full", "w-11/12", "w-4/5", "w-5/6", "w-3/4", "w-2/3"];

export const SkeletonText = ({
  className,
  lines = 3,
  visible = true,
}: SkeletonTextProps) => {
  return (
    <div
      className={cn(
        "stack-sm transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0 pointer-events-none absolute",
        className
      )}
      aria-hidden={!visible}
    >
      {Array.from({ length: lines }).map((_, index) => {
        const width = index === lines - 1 ? widths[index % widths.length] : "";

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton lines don't reorder
            key={index}
            className={cn("skeleton-shimmer h-4 rounded-md", width)}
          />
        );
      })}
    </div>
  );
};
