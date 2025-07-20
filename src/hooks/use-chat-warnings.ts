import { useCallback, useMemo } from "react";
import { useUserDataContext } from "@/providers/user-data-context";
import { useSet } from "./use-state-management";

export function useChatWarnings() {
  const {
    hasMessageLimit,
    canSendMessage,
    monthlyUsage,
    hasUserApiKeys,
    hasUnlimitedCalls,
    user,
  } = useUserDataContext();
  const isNoUser = user === null;

  const { has: isDismissed, add: dismissWarning } = useSet<string>();
  const warningDismissalKey = `warning-${monthlyUsage?.monthlyMessagesSent ?? 0}`;

  const showLimitWarning = useMemo(() => {
    if (isNoUser) {
      return false;
    }
    if (!(hasMessageLimit && canSendMessage) || hasUnlimitedCalls) {
      return false;
    }
    if (user?.isAnonymous) {
      return Boolean(user?.messagesSent);
    }
    const effectiveRemainingMessages = monthlyUsage?.remainingMessages ?? 0;
    return (
      effectiveRemainingMessages < 10 &&
      effectiveRemainingMessages > 0 &&
      !isDismissed(warningDismissalKey)
    );
  }, [
    isNoUser,
    hasMessageLimit,
    canSendMessage,
    hasUnlimitedCalls,
    monthlyUsage?.remainingMessages,
    isDismissed,
    warningDismissalKey,
    user?.isAnonymous,
    user?.messagesSent,
  ]);

  const showLimitReached = isNoUser
    ? false
    : hasMessageLimit && !canSendMessage && !hasUnlimitedCalls;

  const limitWarningMessage = useMemo(() => {
    if (isNoUser) {
      return { text: "" };
    }
    if (user.isAnonymous) {
      const remainingMessages = monthlyUsage?.remainingMessages ?? 0;
      return {
        text: `${remainingMessages} message${
          remainingMessages === 1 ? "" : "s"
        } remaining.`,
        link: { text: "Sign in", href: "/auth" },
        suffix: " for higher limits.",
      };
    }
    if (!hasUnlimitedCalls) {
      return {
        text: `${monthlyUsage?.remainingMessages || 0} monthly message${
          monthlyUsage?.remainingMessages === 1 ? "" : "s"
        } remaining. `,
        suffix: hasUserApiKeys
          ? "Use BYOK models for unlimited chats."
          : "Add API keys for unlimited chats.",
      };
    }
    return { text: "" };
  }, [
    isNoUser,
    user?.isAnonymous,
    monthlyUsage?.remainingMessages,
    hasUnlimitedCalls,
    hasUserApiKeys,
  ]);

  const limitReachedMessage = useMemo(() => {
    if (isNoUser) {
      return { text: "" };
    }
    if (user?.isAnonymous) {
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
  }, [isNoUser, user?.isAnonymous, hasUserApiKeys]);

  const handleDismissWarning = useCallback(() => {
    dismissWarning(warningDismissalKey);
  }, [dismissWarning, warningDismissalKey]);

  return {
    showLimitWarning,
    showLimitReached,
    limitWarningMessage,
    limitReachedMessage,
    dismissWarning: handleDismissWarning,
    canSendMessage,
    hasMessageLimit,
  };
}
