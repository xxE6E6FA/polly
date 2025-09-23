import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  CheckCircleIcon,
  CircleIcon,
  KeyIcon,
  LightningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAction, useMutation } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChatInput, type ChatInputRef } from "@/components/chat-input";
import { Button } from "@/components/ui/button";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { startAuthorStream } from "@/lib/ai/http-stream";
import { CACHE_KEYS, get as getLS, set as setLS } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";

import type { Attachment, ReasoningConfig } from "@/types";
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
          <XIcon className="h-2.5 w-2.5" />
        </Button>
        <div className="pr-6">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            Next Steps
          </h3>
          <div className="stack-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-left">
              {hasUserApiKeys ? (
                <CheckCircleIcon className="h-3 w-3 shrink-0 text-success" />
              ) : (
                <CircleIcon className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "flex-1 text-muted-foreground transition-colors text-left",
                  hasUserApiKeys && "opacity-60"
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
                    <KeyIcon className="h-3 w-3" />
                    Go to API Keys
                  </Button>
                </Link>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-left">
              {hasUserModels ? (
                <CheckCircleIcon className="h-3 w-3 shrink-0 text-success" />
              ) : (
                <CircleIcon className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "flex-1 text-muted-foreground transition-colors text-left",
                  hasUserModels && "opacity-60"
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

const ChatSection = () => {
  const {
    canSendMessage,
    hasMessageLimit,
    hasUnlimitedCalls,
    monthlyUsage,
    user,
  } = useUserDataContext();
  const [selectedModel] = useSelectedModel();
  const authToken = useAuthToken();
  const isLoading = !user;
  const chatInputRef = useRef<ChatInputRef>(null);
  const createConversationAction = useAction(
    api.conversations.createConversationAction
  );
  const setStreaming = useMutation(api.conversations.setStreaming);
  const navigate = useNavigate();
  const { isPrivateMode } = usePrivateMode();
  // No token waiting; rely on cookie-based auth via credentials: 'include'

  const handleSendMessage = useCallback(
    async (
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

      const result = await createConversationAction({
        firstMessage: content,
        // Omit title to allow server-side title generation from first message
        attachments,
        personaId: personaId ?? undefined,
        reasoningConfig: reasoningConfig
          ? {
              enabled: reasoningConfig.enabled,
              effort: reasoningConfig.effort || "medium",
              maxTokens: reasoningConfig.maxTokens,
            }
          : undefined,
        model: selectedModel?.modelId,
        provider: selectedModel?.provider,
        temperature,
      });

      if (result?.conversationId) {
        // Navigate first to avoid any chance of stream startup blocking redirect
        navigate(ROUTES.CHAT_CONVERSATION(result.conversationId));

        // Optimistically mark as streaming so the sidebar updates immediately
        try {
          await setStreaming({
            conversationId: result.conversationId,
            isStreaming: true,
          });
        } catch {
          // best-effort only
        }

        // Start the author stream in the background using cookie-based auth
        if ("assistantMessageId" in result) {
          setTimeout(() => {
            (async () => {
              try {
                await startAuthorStream({
                  convexUrl: import.meta.env.VITE_CONVEX_URL,
                  authToken: authToken,
                  conversationId: result.conversationId,
                  assistantMessageId: result.assistantMessageId,
                  modelId: selectedModel?.modelId,
                  provider: selectedModel?.provider,
                  personaId: personaId ?? undefined,
                  reasoningConfig,
                  temperature,
                  onFinish: async () => {
                    try {
                      await setStreaming({
                        conversationId: result.conversationId,
                        isStreaming: false,
                      });
                    } catch {
                      // best-effort only
                    }
                  },
                });
              } catch {
                // Final fallback: do nothing
              }
            })();
          }, 0);
        }
      }
    },
    [
      navigate,
      isPrivateMode,
      createConversationAction,
      selectedModel,
      authToken,
      setStreaming,
    ]
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
    isLoading: false,
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
  return (
    <div className="flex h-full w-full max-w-full flex-col overflow-hidden sm:flex sm:h-full sm:items-center sm:justify-center">
      <div className="mx-auto flex h-full w-full min-w-0 flex-col sm:block sm:h-auto">
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
  );
};
