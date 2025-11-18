"use client";

import { ContextMenu } from "@base-ui-components/react/context-menu";
import { CaretRightIcon, CheckIcon, CircleIcon } from "@phosphor-icons/react";
import * as React from "react";

import { cn } from "@/lib/utils";

const ContextMenuRoot = ContextMenu.Root;

const ContextMenuTrigger = ContextMenu.Trigger;

const ContextMenuGroup = ContextMenu.Group;

const ContextMenuPortal = ContextMenu.Portal;

const ContextMenuSub = ContextMenu.SubmenuRoot;

const ContextMenuRadioGroup = ContextMenu.RadioGroup;

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenu.SubmenuTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenu.SubmenuTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenu.SubmenuTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-muted data-[popup-open]:bg-muted",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <CaretRightIcon className="ml-auto h-4 w-4" />
  </ContextMenu.SubmenuTrigger>
));
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenu.Popup>,
  React.ComponentPropsWithoutRef<typeof ContextMenu.Popup> & {
    side?: "top" | "bottom" | "left" | "right";
  }
>(({ className, side = "right", ...props }, ref) => (
  <ContextMenu.Positioner side={side}>
    <ContextMenu.Popup
      ref={ref}
      className={cn(
        "z-[100] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-foreground shadow-sm transition-[background-color,border-color,color,box-shadow,transform] duration-200 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </ContextMenu.Positioner>
));
ContextMenuSubContent.displayName = "ContextMenuSubContent";

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenu.Popup>,
  React.ComponentPropsWithoutRef<typeof ContextMenu.Popup>
>(({ className, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenu.Positioner>
      <ContextMenu.Popup
        ref={ref}
        className={cn(
          "z-[100] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-foreground shadow-sm transition-[background-color,border-color,color,box-shadow,transform] duration-200 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </ContextMenu.Positioner>
  </ContextMenuPortal>
));
ContextMenuContent.displayName = "ContextMenuContent";

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenu.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenu.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenu.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    )}
    {...props}
  />
));
ContextMenuItem.displayName = "ContextMenuItem";

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenu.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenu.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenu.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <ContextMenu.CheckboxItemIndicator>
        <CheckIcon className="h-4 w-4" />
      </ContextMenu.CheckboxItemIndicator>
    </span>
    {children}
  </ContextMenu.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenu.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenu.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <ContextMenu.RadioItemIndicator>
        <CircleIcon className="h-4 w-4 fill-current" />
      </ContextMenu.RadioItemIndicator>
    </span>
    {children}
  </ContextMenu.RadioItem>
));
ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenu.GroupLabel>,
  React.ComponentPropsWithoutRef<typeof ContextMenu.GroupLabel> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenu.GroupLabel
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold text-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  />
));
ContextMenuLabel.displayName = "ContextMenuLabel";

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenu.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenu.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

const ContextMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  );
};
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export {
  ContextMenuRoot as ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
