import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> &
  VariantProps<typeof labelVariants> & {
    ref?: React.Ref<HTMLLabelElement>;
  };

// Base UI doesn't have a standalone Label component; it's part of Field.
// For backward compatibility, we'll use a simple styled label element.
function Label({ className, ref, ...props }: LabelProps) {
  return (
    <label ref={ref} className={cn(labelVariants(), className)} {...props} />
  );
}

export { Label };
