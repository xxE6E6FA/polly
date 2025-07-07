import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface ErrorHandlingOptions {
  showToast?: boolean;
  toastTitle?: string;
  logToConsole?: boolean;
  onError?: (error: Error) => void;
}

export interface ErrorState {
  error: Error | null;
  isError: boolean;
  errorMessage: string | null;
}

export function useErrorHandling(options: ErrorHandlingOptions = {}) {
  const {
    showToast = true,
    toastTitle = "Error",
    logToConsole = true,
    onError,
  } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    errorMessage: null,
  });

  const handleError = useCallback(
    (error: Error | string, context?: string) => {
      const errorObj = error instanceof Error ? error : new Error(error);
      const message = errorObj.message;

      // Update error state
      setErrorState({
        error: errorObj,
        isError: true,
        errorMessage: message,
      });

      // Log to console in development
      if (logToConsole && process.env.NODE_ENV === "development") {
        console.error(`Error${context ? ` in ${context}` : ""}:`, errorObj);
      }

      // Show toast notification
      if (showToast) {
        toast.error(toastTitle, {
          description: message,
        });
      }

      // Call custom error handler
      onError?.(errorObj);
    },
    [showToast, toastTitle, logToConsole, onError]
  );

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      errorMessage: null,
    });
  }, []);

  // Wrapper for async operations with error handling
  const withErrorHandling = useCallback(
    async <T>(
      operation: () => Promise<T>,
      context?: string
    ): Promise<T | null> => {
      try {
        clearError();
        return await operation();
      } catch (error) {
        handleError(error as Error, context);
        return null;
      }
    },
    [handleError, clearError]
  );

  // Wrapper for sync operations with error handling
  const withErrorHandlingSync = useCallback(
    <T>(operation: () => T, context?: string): T | null => {
      try {
        clearError();
        return operation();
      } catch (error) {
        handleError(error as Error, context);
        return null;
      }
    },
    [handleError, clearError]
  );

  return {
    ...errorState,
    handleError,
    clearError,
    withErrorHandling,
    withErrorHandlingSync,
  };
}

// Specialized error handlers for common patterns
export function useApiErrorHandling() {
  return useErrorHandling({
    toastTitle: "API Error",
    logToConsole: true,
  });
}

export function useValidationErrorHandling() {
  return useErrorHandling({
    toastTitle: "Validation Error",
    showToast: true,
  });
}

export function useFileErrorHandling() {
  return useErrorHandling({
    toastTitle: "File Error",
    showToast: true,
  });
}
