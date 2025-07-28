import { useCallback, useRef, useState } from "react";

// Base dialog state
interface BaseDialogState {
  isOpen: boolean;
  title: string;
  description: string;
}

// Confirmation dialog specific
interface ConfirmationDialogState extends BaseDialogState {
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

// Notification dialog specific
interface NotificationDialogState extends BaseDialogState {
  type?: "success" | "error" | "warning" | "info";
  actionText?: string;
}

export function useConfirmationDialog() {
  const [state, setState] = useState<ConfirmationDialogState>({
    isOpen: false,
    title: "",
    description: "",
  });

  const onConfirmRef = useRef<(() => void) | null>(null);
  const onCancelRef = useRef<(() => void) | null>(null);

  const confirm = useCallback(
    (
      options: Omit<ConfirmationDialogState, "isOpen">,
      onConfirm: () => void,
      onCancel?: () => void
    ) => {
      setState({ ...options, isOpen: true });
      onConfirmRef.current = onConfirm;
      onCancelRef.current = onCancel || null;
    },
    []
  );

  const handleConfirm = useCallback(() => {
    onConfirmRef.current?.();
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleCancel = useCallback(() => {
    onCancelRef.current?.();
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCancelRef.current?.();
    }
    setState(prev => ({ ...prev, isOpen: open }));
  }, []);

  return {
    state,
    confirm,
    handleConfirm,
    handleCancel,
    handleOpenChange,
  };
}

export function useNotificationDialog() {
  const [state, setState] = useState<NotificationDialogState>({
    isOpen: false,
    title: "",
    description: "",
  });

  const onActionRef = useRef<(() => void) | null>(null);

  const notify = useCallback(
    (
      options: Omit<NotificationDialogState, "isOpen">,
      onAction?: () => void
    ) => {
      setState({ ...options, isOpen: true });
      onActionRef.current = onAction || null;
    },
    []
  );

  const handleAction = useCallback(() => {
    onActionRef.current?.();
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setState(prev => ({ ...prev, isOpen: open }));
  }, []);

  return {
    state,
    notify,
    handleAction,
    handleOpenChange,
  };
}
