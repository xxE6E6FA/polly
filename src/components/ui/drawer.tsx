"use client";

import type * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { Backdrop } from "@/components/ui/backdrop";
import { cn } from "@/lib/utils";

function Drawer({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      {...props}
    />
  );
}

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

type DrawerOverlayProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Overlay
> & {
  ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Overlay>>;
};

function DrawerOverlay({ className, ref, ...props }: DrawerOverlayProps) {
  return (
    <DrawerPrimitive.Overlay ref={ref} asChild {...props}>
      <Backdrop className={cn("z-drawer", className)} />
    </DrawerPrimitive.Overlay>
  );
}

type DrawerContentProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Content
> & {
  scrollContainerClassName?: string;
  ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Content>>;
};

function DrawerContent({
  className,
  children,
  scrollContainerClassName,
  ref,
  ...props
}: DrawerContentProps) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-drawer mt-24 flex h-auto max-h-[90dvh] flex-col overflow-hidden rounded-t-[10px] bg-card shadow-xl dark:ring-1 dark:ring-white/[0.06]",
          className
        )}
        {...props}
      >
        <div className="mx-auto drawer-handle rounded-full bg-muted-foreground/30 flex-none" />
        <div
          className={cn(
            "min-h-0 flex-1 flex flex-col",
            scrollContainerClassName
          )}
        >
          {children}
        </div>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("min-h-0 flex-1 overflow-auto p-4", className)}
    {...props}
  />
);
DrawerBody.displayName = "DrawerBody";

type DrawerTitleProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Title
> & {
  ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Title>>;
};

function DrawerTitle({ className, ref, ...props }: DrawerTitleProps) {
  return (
    <DrawerPrimitive.Title
      ref={ref}
      className={cn(
        "text-lg sm:text-xl font-semibold leading-tight",
        className
      )}
      {...props}
    />
  );
}

type DrawerDescriptionProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Description
> & {
  ref?: React.Ref<React.ComponentRef<typeof DrawerPrimitive.Description>>;
};

function DrawerDescription({
  className,
  ref,
  ...props
}: DrawerDescriptionProps) {
  return (
    <DrawerPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerBody,
  DrawerTitle,
  DrawerDescription,
};
