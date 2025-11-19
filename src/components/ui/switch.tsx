import * as SwitchPrimitives from "@base-ui-components/react/switch";
import * as React from "react";

import { cn } from "@/lib/utils";

const SwitchRoot = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Switch.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Switch.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Switch.Root
    className={cn("switch-root", className)}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Switch.Thumb className="switch-thumb" />
  </SwitchPrimitives.Switch.Root>
));
SwitchRoot.displayName = "Switch";

// Export with original name for backward compatibility
export { SwitchRoot as Switch };
