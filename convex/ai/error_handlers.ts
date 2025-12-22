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
 * Generate user-friendly error messages for common server-side errors
 */
export const getUserFriendlyErrorMessage = (error: unknown): string => {
  const errorMessage = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as { message: unknown }).message as string : String(error));
  const errorMessageLower = errorMessage.toLowerCase();
  const statusCode =
    typeof (error as { statusCode?: unknown })?.statusCode === "number"
      ? ((error as { statusCode: number }).statusCode ?? undefined)
      : undefined;
  const model =
    typeof (error as { requestBodyValues?: { model?: unknown } })?.requestBodyValues?.model ===
    "string"
      ? ((error as { requestBodyValues?: { model?: string } }).requestBodyValues?.model ?? "")
      : "";
  const providerName = resolveProviderName(error);

  const appendModelHint = (message: string) =>
    model ? `${message} (requested model: ${model}).` : message;

  if (statusCode === 401 || errorMessageLower.includes("unauthorized")) {
    const base =
      providerName
        ? `Authentication with ${providerName} failed. Please double-check your API key or refresh the connection.`
        : "Authentication failed with the AI provider. Please double-check your API key or refresh the connection.";
    return appendModelHint(base);
  }

  if (statusCode === 403) {
    const base =
      providerName
        ? `Access to this ${providerName} model is not permitted for your account. Please choose another model or update your provider permissions.`
        : "Access to this model is not permitted for your account. Please choose another model or update your provider permissions.";
    return appendModelHint(base);
  }

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
    const base =
      providerName
        ? `The model you selected is no longer available from ${providerName}. Please pick a different model or update your Settings.`
        : "This model is no longer available. Please select a different model or remove it from Settings if it's disabled.";
    return appendModelHint(base);
  }

  if (errorMessageLower.includes("no endpoints found")) {
    const base =
      providerName
        ? `${providerName} cannot reach the requested model right now. Please choose another model or switch providers.`
        : "The selected provider does not currently offer this model. Choose another model or switch providers.";
    return appendModelHint(base);
  }

  // Common error patterns and their user-friendly messages
  if (errorMessage.includes("Documents read from or written to")) {
    return "I encountered a temporary issue while processing your message. Please try again.";
  }

  if (
    errorMessageLower.includes("api key") ||
    errorMessageLower.includes("authentication") ||
    errorMessageLower.includes("unauthorized") ||
    errorMessageLower.includes("invalid credentials")
  ) {
    const base =
      providerName
        ? `Authentication with ${providerName} failed: ${errorMessage}`
        : errorMessage;
    return appendModelHint(base);
  }

  if (errorMessageLower.includes("rate limit") || errorMessageLower.includes("429")) {
    return "The AI service is currently busy. Please wait a moment and try again.";
  }

  if (errorMessageLower.includes("timeout") || errorMessageLower.includes("timed out")) {
    return "The response took too long. Please try again with a shorter message.";
  }

  if (
    errorMessageLower.includes("network") ||
    errorMessageLower.includes("fetch") ||
    errorMessageLower.includes("econnrefused") ||
    errorMessageLower.includes("econnreset") ||
    errorMessageLower.includes("enotfound") ||
    errorMessageLower.includes("socket hang up") ||
    errorMessageLower.includes("service unavailable") ||
    errorMessageLower.includes("503") ||
    errorMessageLower.includes("unreachable")
  ) {
    const base =
      providerName
        ? `I'm having trouble connecting to ${providerName}. Please check the provider status or try again in a moment.`
        : "I'm having trouble connecting to the AI service. Please check your connection and try again.";
    return appendModelHint(base);
  }

  if (
    errorMessageLower.includes("context length") ||
    errorMessageLower.includes("token")
  ) {
    return "Your conversation has become too long. Please start a new conversation.";
  }

  // Generic fallback
  const base = "I encountered an unexpected error. Please try again or contact support if the issue persists.";
  if (statusCode) {
    return appendModelHint(`${base} (provider status code: ${statusCode}).`);
  }
  return appendModelHint(base);
};
