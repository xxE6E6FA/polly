import * as SelectPrimitive from "@base-ui-components/react/select";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const SelectRoot = SelectPrimitive.Select.Root;

const SelectGroup = SelectPrimitive.Select.Group;

const SelectValue = SelectPrimitive.Select.Value;

type SelectTriggerProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Select.Trigger
> & {
  variant?: "default" | "minimal";
  hideIcon?: boolean;
  asChild?: boolean;
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Select.Trigger>>;
};

function SelectTrigger({
  className,
  children,
  variant = "default",
  hideIcon = false,
  render,
  ref,
  ...props
}: SelectTriggerProps) {
  // If using asChild or render prop, delegate rendering
  if (props.asChild || render) {
    return (
      <SelectPrimitive.Select.Trigger ref={ref} render={render} {...props}>
        {children}
      </SelectPrimitive.Select.Trigger>
    );
  }

  return (
    <SelectPrimitive.Select.Trigger
      ref={ref}
      className={cn(
        variant === "default"
          ? "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input-border bg-background/40 backdrop-blur-sm px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 hover:bg-background/60 hover:border-input-border focus-visible:bg-background focus-visible:border-input-border transition-[background-color,border-color,color,box-shadow] duration-200"
          : "flex items-center whitespace-nowrap rounded-md border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none focus:outline-none focus:ring-0 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {!hideIcon && (
        <SelectPrimitive.Select.Icon
          render={props => (
            <CaretDownIcon {...props} className="h-4 w-4 opacity-50" />
          )}
        />
      )}
    </SelectPrimitive.Select.Trigger>
  );
}

type SelectScrollUpButtonProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Select.ScrollUpArrow
> & {
  ref?: React.Ref<
    React.ElementRef<typeof SelectPrimitive.Select.ScrollUpArrow>
  >;
};

function SelectScrollUpButton({
  className,
  ref,
  ...props
}: SelectScrollUpButtonProps) {
  return (
    <SelectPrimitive.Select.ScrollUpArrow
      ref={ref}
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <CaretUpIcon className="h-4 w-4" />
    </SelectPrimitive.Select.ScrollUpArrow>
  );
}

type SelectScrollDownButtonProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Select.ScrollDownArrow
> & {
  ref?: React.Ref<
    React.ElementRef<typeof SelectPrimitive.Select.ScrollDownArrow>
  >;
};

function SelectScrollDownButton({
  className,
  ref,
  ...props
}: SelectScrollDownButtonProps) {
  return (
    <SelectPrimitive.Select.ScrollDownArrow
      ref={ref}
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <CaretDownIcon className="h-4 w-4" />
    </SelectPrimitive.Select.ScrollDownArrow>
  );
}

type SelectContentProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Select.Positioner
> & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Select.Positioner>>;
};

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  ref,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Select.Portal>
      <SelectPrimitive.Select.Positioner
        ref={ref}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "absolute z-select max-h-96 min-w-[8rem] overflow-hidden rounded-lg border-0 bg-popover text-foreground shadow-md transition-[background-color,color,box-shadow,transform] duration-200 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[var(--transform-origin)]",
          className
        )}
        {...props}
      >
        <div className="max-h-96 overflow-y-auto overflow-x-hidden">
          <SelectScrollUpButton />
          <SelectPrimitive.Select.Popup className="p-1">
            {children}
          </SelectPrimitive.Select.Popup>
          <SelectScrollDownButton />
        </div>
      </SelectPrimitive.Select.Positioner>
    </SelectPrimitive.Select.Portal>
  );
}

type SelectLabelProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Select.GroupLabel
> & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Select.GroupLabel>>;
};

function SelectLabel({ className, ref, ...props }: SelectLabelProps) {
  return (
    <SelectPrimitive.Select.GroupLabel
      ref={ref}
      className={cn("px-2 py-1.5 text-sm font-semibold", className)}
      {...props}
    />
  );
}

type SelectItemProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Select.Item
> & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Select.Item>>;
};

function SelectItem({ className, children, ref, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Select.Item
      ref={ref}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SelectPrimitive.Select.ItemText>
        {children}
      </SelectPrimitive.Select.ItemText>
    </SelectPrimitive.Select.Item>
  );
}

type SelectSeparatorProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Select.Separator
> & {
  ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Select.Separator>>;
};

function SelectSeparator({ className, ref, ...props }: SelectSeparatorProps) {
  return (
    <SelectPrimitive.Select.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  );
}

// Export with original names for backward compatibility
export {
  SelectRoot as Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
