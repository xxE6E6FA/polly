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
      /** When true, this toast's action is registered as undoable via Cmd/Ctrl+Z */
      isUndo?: boolean;
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
        isUndo?: boolean;
      } = {}
    ) => {
      const hasCountdown = !!(options.action && options.duration);

      const sonnerOptions: Record<string, unknown> = {};
      if (options.description !== undefined) {
        sonnerOptions.description = options.description;
      }
      if (options.id !== undefined) {
        sonnerOptions.id = options.id;
      }
      if (options.action !== undefined) {
        sonnerOptions.action = options.action;
      }
      if (options.duration !== undefined) {
        sonnerOptions.duration = options.duration;
      }
      if (hasCountdown) {
        sonnerOptions.className = "toast-countdown";
        sonnerOptions.style = {
          "--toast-duration": `${options.duration}ms`,
        } as React.CSSProperties;
      }
      if (options.onAutoClose !== undefined) {
        sonnerOptions.onAutoClose = options.onAutoClose;
      }
      if (options.isUndo) {
        sonnerOptions.onDismiss = () => {
          if (
            lastUndoRef.current &&
            lastUndoRef.current.toastId === (options.id ?? toastId)
          ) {
            lastUndoRef.current = null;
          }
        };
      }

      const toastId = toast.success(message, sonnerOptions);

      // Only track as undoable via Cmd+Z when explicitly marked as undo
      if (options.isUndo && options.action) {
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
