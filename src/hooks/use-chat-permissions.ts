import { useMemo } from "react";
import { useSelectedModel } from "./use-selected-model";
import { useUser } from "./use-user";

export function useChatPermissions() {
  const user = useUser();
  const { selectedModel } = useSelectedModel();

  const isPollyLimitReached = useMemo(() => {
    return (
      selectedModel?.free &&
      user.monthlyUsage?.remainingMessages === 0 &&
      !user.hasUnlimitedCalls
    );
  }, [
    selectedModel?.free,
    user.monthlyUsage?.remainingMessages,
    user.hasUnlimitedCalls,
  ]);

  const canSendMessage = useMemo(() => {
    return user.canSendMessage && !isPollyLimitReached;
  }, [user.canSendMessage, isPollyLimitReached]);

  const placeholderOverride = useMemo(() => {
    if (isPollyLimitReached) {
      return "Polly model limit reached. Switch to a BYOK model to continue.";
    }
    return undefined;
  }, [isPollyLimitReached]);

  return {
    isPollyLimitReached,
    canSendMessage,
    placeholderOverride,
    hasMessageLimit: user.hasMessageLimit,
    isAnonymous: user.isAnonymous,
    hasUserApiKeys: user.hasUserApiKeys,
  };
}
