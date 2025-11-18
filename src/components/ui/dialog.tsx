import * as Dialog from "@base-ui-components/react/dialog";
import { XIcon } from "@phosphor-icons/react";
import * as React from "react";

import { Backdrop } from "@/components/ui/backdrop";
import { cn } from "@/lib/utils";

const DialogRoot = Dialog.Root;

const DialogTrigger = Dialog.Trigger;

const DialogPortal = Dialog.Portal;

const DialogClose = Dialog.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof Dialog.Backdrop>,
  React.ComponentPropsWithoutRef<typeof Dialog.Backdrop>
>(({ className, ...props }, ref) => (
  <Dialog.Backdrop ref={ref} {...props}>
    <Backdrop blur="md" className={cn("z-50", className)} variant="heavy" />
  </Dialog.Backdrop>
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof Dialog.Popup>,
  React.ComponentPropsWithoutRef<typeof Dialog.Popup>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <Dialog.Viewport>
      <Dialog.Popup
        ref={ref}
        className={cn(
          "fixed z-50 grid w-full gap-4 border bg-background shadow-sm duration-200 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0",
          // Mobile: full width, positioned at bottom
          "left-0 bottom-0 top-auto translate-x-0 translate-y-0 rounded-t-lg p-4",
          // Desktop: centered modal
          "sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:rounded-lg sm:p-6",
          className
        )}
        {...props}
      >
        {children}
        <Dialog.Close className="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[popup-open]:bg-muted data-[popup-open]:text-muted-foreground sm:right-4 sm:top-4">
          <XIcon className="h-5 w-5 sm:h-4 sm:w-4" />
          <span className="sr-only">Close</span>
        </Dialog.Close>
      </Dialog.Popup>
    </Dialog.Viewport>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

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

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof Dialog.Title>,
  React.ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title
    ref={ref}
    className={cn(
      "text-lg sm:text-xl font-heading leading-tight text-balance",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof Dialog.Description>,
  React.ComponentPropsWithoutRef<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
  <Dialog.Description
    ref={ref}
    className={cn(
      "text-sm text-muted-foreground leading-relaxed text-pretty",
      className
    )}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

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
