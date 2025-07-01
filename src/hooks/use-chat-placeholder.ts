import { useMemo } from "react";

type UseChatPlaceholderOptions = {
  placeholder?: string;
  canSendMessage: boolean;
  hasMessageLimit: boolean;
  isAnonymous: boolean;
  hasUserApiKeys: boolean | undefined;
};

export function useChatPlaceholder({
  placeholder,
  canSendMessage,
  hasMessageLimit,
  isAnonymous,
  hasUserApiKeys,
}: UseChatPlaceholderOptions) {
  const placeholderText = useMemo(() => {
    // Use custom placeholder if provided
    if (placeholder) {
      return placeholder;
    }

    // Message limit reached scenarios
    if (!canSendMessage && hasMessageLimit) {
      if (isAnonymous) {
        return "Message limit reached. Sign in to continue chatting...";
      }
      return hasUserApiKeys === true
        ? "Monthly Polly model limit reached. Use BYOK models or wait for reset..."
        : "Monthly limit reached. Add API keys to use BYOK models...";
    }

    // Default placeholder
    return "Ask me anything...";
  }, [
    placeholder,
    canSendMessage,
    hasMessageLimit,
    isAnonymous,
    hasUserApiKeys,
  ]);

  return placeholderText;
}
