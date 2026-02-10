import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon, MinusIcon } from "@phosphor-icons/react";
import type * as React from "react";

import { cn } from "@/lib/utils";

type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "children"
> & {
  ref?: React.Ref<React.ComponentRef<typeof CheckboxPrimitive.Root>>;
};

function Checkbox({ className, ref, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "group/checkbox flex h-4 w-4 items-center justify-center rounded border transition-all",
        "data-[checked]:bg-primary data-[checked]:border-primary data-[checked]:text-primary-foreground",
        "data-[indeterminate]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:text-primary-foreground",
        "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
        "hover:border-primary/50 data-[checked]:hover:border-primary data-[indeterminate]:hover:border-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        keepMounted
        className="flex items-center justify-center data-[unchecked]:hidden"
      >
        <CheckIcon className="size-3 group-data-[indeterminate]/checkbox:hidden" />
        <MinusIcon className="size-3 hidden group-data-[indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
