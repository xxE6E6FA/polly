import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const skeletonTextVariants = cva("stack-sm", {
  variants: {
    variant: {
      // Simple pulse animation
      pulse: "",
      // Shimmer animation using CSS shimmer keyframe
      shimmer: "",
      // Animated gradient (most elaborate)
      gradient: "stack-md p-4",
    },
  },
  defaultVariants: {
    variant: "pulse",
  },
});

type SkeletonTextProps = {
  className?: string;
  lines?: number;
} & VariantProps<typeof skeletonTextVariants>;

// Width variations for natural text appearance
const widths = ["w-full", "w-11/12", "w-4/5", "w-5/6", "w-3/4", "w-2/3"];

export const SkeletonText = ({
  className,
  variant = "pulse",
  lines = 3,
}: SkeletonTextProps) => {
  // Gradient variant: animated colorful gradients
  if (variant === "gradient") {
    const gradients = [
      "from-[hsl(210_70%_58%/0.2)] via-[hsl(220_65%_62%/0.2)] to-[hsl(230_60%_68%/0.2)]",
      "from-[hsl(230_60%_68%/0.2)] via-[hsl(200_65%_68%/0.2)] to-[hsl(190_65%_60%/0.2)]",
      "from-[hsl(220_65%_62%/0.2)] via-[hsl(230_60%_68%/0.2)] to-[hsl(210_70%_58%/0.2)]",
      "from-[hsl(190_65%_60%/0.2)] via-[hsl(230_60%_68%/0.2)] to-[hsl(220_65%_62%/0.2)]",
      "from-[hsl(210_70%_58%/0.2)] via-[hsl(230_60%_68%/0.2)] to-[hsl(190_65%_60%/0.2)]",
      "from-[hsl(230_60%_68%/0.2)] via-[hsl(220_65%_62%/0.2)] to-[hsl(210_70%_58%/0.2)]",
    ];

    return (
      <div className={cn(skeletonTextVariants({ variant }), className)}>
        {Array.from({ length: lines }).map((_, index) => {
          const gradient = gradients[index % gradients.length];
          const width =
            index === lines - 1 ? widths[index % widths.length] : "";
          const delay = index * 0.2;

          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton lines don't reorder
              key={index}
              className={cn(
                "h-4 animate-gradient-x rounded bg-gradient-to-r bg-[length:200%_100%]",
                gradient,
                width
              )}
              style={{ animationDelay: `${delay}s` }}
            />
          );
        })}
      </div>
    );
  }

  // Shimmer variant: uses CSS shimmer animation
  if (variant === "shimmer") {
    return (
      <div className={cn(skeletonTextVariants({ variant }), className)}>
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
    );
  }

  // Pulse variant (default): simple pulse animation
  return (
    <div className={cn(skeletonTextVariants({ variant }), className)}>
      {Array.from({ length: lines }).map((_, index) => {
        const width = index === lines - 1 ? widths[index % widths.length] : "";
        const delay = index * 150;

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton lines don't reorder
            key={index}
            className={cn("h-4 animate-pulse rounded-md bg-muted/50", width)}
            style={{ animationDelay: `${delay}ms` }}
          />
        );
      })}
    </div>
  );
};
