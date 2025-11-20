import type React from "react";

import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = ({ className, ...props }: SkeletonProps) => {
  return (
    <div className={cn("skeleton-shimmer rounded-md", className)} {...props} />
  );
};
