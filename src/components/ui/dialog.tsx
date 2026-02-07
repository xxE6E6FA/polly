import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react";
import type * as React from "react";

import { Backdrop } from "@/components/ui/backdrop";
import { cn } from "@/lib/utils";

const DialogRoot = Dialog.Root;

const DialogTrigger = Dialog.Trigger;

const DialogPortal = Dialog.Portal;

const DialogClose = Dialog.Close;

type DialogOverlayProps = React.ComponentPropsWithoutRef<
  typeof Dialog.Backdrop
> & {
  ref?: React.Ref<React.ComponentRef<typeof Dialog.Backdrop>>;
};

function DialogOverlay({ className, ref, ...props }: DialogOverlayProps) {
  return (
    <Dialog.Backdrop ref={ref} {...props}>
      <Backdrop className={cn("z-modal", className)} />
    </Dialog.Backdrop>
  );
}

type DialogContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof Dialog.Popup>,
  "children"
> & {
  ref?: React.Ref<React.ComponentRef<typeof Dialog.Popup>>;
  children?: React.ReactNode;
};

function DialogContent({
  className,
  children,
  ref,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <div className="fixed inset-0 z-modal flex items-end justify-center pointer-events-none sm:items-center">
        <Dialog.Popup
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
        >
          {children}
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground data-[open]:bg-accent data-[open]:text-muted-foreground">
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
        </Dialog.Popup>
      </div>
    </DialogPortal>
  );
}

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col stack-sm text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
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
DialogFooter.displayName = "DialogFooter";

type DialogTitleProps = React.ComponentPropsWithoutRef<typeof Dialog.Title> & {
  ref?: React.Ref<React.ComponentRef<typeof Dialog.Title>>;
};

function DialogTitle({ className, ref, ...props }: DialogTitleProps) {
  return (
    <Dialog.Title
      ref={ref}
      className={cn(
        "text-lg sm:text-xl font-heading leading-tight text-balance",
        className
      )}
      {...props}
    />
  );
}

type DialogDescriptionProps = React.ComponentPropsWithoutRef<
  typeof Dialog.Description
> & {
  ref?: React.Ref<React.ComponentRef<typeof Dialog.Description>>;
};

function DialogDescription({
  className,
  ref,
  ...props
}: DialogDescriptionProps) {
  return (
    <Dialog.Description
      ref={ref}
      className={cn(
        "text-sm text-muted-foreground leading-relaxed text-pretty",
        className
      )}
      {...props}
    />
  );
}

export {
  DialogRoot as Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
