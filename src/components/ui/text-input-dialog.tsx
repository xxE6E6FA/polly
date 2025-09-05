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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TextInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
}

export const TextInputDialog = ({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  defaultValue = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}: TextInputDialogProps) => {
  const [isMobile, setIsMobile] = useState(false);
  const [value, setValue] = useState(defaultValue);

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

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [open, defaultValue]);

  const handleConfirm = useCallback(() => {
    onConfirm(value.trim());
    onOpenChange(false);
  }, [onConfirm, value, onOpenChange]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        handleConfirm();
      }
    }
  };

  return (
    <>
      {/* Desktop: Dialog */}
      <Dialog open={!isMobile && open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="stack-lg">
            {label && <Label htmlFor="input-field">{label}</Label>}
            <Input
              id="input-field"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} type="button">
              {cancelText}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!value.trim()}
              type="button"
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
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
              {label && <Label htmlFor="mobile-input-field">{label}</Label>}
              <Input
                id="mobile-input-field"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCancel} type="button">
                  {cancelText}
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!value.trim()}
                  type="button"
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
