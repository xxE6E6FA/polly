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
      keepMounted
      className={cn(
        "h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-[ending-style]:h-0 data-[starting-style]:h-0",
        className
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
