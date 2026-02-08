import { Menu } from "@base-ui/react/menu";
import { CaretRightIcon, CheckIcon } from "@phosphor-icons/react";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Simple aliases for basic components
const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;
const DropdownMenuGroup = Menu.Group;
const DropdownMenuSub = Menu.SubmenuRoot;
const DropdownMenuRadioGroup = Menu.RadioGroup;

type DropdownMenuSubTriggerProps = React.ComponentPropsWithoutRef<
  typeof Menu.SubmenuTrigger
> & {
  ref?: React.Ref<React.ComponentRef<typeof Menu.SubmenuTrigger>>;
};

// Wrapper for submenu trigger with caret icon
function DropdownMenuSubTrigger({
  className,
  children,
  ref,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <Menu.SubmenuTrigger
      ref={ref}
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted data-[popup-open]:bg-muted",
        className
      )}
      {...props}
    >
      {children}
      <CaretRightIcon className="ml-auto size-4" />
    </Menu.SubmenuTrigger>
  );
}

type DropdownMenuSubContentProps = React.ComponentPropsWithoutRef<
  typeof Menu.Popup
> & {
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  ref?: React.Ref<React.ComponentRef<typeof Menu.Popup>>;
};

// Wrapper for submenu content with Portal/Positioner/Popup structure
function DropdownMenuSubContent({
  className,
  side = "right",
  sideOffset = 8,
  ref,
  ...props
}: DropdownMenuSubContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        side={side}
        sideOffset={sideOffset}
        className="z-popover"
      >
        <Menu.Popup
          ref={ref}
          className={cn(
            "min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-foreground shadow-lg",
            "transition-[opacity,transform] duration-200 ease-out",
            "opacity-0 data-[open]:opacity-100",
            "scale-95 data-[open]:scale-100",
            "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
            "data-[ending-style]:opacity-0 data-[ending-style]:scale-95",
            className
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

type DropdownMenuContentProps = React.ComponentPropsWithoutRef<
  typeof Menu.Popup
> & {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  ref?: React.Ref<React.ComponentRef<typeof Menu.Popup>>;
};

// Wrapper for main menu content with Portal/Positioner/Popup structure
function DropdownMenuContent({
  className,
  sideOffset = 4,
  side = "bottom",
  align,
  ref,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="z-popover"
      >
        <Menu.Popup
          ref={ref}
          className={cn(
            "min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-foreground shadow-lg",
            "transition-[opacity,transform] duration-200 ease-out",
            "opacity-0 data-[open]:opacity-100",
            "scale-95 data-[open]:scale-100",
            "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
            "data-[ending-style]:opacity-0 data-[ending-style]:scale-95",
            className
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

type DropdownMenuItemProps = React.ComponentPropsWithoutRef<
  typeof Menu.Item
> & {
  ref?: React.Ref<React.ComponentRef<typeof Menu.Item>>;
};

// Simple styled menu item
function DropdownMenuItem({ className, ref, ...props }: DropdownMenuItemProps) {
  return (
    <Menu.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

type DropdownMenuCheckboxItemProps = React.ComponentPropsWithoutRef<
  typeof Menu.CheckboxItem
> & {
  ref?: React.Ref<React.ComponentRef<typeof Menu.CheckboxItem>>;
};

// Checkbox item with indicator
function DropdownMenuCheckboxItem({
  className,
  children,
  ref,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <Menu.CheckboxItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <Menu.CheckboxItemIndicator className="ml-auto">
        <CheckIcon className="size-4" />
      </Menu.CheckboxItemIndicator>
    </Menu.CheckboxItem>
  );
}

type DropdownMenuRadioItemProps = React.ComponentPropsWithoutRef<
  typeof Menu.RadioItem
> & {
  ref?: React.Ref<React.ComponentRef<typeof Menu.RadioItem>>;
};

// Radio item with indicator
function DropdownMenuRadioItem({
  className,
  children,
  ref,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <Menu.RadioItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <Menu.RadioItemIndicator className="ml-auto">
        <CheckIcon className="size-4" />
      </Menu.RadioItemIndicator>
    </Menu.RadioItem>
  );
}

type DropdownMenuLabelProps = React.ComponentPropsWithoutRef<
  typeof Menu.GroupLabel
> & {
  ref?: React.Ref<React.ComponentRef<typeof Menu.GroupLabel>>;
};

// Label for menu groups
function DropdownMenuLabel({
  className,
  ref,
  ...props
}: DropdownMenuLabelProps) {
  return (
    <Menu.GroupLabel
      ref={ref}
      className={cn("px-2 py-1.5 text-sm font-semibold", className)}
      {...props}
    />
  );
}

type DropdownMenuSeparatorProps = React.ComponentPropsWithoutRef<
  typeof Menu.Separator
> & {
  ref?: React.Ref<React.ComponentRef<typeof Menu.Separator>>;
};

// Separator
function DropdownMenuSeparator({
  className,
  ref,
  ...props
}: DropdownMenuSeparatorProps) {
  return (
    <Menu.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
