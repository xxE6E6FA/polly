import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import type * as React from "react";

import { cn } from "@/lib/utils";

type SeparatorProps = React.ComponentPropsWithoutRef<
  typeof SeparatorPrimitive
> & {
  ref?: React.Ref<React.ComponentRef<typeof SeparatorPrimitive>>;
};

function Separator({
  className,
  orientation = "horizontal",
  ref,
  ...props
}: SeparatorProps) {
  return (
    <SeparatorPrimitive
      ref={ref}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
}

export { Separator };
