import { AlertDialog } from "@base-ui/react/alert-dialog";
import type * as React from "react";

import { Backdrop } from "@/components/ui/backdrop";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AlertDialogRoot = AlertDialog.Root;

const AlertDialogTrigger = AlertDialog.Trigger;

const AlertDialogPortal = AlertDialog.Portal;

type AlertDialogOverlayProps = React.ComponentPropsWithoutRef<
  typeof AlertDialog.Backdrop
> & {
  ref?: React.Ref<React.ComponentRef<typeof AlertDialog.Backdrop>>;
};

function AlertDialogOverlay({
  className,
  ref,
  ...props
}: AlertDialogOverlayProps) {
  return (
    <AlertDialog.Backdrop ref={ref} {...props}>
      <Backdrop className={cn("z-modal", className)} />
    </AlertDialog.Backdrop>
  );
}

type AlertDialogContentProps = React.ComponentPropsWithoutRef<
  typeof AlertDialog.Popup
> & {
  ref?: React.Ref<React.ComponentRef<typeof AlertDialog.Popup>>;
};

function AlertDialogContent({
  className,
  ref,
  ...props
}: AlertDialogContentProps) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <div className="fixed inset-0 z-modal flex items-end justify-center pointer-events-none sm:items-center">
        <AlertDialog.Popup
          ref={ref}
          className={cn(
            "pointer-events-auto grid w-full gap-4 bg-card shadow-xl dark:ring-1 dark:ring-white/[0.06] [animation-duration:200ms] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 sm:data-[state=closed]:slide-out-to-top-2 sm:data-[state=open]:slide-in-from-top-2 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[closed]:slide-out-to-bottom-2 data-[open]:slide-in-from-bottom-2 sm:data-[closed]:slide-out-to-top-2 sm:data-[open]:slide-in-from-top-2",
            // Mobile: full width, positioned at bottom (handled by flex wrapper)
            "rounded-t-xl p-6",
            // Desktop: centered modal (handled by flex wrapper)
            "sm:max-w-lg sm:rounded-xl",
            className
          )}
          {...props}
        />
      </div>
    </AlertDialogPortal>
  );
}

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col stack-sm text-left", className)}
    {...props}
  />
);

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2",
      className
    )}
    {...props}
  />
);

type AlertDialogTitleProps = React.ComponentPropsWithoutRef<
  typeof AlertDialog.Title
> & {
  ref?: React.Ref<React.ComponentRef<typeof AlertDialog.Title>>;
};

function AlertDialogTitle({ className, ref, ...props }: AlertDialogTitleProps) {
  return (
    <AlertDialog.Title
      ref={ref}
      className={cn(
        "text-lg sm:text-xl font-semibold leading-tight",
        className
      )}
      {...props}
    />
  );
}

type AlertDialogDescriptionProps = React.ComponentPropsWithoutRef<
  typeof AlertDialog.Description
> & {
  ref?: React.Ref<React.ComponentRef<typeof AlertDialog.Description>>;
};

function AlertDialogDescription({
  className,
  ref,
  ...props
}: AlertDialogDescriptionProps) {
  return (
    <AlertDialog.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground selectable-text", className)}
      {...props}
    />
  );
}

type AlertDialogActionProps = React.ComponentPropsWithoutRef<
  typeof AlertDialog.Close
> & {
  ref?: React.Ref<React.ComponentRef<typeof AlertDialog.Close>>;
};

function AlertDialogAction({
  className,
  ref,
  ...props
}: AlertDialogActionProps) {
  return (
    <AlertDialog.Close
      ref={ref}
      className={cn(buttonVariants(), className)}
      {...props}
    />
  );
}

type AlertDialogCancelProps = React.ComponentPropsWithoutRef<
  typeof AlertDialog.Close
> & {
  ref?: React.Ref<React.ComponentRef<typeof AlertDialog.Close>>;
};

function AlertDialogCancel({
  className,
  ref,
  ...props
}: AlertDialogCancelProps) {
  return (
    <AlertDialog.Close
      ref={ref}
      className={cn(
        buttonVariants({ variant: "outline" }),
        "mt-2 sm:mt-0",
        className
      )}
      {...props}
    />
  );
}

export {
  AlertDialogRoot as AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
