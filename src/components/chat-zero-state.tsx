import type { Id } from "@convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  CheckCircleIcon,
  CircleIcon,
  KeyIcon,
  LightningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { useChatService } from "@/hooks/use-chat-service";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { useUserData } from "@/hooks/use-user-data";
import { get as getLS, set as setLS } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Attachment, ReasoningConfig } from "@/types";
import { ChatInput, type ChatInputRef } from "./chat-input";
import { PromptsTickerWrapper } from "./prompts-ticker";

const SetupChecklist = ({
  hasApiKeys,
  hasEnabledModels,
  isAnonymous,
  isHydrated,
}: {
  hasApiKeys: boolean | undefined;
  hasEnabledModels: boolean | undefined;
  isAnonymous: boolean;
  isHydrated: boolean;
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = getLS<boolean>("setup-checklist/dismissed/v1", false);
    setIsDismissed(dismissed);
  }, []);

  const handleDismiss = () => {
    setLS<boolean>("setup-checklist/dismissed/v1", true);
    setIsDismissed(true);
  };

  if (
    isAnonymous ||
    isDismissed ||
    !isHydrated ||
    (hasApiKeys && hasEnabledModels)
  ) {
    return null;
  }

  return (
    <div className="mx-auto mt-2 max-w-sm sm:mt-4 sm:max-w-md">
      <div
        aria-live="polite"
        className="relative rounded-md border border-border/30 bg-muted/20 p-2.5"
      >
        <Button
          aria-label="Dismiss checklist"
          className="absolute right-1.5 top-1.5 h-5 w-5 p-0 hover:bg-muted/50"
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
        >
          <XIcon className="h-2.5 w-2.5" />
        </Button>
        <div className="pr-6">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            Next Steps
          </h3>
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-left">
              {hasApiKeys ? (
                <CheckCircleIcon className="h-3 w-3 shrink-0 text-success" />
              ) : (
                <CircleIcon className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "flex-1 text-muted-foreground transition-colors text-left",
                  hasApiKeys && "opacity-60"
                )}
              >
                Add your API keys
              </span>
              {!hasApiKeys && (
                <Link to={ROUTES.SETTINGS.API_KEYS}>
                  <Button
                    className="gap-1 bg-background/50 text-xs"
                    size="sm"
                    variant="outline"
                  >
                    <KeyIcon className="h-3 w-3" />
                    Go to API Keys
                  </Button>
                </Link>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-left">
              {hasEnabledModels ? (
                <CheckCircleIcon className="h-3 w-3 shrink-0 text-success" />
              ) : (
                <CircleIcon className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "flex-1 text-muted-foreground transition-colors text-left",
                  hasEnabledModels && "opacity-60"
                )}
              >
                Enable AI models
              </span>
              {hasApiKeys && !hasEnabledModels && (
                <Link to={ROUTES.SETTINGS.MODELS}>
                  <Button
                    className="gap-1 bg-background/50 text-xs"
                    size="sm"
                    variant="outline"
                  >
                    <LightningIcon className="h-3 w-3" />
                    View Models
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Mascot = ({ isMobile }: { isMobile: boolean }) => {
  const sizeClasses = isMobile ? "w-28 h-28" : "w-16 h-16 sm:w-20 sm:h-20";
  const marginClasses = isMobile ? "mb-3" : "mb-2 sm:mb-3";

  return (
    <div className={`flex justify-center ${marginClasses}`}>
      <div className="relative">
        <img
          alt="Polly AI Mascot"
          className={`${sizeClasses} relative z-10 object-contain drop-shadow-lg`}
          loading="eager"
          src="/polly-mascot.png"
        />
        <div className="absolute inset-0 scale-110 rounded-full bg-gradient-to-br from-accent-coral/15 via-accent-orange/15 to-accent-yellow/15 opacity-50 blur-lg" />
      </div>
    </div>
  );
};

const Heading = ({ isMobile }: { isMobile: boolean }) => {
  const titleClasses = isMobile
    ? "text-xl font-semibold text-foreground tracking-tight"
    : "text-lg sm:text-xl font-semibold text-foreground tracking-tight";

  return <h1 className={titleClasses}>What&apos;s on your mind?</h1>;
};

export const ChatZeroState = () => {
  const userData = useUserData();
  const user = userData?.user;
  const isLoading = !userData;
  const canSendMessage = userData?.canSendMessage ?? false;
  const messageCount = userData?.messageCount ?? 0;
  const hasMessageLimit = userData?.hasMessageLimit ?? false;
  const hasUnlimitedCalls = userData?.hasUnlimitedCalls ?? false;
  const authToken = useAuthToken();
  const queryUserId = useQueryUserId();
  const chatInputRef = useRef<ChatInputRef>(null);
  const mobileChatInputRef = useRef<ChatInputRef>(null);
  const chatService = useChatService({
    overrideMode: "regular",
  });
  const navigate = useNavigate();
  const { isPrivateMode } = usePrivateMode();

  // Use cached user data instead of duplicate queries
  const hasUserApiKeys = userData?.hasUserApiKeys ?? false;
  const hasUserModels = userData?.hasUserModels ?? false;
  const isHydrated = userData?.isHydrated ?? false;

  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (isPrivateMode) {
        navigate(ROUTES.PRIVATE_CHAT, {
          state: {
            initialMessage: content,
            attachments,
            personaId,
            reasoningConfig,
          },
        });
        return;
      }

      // Create new conversation
      const conversationId = await chatService.createConversation({
        firstMessage: content,
        userId: queryUserId || undefined,
        generateTitle: true,
        attachments,
        personaId,
        reasoningConfig,
      });

      if (conversationId) {
        navigate(ROUTES.CHAT_CONVERSATION(conversationId));
      }
    },
    [chatService.createConversation, queryUserId, navigate, isPrivateMode]
  );

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage]
  );

  const chatInputProps = {
    hasExistingMessages: false,
    isLoading: false,
    isStreaming: false,
    onStop: () => {
      // No-op for zero state
    },
    onSendMessage: handleSendMessage,
  };

  // Determine authentication state considering both cached user data and live auth token
  // If we have an auth token, the user is definitely authenticated (even if cached data is stale)
  const isAnonymous = !(isLoading || authToken) && (user?.isAnonymous ?? true);

  // Calculate if a warning will be shown
  const hasWarning = useMemo(() => {
    const showLimitWarning =
      hasMessageLimit &&
      messageCount > 0 &&
      canSendMessage &&
      !hasUnlimitedCalls;
    const showLimitReached =
      hasMessageLimit && !canSendMessage && !hasUnlimitedCalls;

    return showLimitWarning || showLimitReached;
  }, [hasMessageLimit, messageCount, canSendMessage, hasUnlimitedCalls]);

  return (
    <div className="flex h-full w-full max-w-full flex-col overflow-hidden sm:flex sm:h-full sm:items-center sm:justify-center">
      <div className="mx-auto flex h-full w-full min-w-0 flex-col sm:block sm:h-auto">
        <div className="flex flex-1 flex-col items-center justify-center sm:hidden">
          <div className="space-y-4 text-center">
            <Mascot isMobile />
            <Heading isMobile />
          </div>
        </div>

        {/* Desktop: Original centered layout */}
        <div className="hidden max-w-full space-y-4 text-center sm:block sm:space-y-6">
          <div className="space-y-2 sm:space-y-3">
            <Mascot isMobile={false} />
            <Heading isMobile={false} />
          </div>

          <div className="relative">
            <PromptsTickerWrapper
              hasReachedLimit={!canSendMessage}
              hasWarning={hasWarning}
              isAnonymous={isAnonymous}
              userLoading={isLoading}
              onQuickPrompt={handleQuickPrompt}
            />
            <ChatInput ref={chatInputRef} {...chatInputProps} />
          </div>

          <SetupChecklist
            hasApiKeys={hasUserApiKeys}
            hasEnabledModels={hasUserModels}
            isAnonymous={isAnonymous}
            isHydrated={isHydrated}
          />
        </div>

        {/* Mobile: Bottom section with checklist and chat input */}
        <div className="flex-shrink-0 space-y-4 sm:hidden">
          <SetupChecklist
            hasApiKeys={hasUserApiKeys}
            hasEnabledModels={hasUserModels}
            isAnonymous={isAnonymous}
            isHydrated={isHydrated}
          />

          <div className="relative">
            <PromptsTickerWrapper
              hasReachedLimit={!canSendMessage}
              hasWarning={hasWarning}
              isAnonymous={isAnonymous}
              userLoading={isLoading}
              onQuickPrompt={handleQuickPrompt}
            />
            <ChatInput ref={mobileChatInputRef} {...chatInputProps} />
          </div>
        </div>
      </div>
    </div>
  );
};
