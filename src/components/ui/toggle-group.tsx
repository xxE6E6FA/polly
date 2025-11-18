import { Toggle as TogglePrimitive } from "@base-ui-components/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui-components/react/toggle-group";
import * as React from "react";
import { cn } from "@/lib/utils";

type ToggleGroupProps = Omit<
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive>,
  "value" | "onValueChange"
> & {
  type?: "single" | "multiple";
  value?: string | readonly string[];
  onValueChange?: (value: string | readonly string[]) => void;
};

const ToggleGroupRoot = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive>,
  ToggleGroupProps
>(({ className, type = "multiple", value, onValueChange, ...props }, ref) => {
  // Convert single value to array for Base UI
  const baseValue = React.useMemo(() => {
    if (type === "single" && typeof value === "string") {
      return [value];
    }
    return value as readonly string[] | undefined;
  }, [type, value]);

  const handleValueChange = React.useCallback(
    (
      newValue: readonly string[],
      _eventDetails: {
        reason: "none";
        event: Event;
        cancel: () => void;
        allowPropagation: () => void;
        isCanceled: boolean;
        isPropagationAllowed: boolean;
      }
    ) => {
      if (!onValueChange) {
        return;
      }

      if (type === "single") {
        // For single mode, pass the first value or empty string
        onValueChange(newValue[0] || "");
      } else {
        onValueChange(newValue);
      }
    },
    [type, onValueChange]
  );

  return (
    <ToggleGroupPrimitive
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-full p-0.5 gap-0.5",
        className
      )}
      value={baseValue}
      onValueChange={handleValueChange}
      {...props}
    />
  );
});
ToggleGroupRoot.displayName = "ToggleGroup";

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive>
>(({ className, ...props }, ref) => (
  <TogglePrimitive
    ref={ref}
    className={cn(
      "inline-flex h-7 w-7 items-center justify-center rounded-full",
      // Motion + hover/active parity with upload/send
      "transition-colors transition-transform duration-200 transform-gpu",
      "data-[off]:hover:scale-105 data-[off]:active:scale-95",
      // Subtle hover bg only when off
      "data-[off]:hover:bg-foreground/5",
      // Colors
      "text-primary dark:text-primary/70",
      "data-[on]:bg-primary data-[on]:text-primary-foreground",
      // Focus ring aligned with upload/send (outside with offset)
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = "ToggleGroupItem";

// Export with original names for backward compatibility
export { ToggleGroupRoot as ToggleGroup, ToggleGroupItem };
