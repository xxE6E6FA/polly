import { useCallback, useState, useRef } from "react";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
};

export function useConfirmationDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmationOptions>({
    title: "",
    description: "",
  });

  // Use refs to store callbacks instead of state
  const onConfirmRef = useRef<(() => void) | null>(null);
  const onCancelRef = useRef<(() => void) | null>(null);

  const confirm = useCallback(
    (
      opts: ConfirmationOptions,
      onConfirm: () => void,
      onCancel?: () => void
    ) => {
      setOptions(opts);
      onConfirmRef.current = onConfirm;
      onCancelRef.current = onCancel || null;
      setIsOpen(true);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    onConfirmRef.current?.();
    setIsOpen(false);
  }, []);

  const handleCancel = useCallback(() => {
    onCancelRef.current?.();
    setIsOpen(false);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCancelRef.current?.();
    }
    setIsOpen(open);
  }, []);

  return {
    isOpen,
    options,
    confirm,
    handleConfirm,
    handleCancel,
    handleOpenChange,
  };
}
