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

const resolveProviderName = (error: unknown): string | undefined => {
  const url = typeof (error as { url?: unknown })?.url === "string"
    ? (error as { url: string }).url
    : undefined;
  const provider =
    typeof (error as { requestBodyValues?: { provider?: unknown } })?.requestBodyValues?.provider ===
    "string"
      ? ((error as { requestBodyValues?: { provider?: string } }).requestBodyValues?.provider ?? "")
      : "";
  const hostMatch = url ? new URL(url).hostname : "";
  const hint = provider || hostMatch;

  if (!hint) {
    return undefined;
  }

  if (hint.includes("openrouter")) {
    return "OpenRouter";
  }
  if (hint.includes("openai")) {
    return "OpenAI";
  }
  if (hint.includes("anthropic")) {
    return "Anthropic";
  }
  if (hint.includes("google")) {
    return "Google";
  }
  if (hint.includes("groq")) {
    return "Groq";
  }
  if (hint.includes("replicate")) {
    return "Replicate";
  }
  if (hint.includes("xai") || hint.includes("x-ai")) {
    return "xAI";
  }
  return undefined;
};

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
 * Unified retry handler with exponential backoff and jitter.
 *
 * Uses jitter to prevent thundering herd when multiple operations
 * retry simultaneously after a conflict.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 5,
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

      // Exponential backoff with jitter for retryable errors
      if (errorInfo.type === "WriteConflict") {
        const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);
        // Add 0-50% jitter to prevent thundering herd
        const jitter = Math.random() * 0.5 * exponentialDelay;
        const delay = exponentialDelay + jitter;
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
 * Extract the raw error message string from an unknown error.
 */
export function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Generate user-facing error messages from provider/system errors.
 *
 * Strategy: pass through the raw provider error in most cases — providers
 * already return clear messages. Only override for internal errors that
 * would be meaningless to users (e.g. Convex OCC conflicts).
 */
export const getUserFriendlyErrorMessage = (error: unknown): string => {
  const raw = getRawErrorMessage(error);
  const providerName = resolveProviderName(error);
  const model =
    typeof (error as { requestBodyValues?: { model?: unknown } })?.requestBodyValues?.model ===
    "string"
      ? ((error as { requestBodyValues?: { model?: string } }).requestBodyValues?.model ?? "")
      : "";

  const withModel = (msg: string) =>
    model ? `${msg} (model: ${model})` : msg;

  // Internal: Convex OCC conflict — raw message is meaningless to users
  if (raw.includes("Documents read from or written to")) {
    return "A temporary conflict occurred while processing your message. Please try again.";
  }

  // Enrich with provider name when available
  if (providerName) {
    return withModel(`${providerName}: ${raw}`);
  }

  return withModel(raw);
};
