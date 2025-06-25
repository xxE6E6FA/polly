export const getUserFriendlyErrorMessage = (error: unknown): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Common error patterns and their user-friendly messages
  if (errorMessage.includes("Documents read from or written to")) {
    return "I encountered a temporary issue while processing your message. Please try again.";
  }

  if (
    errorMessage.includes("API key") ||
    errorMessage.includes("Authentication")
  ) {
    return errorMessage; // These are already user-friendly
  }

  if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
    return "The AI service is currently busy. Please wait a moment and try again.";
  }

  if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
    return "The response took too long. Please try again with a shorter message.";
  }

  if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
    return "I'm having trouble connecting to the AI service. Please check your connection and try again.";
  }

  if (
    errorMessage.includes("context length") ||
    errorMessage.includes("token")
  ) {
    return "Your conversation has become too long. Please start a new conversation.";
  }

  // Generic fallback
  return "I encountered an unexpected error. Please try again or contact support if the issue persists.";
};
