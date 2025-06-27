/**
 * Centralized error handling utilities for AI streaming
 */

export type StreamErrorType =
  | "MessageDeleted"
  | "WriteConflict"
  | "AbortError"
  | "Unknown";

export interface StreamError {
  type: StreamErrorType;
  isRetryable: boolean;
  shouldMarkDeleted: boolean;
}

/**
 * Classify errors in the streaming context
 */
export function classifyStreamError(error: unknown): StreamError {
  if (!(error instanceof Error)) {
    return { type: "Unknown", isRetryable: false, shouldMarkDeleted: false };
  }

  // Message deletion errors (expected during stop)
  if (
    error.message.includes("not found") ||
    error.message.includes("nonexistent document")
  ) {
    return {
      type: "MessageDeleted",
      isRetryable: false,
      shouldMarkDeleted: true,
    };
  }

  // Write conflicts (retryable)
  if (error.message.includes("Documents read from or written to")) {
    return {
      type: "WriteConflict",
      isRetryable: true,
      shouldMarkDeleted: false,
    };
  }

  // Abort errors (expected during stop)
  if (
    error.name === "AbortError" ||
    error.message.includes("AbortError") ||
    error.message === "StoppedByUser"
  ) {
    return { type: "AbortError", isRetryable: false, shouldMarkDeleted: false };
  }

  return { type: "Unknown", isRetryable: false, shouldMarkDeleted: false };
}

/**
 * Unified retry handler with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 25
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const errorInfo = classifyStreamError(error);

      // Don't retry non-retryable errors
      if (!errorInfo.isRetryable || attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff for retryable errors
      if (errorInfo.type === "WriteConflict") {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Unified error handler for database operations in streaming context
 */
export async function handleStreamOperation<T>(
  operation: () => Promise<T>,
  onMessageDeleted?: () => void
): Promise<T | null> {
  try {
    return await withRetry(operation);
  } catch (error) {
    const errorInfo = classifyStreamError(error);

    if (errorInfo.shouldMarkDeleted && onMessageDeleted) {
      onMessageDeleted();
    }

    // Don't throw for expected errors during stop
    if (
      errorInfo.type === "MessageDeleted" ||
      errorInfo.type === "WriteConflict"
    ) {
      return null;
    }

    throw error;
  }
}

/**
 * Specialized handler for operations that need to return a specific value on failure
 */
export async function handleStreamOperationWithRetry<T>(
  operation: () => Promise<T>,
  onMessageDeleted?: () => void
): Promise<T> {
  const result = await handleStreamOperation(operation, onMessageDeleted);
  if (result === null) {
    throw new Error(
      "Operation failed due to message deletion or write conflict"
    );
  }
  return result;
}
