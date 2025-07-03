import { useCallback, useMemo, useState } from "react";
import { useUser } from "./use-user";

export function useChatWarnings() {
  const {
    messageCount,
    remainingMessages,
    hasMessageLimit,
    canSendMessage,
    isAnonymous,
    monthlyUsage,
    hasUserApiKeys,
    hasUnlimitedCalls,
  } = useUser();

  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(
    new Set()
  );

  // Create a key based on messageCount for warning dismissal
  const warningDismissalKey = `warning-${messageCount}`;

  // Calculate warning states
  const showLimitWarning = useMemo(
    () =>
      hasMessageLimit &&
      messageCount > 0 &&
      canSendMessage &&
      !dismissedWarnings.has(warningDismissalKey) &&
      !hasUnlimitedCalls,
    [
      hasMessageLimit,
      messageCount,
      canSendMessage,
      dismissedWarnings,
      warningDismissalKey,
      hasUnlimitedCalls,
    ]
  );

  const showLimitReached = useMemo(
    () => hasMessageLimit && !canSendMessage && !hasUnlimitedCalls,
    [hasMessageLimit, canSendMessage, hasUnlimitedCalls]
  );

  // Generate warning messages
  const limitWarningMessage = useMemo(() => {
    if (isAnonymous) {
      return {
        text: `${remainingMessages} message${remainingMessages === 1 ? "" : "s"} remaining`,
        link: { text: "Sign in", href: "/auth" },
        suffix: "for unlimited chats",
      };
    }
    if (hasUnlimitedCalls) {
      return { text: "You have unlimited messages" };
    }
    return {
      text: `${monthlyUsage?.remainingMessages || 0} monthly message${
        monthlyUsage?.remainingMessages === 1 ? "" : "s"
      } remaining. `,
      suffix: hasUserApiKeys
        ? "Use BYOK models for unlimited chats"
        : "Add API keys for unlimited chats",
    };
  }, [
    isAnonymous,
    remainingMessages,
    hasUnlimitedCalls,
    monthlyUsage?.remainingMessages,
    hasUserApiKeys,
  ]);

  const limitReachedMessage = useMemo(() => {
    if (isAnonymous) {
      return {
        text: "Message limit reached.",
        link: { text: "Sign in", href: "/auth" },
        suffix: "to continue chatting without limits.",
      };
    }
    return {
      text: "Monthly Polly model limit reached.",
      suffix: hasUserApiKeys
        ? "Use your BYOK models to continue chatting."
        : "Add API keys to access BYOK models.",
    };
  }, [isAnonymous, hasUserApiKeys]);

  const dismissWarning = useCallback(() => {
    setDismissedWarnings(prev => new Set([...prev, warningDismissalKey]));
  }, [warningDismissalKey]);

  return {
    // State
    showLimitWarning,
    showLimitReached,

    // Messages
    limitWarningMessage,
    limitReachedMessage,

    // Actions
    dismissWarning,

    // User state (for convenience)
    canSendMessage,
    hasMessageLimit,
  };
}
