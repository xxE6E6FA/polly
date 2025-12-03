import * as SwitchPrimitives from "@base-ui-components/react/switch";
import type * as React from "react";

import { cn } from "@/lib/utils";

type SwitchProps = React.ComponentPropsWithoutRef<
  typeof SwitchPrimitives.Switch.Root
> & {
  ref?: React.Ref<React.ElementRef<typeof SwitchPrimitives.Switch.Root>>;
};

function Switch({ className, ref, ...props }: SwitchProps) {
  return (
    <SwitchPrimitives.Switch.Root
      className={cn("switch-root", className)}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Switch.Thumb className="switch-thumb" />
    </SwitchPrimitives.Switch.Root>
  );
}

export { Switch };
