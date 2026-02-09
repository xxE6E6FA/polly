import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { toast } from "sonner";

interface ToastContextValue {
  success: (
    message: string,
    options?: {
      description?: string;
      id?: string;
      action?: {
        label: string;
        onClick: () => void;
      };
      duration?: number;
      onAutoClose?: (t: { id: string | number }) => void;
    }
  ) => void;
  error: (
    message: string,
    options?: { description?: string; id?: string }
  ) => void;
  loading: (message: string, options?: { id?: string }) => string | number;
  dismiss: (toastId?: string | number) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

interface ToastProviderProps {
  children: React.ReactNode;
}

interface UndoAction {
  toastId: string | number;
  onClick: () => void;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const lastUndoRef = useRef<UndoAction | null>(null);

  const success = useCallback(
    (
      message: string,
      options: {
        description?: string;
        id?: string;
        action?: {
          label: string;
          onClick: () => void;
        };
        duration?: number;
        onAutoClose?: (t: { id: string | number }) => void;
      } = {}
    ) => {
      const hasCountdown = !!(options.action && options.duration);

      const toastId = toast.success(message, {
        description: options.description,
        id: options.id,
        action: options.action,
        duration: options.duration,
        className: hasCountdown ? "toast-countdown" : undefined,
        style: hasCountdown
          ? ({
              "--toast-duration": `${options.duration}ms`,
            } as React.CSSProperties)
          : undefined,
        onAutoClose: options.onAutoClose,
        onDismiss: () => {
          // Clear undo ref when toast is dismissed (by user or programmatically)
          if (
            lastUndoRef.current &&
            lastUndoRef.current.toastId === (options.id ?? toastId)
          ) {
            lastUndoRef.current = null;
          }
        },
      });

      // Track action as undoable via Cmd+Z
      if (options.action) {
        lastUndoRef.current = {
          toastId: options.id ?? toastId,
          onClick: options.action.onClick,
        };
      }

      return toastId;
    },
    []
  );

  const error = useCallback(
    (message: string, options: { description?: string; id?: string } = {}) => {
      return toast.error(message, {
        description: options.description,
        id: options.id,
      });
    },
    []
  );

  const loading = useCallback(
    (message: string, options: { id?: string } = {}) => {
      return toast.loading(message, {
        id: options.id,
      });
    },
    []
  );

  const dismiss = useCallback((toastId?: string | number) => {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  }, []);

  const dismissAll = useCallback(() => {
    toast.dismiss();
  }, []);

  // Cmd+Z / Ctrl+Z to trigger undo (only when not in a text input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey)) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const undo = lastUndoRef.current;
      if (!undo) {
        return;
      }

      e.preventDefault();
      undo.onClick();
      toast.dismiss(undo.toastId);
      lastUndoRef.current = null;
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const value: ToastContextValue = {
    success,
    error,
    loading,
    dismiss,
    dismissAll,
  };

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
