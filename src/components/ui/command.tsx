import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Command as CommandPrimitive } from "cmdk";
import type * as React from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CommandProps = React.ComponentPropsWithoutRef<typeof CommandPrimitive> & {
  ref?: React.Ref<React.ElementRef<typeof CommandPrimitive>>;
};

function Command({ className, ref, ...props }: CommandProps) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md bg-popover text-foreground",
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  children,
  ...props
}: React.ComponentProps<typeof Dialog>) {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0">
        <Command
          className={cn(
            "max-h-[520px] min-w-[540px] overflow-hidden",
            "[&_[cmdk-list]]:max-h-[360px]",
            "[&_[cmdk-input-wrapper]]:px-4 [&_[cmdk-input-wrapper]]:py-3",
            "[&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input-wrapper]_svg]:text-muted-foreground",
            "[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground/70",
            "[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:mt-3",
            "[&_[cmdk-group]]:px-0",
            "[&_[cmdk-item]]:px-4 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]]:text-sm",
            "[&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
          )}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

type CommandInputProps = React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Input
> & {
  ref?: React.Ref<React.ElementRef<typeof CommandPrimitive.Input>>;
};

function CommandInput({ className, ref, ...props }: CommandInputProps) {
  return (
    <div
      className="flex items-center gap-2 border-b border-border/40 bg-popover px-4 py-3"
      cmdk-input-wrapper=""
    >
      <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          "flex h-9 w-full bg-transparent py-0 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

type CommandListProps = React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.List
> & {
  ref?: React.Ref<React.ElementRef<typeof CommandPrimitive.List>>;
};

function CommandList({ className, ref, ...props }: CommandListProps) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn(
        "max-h-[300px] overflow-y-auto overflow-x-hidden",
        className
      )}
      {...props}
    />
  );
}

type CommandEmptyProps = React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Empty
> & {
  ref?: React.Ref<React.ElementRef<typeof CommandPrimitive.Empty>>;
};

function CommandEmpty({ ref, ...props }: CommandEmptyProps) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

type CommandGroupProps = React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Group
> & {
  ref?: React.Ref<React.ElementRef<typeof CommandPrimitive.Group>>;
};

function CommandGroup({ className, ref, ...props }: CommandGroupProps) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        "overflow-hidden p-0 text-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

type CommandSeparatorProps = React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Separator
> & {
  ref?: React.Ref<React.ElementRef<typeof CommandPrimitive.Separator>>;
};

function CommandSeparator({ className, ref, ...props }: CommandSeparatorProps) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cn("h-px bg-border", className)}
      {...props}
    />
  );
}

type CommandItemProps = React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Item
> & {
  ref?: React.Ref<React.ElementRef<typeof CommandPrimitive.Item>>;
};

function CommandItem({ className, ref, ...props }: CommandItemProps) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default gap-2 select-none items-center rounded-none px-3 py-2 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-muted data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
