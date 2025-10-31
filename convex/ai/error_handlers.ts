/**
 * Centralized error handling utilities for AI streaming and server-side processing
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

/**
 * Generate user-friendly error messages for common server-side errors
 */
export const getUserFriendlyErrorMessage = (error: unknown): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorMessageLower = errorMessage.toLowerCase();

  // Model unavailability errors
  if (
    errorMessageLower.includes("model") &&
    (errorMessageLower.includes("not found") ||
      errorMessageLower.includes("not available") ||
      errorMessageLower.includes("404") ||
      errorMessageLower.includes("deprecated") ||
      errorMessageLower.includes("disabled") ||
      errorMessageLower.includes("invalid model"))
  ) {
    return "This model is no longer available. Please select a different model or remove it from Settings if it's disabled.";
  }

  // Common error patterns and their user-friendly messages
  if (errorMessage.includes("Documents read from or written to")) {
    return "I encountered a temporary issue while processing your message. Please try again.";
  }

  if (
    errorMessageLower.includes("api key") ||
    errorMessageLower.includes("authentication") ||
    errorMessageLower.includes("unauthorized")
  ) {
    return errorMessage; // These are already user-friendly
  }

  if (errorMessageLower.includes("rate limit") || errorMessageLower.includes("429")) {
    return "The AI service is currently busy. Please wait a moment and try again.";
  }

  if (errorMessageLower.includes("timeout") || errorMessageLower.includes("timed out")) {
    return "The response took too long. Please try again with a shorter message.";
  }

  if (errorMessageLower.includes("network") || errorMessageLower.includes("fetch")) {
    return "I'm having trouble connecting to the AI service. Please check your connection and try again.";
  }

  if (
    errorMessageLower.includes("context length") ||
    errorMessageLower.includes("token")
  ) {
    return "Your conversation has become too long. Please start a new conversation.";
  }

  // Generic fallback
  return "I encountered an unexpected error. Please try again or contact support if the issue persists.";
};
