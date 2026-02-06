import { cn } from "@/lib/utils";

type SkeletonTextProps = {
  className?: string;
  lines?: number;
  /** When false, skeleton smoothly collapses out of view */
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
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
      style={{ gridTemplateRows: visible ? "1fr" : "0fr" }}
      aria-hidden={!visible}
    >
      <div className="overflow-hidden">
        <div className="stack-sm">
          {Array.from({ length: lines }).map((_, index) => {
            const width =
              index === lines - 1 ? widths[index % widths.length] : "";

            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton lines don't reorder
                key={index}
                className={cn("skeleton-shimmer h-4 rounded-md", width)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
