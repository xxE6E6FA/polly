import {
  CheckCircleIcon,
  XIcon,
  KeyIcon,
  LightningIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { PromptsTickerWrapper } from "./prompts-ticker";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUser } from "@/hooks/use-user";
import { ChatInput, ChatInputRef } from "./chat-input";
import { useRef, useState, useEffect, useMemo } from "react";
import { useCreateConversation } from "@/hooks/use-conversations";
import { useNavigate } from "react-router";
import { ROUTES } from "@/lib/routes";

function SetupChecklist({
  hasApiKeys,
  hasEnabledModels,
}: {
  hasApiKeys: boolean;
  hasEnabledModels: boolean;
}) {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("setup-checklist-dismissed");
    setIsDismissed(dismissed === "true");
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("setup-checklist-dismissed", "true");
    setIsDismissed(true);
  };

  const needsSetup = !hasApiKeys || !hasEnabledModels;

  if (!needsSetup || isDismissed) return null;

  return (
    <div className="mt-4 sm:mt-6 max-w-sm sm:max-w-md mx-auto">
      <div className="bg-muted/20 rounded-md border border-border/30 p-3 relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-muted/50"
        >
          <XIcon className="w-3 h-3" />
        </Button>
        <div className="pr-6">
          <h3 className="text-xs font-medium mb-4 flex items-center gap-1.5">
            Next Steps
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              {hasApiKeys ? (
                <CheckCircleIcon className="w-3 h-3 text-success shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-muted-foreground/30 shrink-0" />
              )}
              <span
                className={
                  hasApiKeys
                    ? "text-muted-foreground line-through flex-1"
                    : "text-muted-foreground flex-1"
                }
              >
                Add your API keys
              </span>
              {!hasApiKeys && (
                <Link to={ROUTES.SETTINGS.API_KEYS}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1 bg-background/50"
                  >
                    <KeyIcon className="h-3 w-3" />
                    Go to API Keys
                  </Button>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {hasEnabledModels ? (
                <CheckCircleIcon className="w-3 h-3 text-success shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-muted-foreground/30 shrink-0" />
              )}
              <span
                className={
                  hasEnabledModels
                    ? "text-muted-foreground line-through flex-1"
                    : "text-muted-foreground flex-1"
                }
              >
                Enable AI models
              </span>
              {hasApiKeys && !hasEnabledModels && (
                <Link to={ROUTES.SETTINGS.MODELS}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1 bg-background/50"
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
}

function Mascot({ isMobile }: { isMobile: boolean }) {
  const sizeClasses = isMobile ? "w-32 h-32" : "w-20 h-20 sm:w-24 sm:h-24";
  const marginClasses = isMobile ? "mb-4" : "mb-3 sm:mb-4";

  return (
    <div className={`flex justify-center ${marginClasses}`}>
      <div className="relative">
        <img
          src="/polly-mascot.png"
          alt="Polly AI Mascot"
          className={`${sizeClasses} object-contain drop-shadow-lg relative z-10`}
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-accent-coral/15 via-accent-orange/15 to-accent-yellow/15 rounded-full blur-lg opacity-50 scale-110"></div>
      </div>
    </div>
  );
}

function Heading({ isMobile }: { isMobile: boolean }) {
  const titleClasses = isMobile
    ? "text-2xl font-semibold text-foreground tracking-tight"
    : "text-xl sm:text-2xl font-semibold text-foreground tracking-tight";

  return (
    <>
      <h1 className={titleClasses}>What&apos;s on your mind?</h1>
    </>
  );
}

function ConditionalSetupChecklist({
  isAnonymous,
  hasApiKeys,
  hasEnabledModels,
  isLoadingStatus,
}: {
  isAnonymous: boolean;
  hasApiKeys: boolean | undefined;
  hasEnabledModels: boolean | undefined;
  isLoadingStatus: boolean;
}) {
  // For anonymous users, don't show anything
  if (isAnonymous) {
    return null;
  }

  // Don't show anything while loading
  if (isLoadingStatus) {
    return null;
  }

  // Once loaded, show checklist if needed
  if (hasApiKeys !== undefined && hasEnabledModels !== undefined) {
    if (!hasApiKeys || !hasEnabledModels) {
      return (
        <SetupChecklist
          hasApiKeys={!!hasApiKeys}
          hasEnabledModels={!!hasEnabledModels}
        />
      );
    }
  }

  return null;
}

export function ChatZeroState() {
  const {
    user,
    isLoading: userLoading,
    canSendMessage,
    remainingMessages,
    messageCount,
    hasMessageLimit,
    hasUnlimitedCalls,
  } = useUser();
  const chatInputRef = useRef<ChatInputRef>(null);
  const mobileChatInputRef = useRef<ChatInputRef>(null);
  const { createNewConversationWithResponse } = useCreateConversation();
  const navigate = useNavigate();

  // Track if we're on mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const hasEnabledModels = useQuery(
    api.userModels.hasUserModels,
    user && !user.isAnonymous ? {} : "skip"
  );
  const hasApiKeys = useQuery(
    api.apiKeys.hasAnyApiKey,
    user && !user.isAnonymous ? {} : "skip"
  );

  const handleQuickPrompt = async (prompt: string) => {
    // Use the appropriate input based on current viewport
    const targetInput = isMobile
      ? mobileChatInputRef.current
      : chatInputRef.current;

    if (targetInput) {
      targetInput.setInput(prompt);
      targetInput.focus();
    } else {
      // Fallback: create conversation directly
      const conversationId = await createNewConversationWithResponse({
        firstMessage: prompt,
        userId: user?._id,
        generateTitle: true,
      });
      if (conversationId) {
        navigate(ROUTES.CHAT_CONVERSATION(conversationId));
      }
    }
  };

  const chatInputProps = {
    hasExistingMessages: false,
    isLoading: false,
    isStreaming: false,
    onStop: () => {},
    placeholder: "Ask me anything...",
  };

  // Only show as anonymous after we've loaded user data
  const isAnonymous = userLoading ? false : (user?.isAnonymous ?? true);

  // Check if we're loading API/model status for authenticated users
  const isLoadingStatus =
    !isAnonymous &&
    (hasApiKeys === undefined || hasEnabledModels === undefined);

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
    <div className="h-full flex flex-col sm:flex sm:h-full sm:items-center sm:justify-center w-full max-w-full overflow-hidden">
      <div className="mx-auto w-full min-w-0 h-full sm:h-auto flex flex-col sm:block">
        <div className="flex-1 flex flex-col items-center justify-center sm:hidden">
          <div className="text-center space-y-4">
            <Mascot isMobile={true} />
            <Heading isMobile={true} />
          </div>
        </div>

        {/* Desktop: Original centered layout */}
        <div className="hidden sm:block text-center space-y-6 sm:space-y-8 max-w-full">
          <div className="space-y-3 sm:space-y-4">
            <Mascot isMobile={false} />
            <Heading isMobile={false} />
          </div>

          <div className="relative">
            <PromptsTickerWrapper
              onQuickPrompt={handleQuickPrompt}
              hasReachedLimit={!canSendMessage}
              remainingMessages={remainingMessages}
              isAnonymous={isAnonymous}
              userLoading={userLoading}
              hasWarning={hasWarning}
            />
            <ChatInput ref={chatInputRef} {...chatInputProps} />
          </div>

          <ConditionalSetupChecklist
            isAnonymous={isAnonymous}
            hasApiKeys={hasApiKeys}
            hasEnabledModels={hasEnabledModels}
            isLoadingStatus={isLoadingStatus}
          />
        </div>

        {/* Mobile: Bottom section with checklist and chat input */}
        <div className="flex-shrink-0 sm:hidden space-y-4">
          <ConditionalSetupChecklist
            isAnonymous={isAnonymous}
            hasApiKeys={hasApiKeys}
            hasEnabledModels={hasEnabledModels}
            isLoadingStatus={isLoadingStatus}
          />

          <div className="relative">
            <PromptsTickerWrapper
              onQuickPrompt={handleQuickPrompt}
              hasReachedLimit={!canSendMessage}
              remainingMessages={remainingMessages}
              isAnonymous={isAnonymous}
              userLoading={userLoading}
              hasWarning={hasWarning}
            />
            <ChatInput ref={mobileChatInputRef} {...chatInputProps} />
          </div>
        </div>
      </div>
    </div>
  );
}
