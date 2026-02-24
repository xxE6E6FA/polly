import { useCallback, useMemo, useState } from "react";
import { ChatWarningBanner } from "@/components/ui/chat-warning-banner";
import { useConversationLimit } from "@/hooks";
import {
  useUserCapabilities,
  useUserIdentity,
  useUserUsage,
} from "@/providers/user-data-context";
import type { ConversationId } from "@/types";

type WarningMessage = {
  text: string;
  link?: { text: string; href: string };
  suffix?: string;
};

type WarningState = {
  type: "warning" | "error";
  message: WarningMessage;
  isDismissed: boolean;
} | null;

interface WarningBannersProps {
  hasExistingMessages?: boolean;
  conversationId?: ConversationId;
}

export function WarningBanners({
  hasExistingMessages,
  conversationId,
}: WarningBannersProps) {
  const { hasMessageLimit, monthlyUsage, hasUnlimitedCalls } = useUserUsage();
  const { user } = useUserIdentity();
  const { canSendMessage, hasUserApiKeys } = useUserCapabilities();
  const { isAtLimit, isNearLimit, percentUsed } =
    useConversationLimit(conversationId);

  const isAnonymous = !!user?.isAnonymous;

  const [dismissedWarning, setDismissedWarning] = useState<string | null>(null);

  const warningState = useMemo((): WarningState => {
    // No user record yet (still loading)
    if (!user) {
      return null;
    }

    // Context limit takes priority over quota warnings
    if (isAtLimit) {
      const warningKey = "context-limit-reached";
      if (dismissedWarning === warningKey) {
        return null;
      }
      return {
        type: "error",
        message: {
          text: "This conversation has reached its context limit.",
          suffix: "Continue in a new conversation to keep chatting.",
        },
        isDismissed: false,
      };
    }

    if (isNearLimit) {
      const warningKey = "context-limit-warning";
      if (dismissedWarning === warningKey) {
        return null;
      }
      return {
        type: "warning",
        message: {
          text: `Approaching context limit — ${percentUsed}% used.`,
          suffix: "Consider continuing in a new conversation soon.",
        },
        isDismissed: false,
      };
    }

    // If user has unlimited calls, no quota warning needed
    if (hasUnlimitedCalls) {
      return null;
    }

    // If no message limit, no warning needed
    if (!hasMessageLimit) {
      return null;
    }

    const remainingMessages = monthlyUsage?.remainingMessages ?? 0;
    const isLimitReached = !canSendMessage;
    const warningKey = isLimitReached ? "limit-reached" : "limit-warning";

    // Check if this specific warning is dismissed
    if (dismissedWarning === warningKey) {
      return null;
    }

    // Limit reached (error state)
    if (isLimitReached) {
      if (isAnonymous) {
        return {
          type: "error",
          message: {
            text: "Message limit reached.",
            link: { text: "Sign up", href: "/auth" },
            suffix: "to continue chatting without limits.",
          },
          isDismissed: false,
        };
      }
      return {
        type: "error",
        message: {
          text: "Monthly Polly model limit reached.",
          suffix: hasUserApiKeys
            ? "Use your BYOK models to continue chatting."
            : "Add API keys to access BYOK models.",
        },
        isDismissed: false,
      };
    }

    // Limit warning (warning state) - only show if remaining messages < 10
    if (remainingMessages < 10 && remainingMessages > 0) {
      if (isAnonymous) {
        return {
          type: "warning",
          message: {
            text: `${remainingMessages} message${
              remainingMessages === 1 ? "" : "s"
            } remaining.`,
            link: { text: "Sign up", href: "/auth" },
            suffix: " for higher limits.",
          },
          isDismissed: false,
        };
      }
      return {
        type: "warning",
        message: {
          text: `${remainingMessages} monthly message${
            remainingMessages === 1 ? "" : "s"
          } remaining. `,
          suffix: hasUserApiKeys
            ? "Use BYOK models for unlimited chats."
            : "Add API keys for unlimited chats.",
        },
        isDismissed: false,
      };
    }

    return null;
  }, [
    hasMessageLimit,
    canSendMessage,
    hasUnlimitedCalls,
    monthlyUsage,
    hasUserApiKeys,
    user,
    isAnonymous,
    dismissedWarning,
    isAtLimit,
    isNearLimit,
    percentUsed,
  ]);

  const dismissWarning = useCallback(() => {
    if (warningState) {
      if (isAtLimit) {
        setDismissedWarning("context-limit-reached");
      } else if (isNearLimit) {
        setDismissedWarning("context-limit-warning");
      } else {
        const warningKey =
          warningState.type === "error" ? "limit-reached" : "limit-warning";
        setDismissedWarning(warningKey);
      }
    }
  }, [warningState, isAtLimit, isNearLimit]);

  if (!warningState) {
    return null;
  }

  if (!hasExistingMessages) {
    return (
      <div className="flex justify-center h-7 mb-3 transition-opacity duration-200">
        <ChatWarningBanner
          type={warningState.type}
          message={warningState.message}
          onDismiss={dismissWarning}
          variant="stable"
        />
      </div>
    );
  }

  return (
    <ChatWarningBanner
      type={warningState.type}
      message={warningState.message}
      onDismiss={dismissWarning}
      variant="floating"
    />
  );
}
