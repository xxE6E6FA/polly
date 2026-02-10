import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import type * as React from "react";

import { cn } from "@/lib/utils";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

type CollapsibleContentProps = React.ComponentPropsWithoutRef<
  typeof CollapsiblePrimitive.Panel
> & {
  ref?: React.Ref<React.ComponentRef<typeof CollapsiblePrimitive.Panel>>;
};

function CollapsibleContent({
  className,
  ref,
  ...props
}: CollapsibleContentProps) {
  return (
    <CollapsiblePrimitive.Panel
      ref={ref}
      className={cn("overflow-hidden", className)}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
