import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Backdrop } from "@/components/ui/backdrop";
import { cn } from "@/lib/utils";
import { type Attachment } from "@/types";

type ImagePreviewDialogProps = {
  attachment: Attachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl?: string;
};

export const ImagePreviewDialog = ({
  attachment,
  open,
  onOpenChange,
  imageUrl,
}: ImagePreviewDialogProps) => {
  if (!attachment || attachment.type !== "image" || !imageUrl) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <Backdrop className="z-50" variant="heavy" />
        </DialogPrimitive.Overlay>

        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[90vw] max-w-5xl translate-x-[-50%] translate-y-[-50%] focus:outline-none"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <div className="relative overflow-hidden rounded-xl bg-background/95 shadow-2xl backdrop-blur-sm">
            <img
              src={imageUrl}
              alt={attachment.name}
              className={cn("max-h-[85vh] w-full object-contain", "rounded-xl")}
              draggable={false}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
