import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  CheckCircleIcon,
  CircleIcon,
  KeyIcon,
  LightningIcon,
  SidebarSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAction } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { CACHE_KEYS, get as getLS, set as setLS } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUI } from "@/providers/ui-provider";
import { useUserDataContext } from "@/providers/user-data-context";
import type { Attachment, ReasoningConfig } from "@/types";
import { ChatInput, type ChatInputRef } from "./input";
import { SimplePrompts } from "./prompts-ticker";

const SetupChecklist = () => {
  const { hasUserApiKeys, hasUserModels, user, capabilitiesReady } =
    useUserDataContext();
  const [isDismissed, setIsDismissed] = useState<boolean>(() =>
    getLS<boolean>(CACHE_KEYS.setupChecklistDismissed, false)
  );

  const handleDismiss = () => {
    setLS<boolean>(CACHE_KEYS.setupChecklistDismissed, true);
    setIsDismissed(true);
  };

  const isAnonymous = user?.isAnonymous ?? true;
  // Avoid showing while capability data is still resolving to prevent flicker
  if (
    !capabilitiesReady ||
    isAnonymous ||
    isDismissed ||
    (hasUserApiKeys && hasUserModels)
  ) {
    return null;
  }

  return (
    <div className="mx-auto mt-2 max-w-sm sm:mt-4 sm:max-w-md">
      <div
        aria-live="polite"
        className="relative rounded-md bg-muted/20 p-2.5 shadow-sm"
      >
        <Button
          aria-label="Dismiss checklist"
          className="absolute right-1.5 top-1.5 h-5 w-5 p-0 hover:bg-muted/70"
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
        >
          <XIcon className="size-2.5" />
        </Button>
        <div className="pr-6">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            Next Steps
          </h3>
          <div className="stack-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-left">
              {hasUserApiKeys ? (
                <CheckCircleIcon className="size-3 shrink-0 text-success" />
              ) : (
                <CircleIcon className="size-3 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "flex-1 text-muted-foreground transition-colors text-left",
                  hasUserApiKeys && "opacity-50"
                )}
              >
                Add your API keys
              </span>
              {!hasUserApiKeys && (
                <Link to={ROUTES.SETTINGS.API_KEYS}>
                  <Button
                    className="gap-1 bg-background/50 text-xs"
                    size="sm"
                    variant="outline"
                  >
                    <KeyIcon className="size-3" />
                    Go to API Keys
                  </Button>
                </Link>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-left">
              {hasUserModels ? (
                <CheckCircleIcon className="size-3 shrink-0 text-success" />
              ) : (
                <CircleIcon className="size-3 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "flex-1 text-muted-foreground transition-colors text-left",
                  hasUserModels && "opacity-50"
                )}
              >
                Enable AI models
              </span>
              {hasUserApiKeys && !hasUserModels && (
                <Link to={ROUTES.SETTINGS.TEXT_MODELS}>
                  <Button
                    className="gap-1 bg-background/50 text-xs"
                    size="sm"
                    variant="outline"
                  >
                    <LightningIcon className="size-3" />
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

const ChatSection = () => {
  const {
    canSendMessage,
    hasMessageLimit,
    hasUnlimitedCalls,
    monthlyUsage,
    user,
  } = useUserDataContext();
  const { selectedModel } = useSelectedModel();
  const isLoading = !user;
  const chatInputRef = useRef<ChatInputRef>(null);
  // Use unified action for conversation creation + first message
  const startConversation = useAction(api.conversations.startConversation);
  const navigate = useNavigate();
  const { isPrivateMode } = usePrivateMode();

  const handleSendMessage = useCallback(
    (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig,
      temperature?: number
    ) => {
      if (isPrivateMode) {
        navigate(ROUTES.PRIVATE_CHAT, {
          state: {
            initialMessage: content,
            attachments,
            personaId,
            reasoningConfig,
            temperature,
          },
        });
        return;
      }

      // Generate client-side UUID for instant navigation
      const clientId = crypto.randomUUID();

      // Navigate IMMEDIATELY to the conversation URL (before action completes)
      // The conversation page shows optimistic UI until real messages arrive
      navigate(ROUTES.CHAT_CONVERSATION(clientId), {
        state: {
          initialMessage: {
            content,
            attachments,
            personaId,
            reasoningConfig,
            temperature,
            model: selectedModel?.modelId,
            provider: selectedModel?.provider,
          },
        },
      });

      // Start conversation: creates conversation + sends first message atomically
      startConversation({
        clientId,
        content,
        personaId: personaId ?? undefined,
        attachments,
        model: selectedModel?.modelId,
        provider: selectedModel?.provider,
        reasoningConfig:
          reasoningConfig?.enabled && reasoningConfig.effort
            ? {
                enabled: reasoningConfig.enabled,
                effort: reasoningConfig.effort,
                maxTokens: reasoningConfig.maxTokens,
              }
            : undefined,
        temperature,
      }).catch(err => {
        // If action fails, the conversation page will show an error
        console.error("Failed to start conversation:", err);
      });
    },
    [navigate, isPrivateMode, startConversation, selectedModel]
  );

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage]
  );

  const hasWarning = useMemo(() => {
    const remaining = monthlyUsage?.remainingMessages ?? 0;
    const showLimitWarning =
      hasMessageLimit && remaining > 0 && canSendMessage && !hasUnlimitedCalls;
    const showLimitReached =
      hasMessageLimit && !canSendMessage && !hasUnlimitedCalls;
    return showLimitWarning || showLimitReached;
  }, [hasMessageLimit, canSendMessage, hasUnlimitedCalls, monthlyUsage]);

  const chatInputProps = {
    hasExistingMessages: false,
    isLoading: false, // No loading state needed - navigation is instant
    isStreaming: false,
    onStop: () => undefined,
    onSendMessage: handleSendMessage,
  };

  return (
    <div className="px-3 sm:px-6">
      <div className="relative mx-auto w-full max-w-3xl">
        <SimplePrompts
          hasReachedLimit={!canSendMessage}
          hasWarning={hasWarning}
          isAnonymous={user?.isAnonymous ?? true}
          userLoading={isLoading}
          onQuickPrompt={handleQuickPrompt}
        />
        <ChatInput ref={chatInputRef} {...chatInputProps} autoFocus />
      </div>
    </div>
  );
};

export const ChatZeroState = () => {
  const { isSidebarVisible, setSidebarVisible } = useUI();
  const { isPrivateMode } = usePrivateMode();

  return (
    <div className="flex h-full w-full max-w-full flex-col overflow-hidden">
      {/* Header with sidebar toggle */}
      <div className="px-3 sm:px-6">
        <div className="relative flex w-full items-center justify-between gap-1.5 py-4 sm:gap-2 z-sidebar">
          {!(isSidebarVisible || isPrivateMode) && (
            <Button
              size="icon-sm"
              title="Expand sidebar"
              variant="ghost"
              onClick={() => setSidebarVisible(true)}
            >
              <SidebarSimpleIcon className="size-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 h-full w-full max-w-full flex-col justify-end overflow-hidden sm:flex sm:h-full sm:items-center sm:justify-center">
        <div className="mx-auto flex w-full min-w-0 flex-col justify-end sm:block sm:h-auto">
          <div className="hidden text-center sm:block stack-lg sm:stack-xl">
            <ChatSection />
            <SetupChecklist />
          </div>

          <div className="flex-shrink-0 stack-lg sm:hidden">
            <SetupChecklist />
            <ChatSection />
          </div>
        </div>
      </div>
    </div>
  );
};
