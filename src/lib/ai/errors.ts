export function getUserFriendlyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // API key errors
    if (
      error.message.includes("API key") ||
      error.message.includes("Unauthorized")
    ) {
      return "Invalid or missing API key. Please check your API key settings.";
    }

    // Rate limit errors
    if (error.message.includes("rate limit") || error.message.includes("429")) {
      return "Rate limit exceeded. Please try again in a few moments.";
    }

    // Network errors
    if (error.message.includes("fetch") || error.message.includes("network")) {
      return "Network error. Please check your internet connection.";
    }

    // Model errors
    if (error.message.includes("model")) {
      return "The selected model is not available. Please try a different model.";
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
