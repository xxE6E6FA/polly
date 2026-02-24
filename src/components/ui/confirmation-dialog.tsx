import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  variant?: "default" | "destructive";
  autoFocusConfirm?: boolean;
  children?: ReactNode;
}

export const ConfirmationDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
  autoFocusConfirm = true,
  children,
}: ConfirmationDialogProps) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mql = window.matchMedia("(max-width: 640px)");
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      // Support both event and initial list
      const matches =
        "matches" in e ? e.matches : (e as MediaQueryList).matches;
      setIsMobile(matches);
    };
    handleChange(mql);
    const listener = (e: MediaQueryListEvent) => handleChange(e);
    mql.addEventListener?.("change", listener);
    return () => {
      mql.removeEventListener?.("change", listener);
    };
  }, []);

  const [confirming, setConfirming] = useState(false);

  const handleConfirm = useCallback(async () => {
    try {
      setConfirming(true);
      await onConfirm();
      onOpenChange(false);
    } finally {
      setConfirming(false);
    }
  }, [onConfirm, onOpenChange]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  const buttonVariant = variant === "destructive" ? "destructive" : "default";

  return (
    <>
      {/* Desktop: Dialog */}
      <Dialog open={!isMobile && open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              type="button"
              disabled={confirming}
            >
              {cancelText}
            </Button>
            <Button
              variant={buttonVariant}
              onClick={handleConfirm}
              autoFocus={autoFocusConfirm}
              type="button"
              loading={confirming}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile: Drawer */}
      <Drawer open={isMobile && open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <div className="stack-lg">
              <p className="text-sm text-muted-foreground">{description}</p>
              {children}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  type="button"
                  disabled={confirming}
                >
                  {cancelText}
                </Button>
                <Button
                  variant={buttonVariant}
                  onClick={handleConfirm}
                  autoFocus={autoFocusConfirm}
                  type="button"
                  loading={confirming}
                >
                  {confirmText}
                </Button>
              </div>
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
};
