import type React from "react";
import { createContext, useCallback, useContext } from "react";
import { toast } from "sonner";

interface ToastContextValue {
  success: (
    message: string,
    options?: { description?: string; id?: string }
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

export function ToastProvider({ children }: ToastProviderProps) {
  const success = useCallback(
    (message: string, options: { description?: string; id?: string } = {}) => {
      return toast.success(message, {
        description: options.description,
        id: options.id,
      });
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
