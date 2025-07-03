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

  // Calculate warning states with improved logic
  const showLimitWarning = useMemo(() => {
    if (!hasMessageLimit || !canSendMessage || hasUnlimitedCalls) {
      return false;
    }

    // For anonymous users: show warning if they have sent any messages
    if (isAnonymous) {
      return messageCount > 0 && !dismissedWarnings.has(warningDismissalKey);
    }

    // For signed-in users: only show warning when they have less than 10 messages remaining
    const effectiveRemainingMessages =
      monthlyUsage?.remainingMessages ?? remainingMessages;
    return (
      effectiveRemainingMessages < 10 &&
      effectiveRemainingMessages > 0 &&
      !dismissedWarnings.has(warningDismissalKey)
    );
  }, [
    hasMessageLimit,
    canSendMessage,
    hasUnlimitedCalls,
    isAnonymous,
    messageCount,
    dismissedWarnings,
    warningDismissalKey,
    monthlyUsage?.remainingMessages,
    remainingMessages,
  ]);

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
