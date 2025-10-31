/**
 * Browser-side error handling for client streaming
 * Converts technical errors to user-friendly messages in private chats
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    // Model unavailability errors
    if (
      errorMessage.includes("model") &&
      (errorMessage.includes("not found") ||
        errorMessage.includes("not available") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("404") ||
        errorMessage.includes("deprecated") ||
        errorMessage.includes("disabled"))
    ) {
      return "This model is no longer available. Please select a different model or remove it from Settings if it's disabled.";
    }

    // API key errors
    if (
      errorMessage.includes("api key") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("authentication")
    ) {
      return "Invalid or missing API key. Please check your API key settings.";
    }

    // Rate limit errors
    if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
      return "Rate limit exceeded. Please try again in a few moments.";
    }

    // Network errors
    if (errorMessage.includes("fetch") || errorMessage.includes("network")) {
      return "Network error. Please check your internet connection.";
    }

    // Generic abort
    if (error.name === "AbortError") {
      return "Request was cancelled.";
    }

    // Return the original message if it's already user-friendly
    if (error.message.length < 100) {
      return error.message;
    }
  }

  return "An unexpected error occurred. Please try again.";
}
