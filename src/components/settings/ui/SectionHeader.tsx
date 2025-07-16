import type * as React from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: string;
  className?: string;
  children?: React.ReactNode;
};

export const SectionHeader = ({
  title,
  className,
  children,
}: SectionHeaderProps) => {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
};
