import { Select, type SelectRootProps } from "@base-ui/react/select";
import { CaretDownIcon, CaretUpIcon, CheckIcon } from "@phosphor-icons/react";
import type * as React from "react";
import {
  createContext,
  type RefCallback,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Context: share trigger width so popup can match it
// ---------------------------------------------------------------------------

type TriggerWidthContextValue = {
  width: number | null;
  setWidth: (w: number) => void;
};

const TriggerWidthCtx = createContext<TriggerWidthContextValue>({
  width: null,
  // biome-ignore lint/suspicious/noEmptyBlockStatements: noop default
  setWidth: () => {},
});

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function SelectRoot<V>(props: SelectRootProps<V>) {
  const [width, setWidth] = useState<number | null>(null);
  const ctxValue = useMemo(() => ({ width, setWidth }), [width]);
  return (
    <TriggerWidthCtx value={ctxValue}>
      <Select.Root<V> {...props} />
    </TriggerWidthCtx>
  );
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

type SelectTriggerProps = React.ComponentPropsWithoutRef<
  typeof Select.Trigger
> & {
  variant?: "default" | "minimal";
  hideIcon?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
};

function SelectTrigger({
  className,
  children,
  variant = "default",
  hideIcon = false,
  ref,
  ...rest
}: SelectTriggerProps) {
  const { setWidth } = useContext(TriggerWidthCtx);

  const measure: RefCallback<HTMLElement> = useCallback(
    node => {
      if (node) {
        setWidth(node.getBoundingClientRect().width);
      }
    },
    [setWidth]
  );

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      measure(node);
      if (typeof ref === "function") {
        ref(node as HTMLButtonElement | null);
      } else if (ref) {
        (ref as React.RefObject<HTMLElement | null>).current = node;
      }
    },
    [measure, ref]
  );

  return (
    <Select.Trigger
      ref={mergedRef}
      className={cn(
        "flex cursor-default items-center justify-between gap-2 rounded-md text-sm select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "default" &&
          "h-9 w-full border border-input-border bg-background/40 px-3 py-2 shadow-sm",
        variant === "minimal" && "border-0 bg-transparent",
        className
      )}
      {...rest}
    >
      {children}
      {!hideIcon && (
        <Select.Icon className="flex shrink-0">
          <CaretDownIcon className="size-4 opacity-50" />
        </Select.Icon>
      )}
    </Select.Trigger>
  );
}

// ---------------------------------------------------------------------------
// Content (Portal → Positioner → Popup)
// ---------------------------------------------------------------------------

type SelectContentProps = React.ComponentPropsWithoutRef<
  typeof Select.Positioner
> & {
  ref?: React.Ref<HTMLDivElement>;
};

function SelectContent({
  className,
  children,
  sideOffset = 4,
  ...rest
}: SelectContentProps) {
  const { width } = useContext(TriggerWidthCtx);

  return (
    <Select.Portal>
      <Select.Positioner
        sideOffset={sideOffset}
        className={cn("z-select outline-none", className)}
        {...rest}
      >
        <Select.Popup
          className={cn(
            "origin-[var(--transform-origin)] rounded-lg bg-popover text-foreground shadow-lg",
            "outline outline-1 -outline-offset-1 outline-border",
            "transition-[transform,scale,opacity]",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            "data-[side=none]:data-[starting-style]:scale-100 data-[side=none]:data-[starting-style]:opacity-100",
            "data-[side=none]:data-[ending-style]:transition-none"
          )}
          style={width ? { minWidth: width } : undefined}
        >
          <Select.ScrollUpArrow className="flex h-4 w-full cursor-default items-center justify-center">
            <CaretUpIcon className="size-3.5" />
          </Select.ScrollUpArrow>
          <Select.List className="scroll-py-1 overflow-y-auto py-1 max-h-[var(--available-height)]">
            {children}
          </Select.List>
          <Select.ScrollDownArrow className="flex h-4 w-full cursor-default items-center justify-center">
            <CaretDownIcon className="size-3.5" />
          </Select.ScrollDownArrow>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  );
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

type SelectItemProps = React.ComponentPropsWithoutRef<typeof Select.Item> & {
  ref?: React.Ref<HTMLDivElement>;
};

function SelectItem({ className, children, ...rest }: SelectItemProps) {
  return (
    <Select.Item
      className={cn(
        "grid min-h-8 w-full cursor-default items-center text-sm outline-none select-none",
        "grid-cols-[0.75rem_1fr] gap-x-2 py-1.5 pr-4 pl-2.5",
        "data-[highlighted]:relative data-[highlighted]:z-0",
        "data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0",
        "data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-muted",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...rest}
    >
      <Select.ItemIndicator className="col-start-1 flex items-center">
        <CheckIcon className="size-3" weight="bold" />
      </Select.ItemIndicator>
      <Select.ItemText className="col-start-2 truncate">
        {children}
      </Select.ItemText>
    </Select.Item>
  );
}

// ---------------------------------------------------------------------------
// Thin wrappers
// ---------------------------------------------------------------------------

const SelectValue = Select.Value;
const SelectGroup = Select.Group;

function SelectLabel({
  className,
  ...rest
}: React.ComponentPropsWithoutRef<typeof Select.GroupLabel>) {
  return (
    <Select.GroupLabel
      className={cn(
        "px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
        className
      )}
      {...rest}
    />
  );
}

function SelectSeparator({
  className,
  ...rest
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <Select.Separator
      className={cn("my-1 h-px bg-border", className)}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  SelectRoot as Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
};
