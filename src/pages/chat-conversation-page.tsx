import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex, useQuery } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { useLoaderData, useLocation, useNavigate } from "react-router-dom";
import { UnifiedChatView } from "@/components/chat";
import type { ImageRetryParams } from "@/components/chat/message/image-actions";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { OfflinePlaceholder } from "@/components/ui/offline-placeholder";
import { useChat } from "@/hooks/use-chat";
import { useConversationModelOverride } from "@/hooks/use-conversation-model-override";
import { useOnline } from "@/hooks/use-online";
import { retryImageGeneration } from "@/lib/ai/image-generation-handlers";
import { ROUTES } from "@/lib/routes";
import type { ConversationLoaderResult } from "@/loaders/conversation-loader";
import { useToast } from "@/providers/toast-context";
import { useChatInputStore } from "@/stores/chat-input-store";

import type {
  Attachment,
  ChatMessage,
  ChatStatus,
  ConversationId,
  ReasoningConfig,
} from "@/types";

// Type for initial message passed from home page navigation
type InitialMessageState = {
  content: string;
  attachments?: Attachment[];
  personaId?: Id<"personas"> | null;
  reasoningConfig?: ReasoningConfig;
  temperature?: number;
  model?: string;
  provider?: string;
};

/**
 * Creates optimistic messages for display while waiting for real data.
 * Includes stable displayKey values that are reused when real messages arrive
 * to prevent React from remounting components and resetting animations.
 */
function createOptimisticMessages(
  initialMessage: InitialMessageState,
  slug: string
): ChatMessage[] {
  return [
    {
      id: `optimistic-user-${slug}`,
      displayKey: `user-${slug}`,
      role: "user" as const,
      content: initialMessage.content,
      attachments: initialMessage.attachments,
      createdAt: Date.now(),
      isMainBranch: true,
    },
    {
      id: `optimistic-assistant-${slug}`,
      displayKey: `assistant-${slug}`,
      role: "assistant" as const,
      content: "",
      status: "streaming" as const,
      createdAt: Date.now(),
      isMainBranch: true,
    },
  ];
}

export default function ConversationRoute() {
  const { slug } = useLoaderData() as ConversationLoaderResult;
  const navigate = useNavigate();
  const location = useLocation();
  const convex = useConvex();
  const managedToast = useToast();
  const online = useOnline();

  // Get initial message from navigation state (for optimistic UI)
  const initialMessage = (
    location.state as { initialMessage?: InitialMessageState } | null
  )?.initialMessage;

  // Store in ref so we keep showing optimistic UI until real data arrives
  const initialMessageRef = useRef<InitialMessageState | null>(
    initialMessage ?? null
  );

  // Clear navigation state to prevent re-display on back/forward
  useEffect(() => {
    if (initialMessage) {
      window.history.replaceState({}, document.title);
    }
  }, [initialMessage]);

  // Query for conversation by slug
  const slugQuery = useQuery(api.conversations.getBySlug, { slug });
  const resolvedId = slugQuery?.resolvedId ?? null;

  // Get chat messages and actions
  const {
    messages: realMessages,
    isLoading: chatIsLoading,
    isStreaming: messageIsStreaming,
    sendMessage,
    editMessage,
    retryFromMessage,
    deleteMessage,
    stopGeneration,
  } = useChat({
    conversationId: resolvedId as ConversationId | undefined,
  });

  // Model override for this conversation
  useConversationModelOverride(
    resolvedId ? (resolvedId as ConversationId) : undefined,
    null
  );

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  // Determine display state
  const hasRealMessages = realMessages.length > 0;
  const isOptimistic = !!initialMessageRef.current && !hasRealMessages;

  // Track whether we've transitioned from optimistic to real messages
  // to preserve displayKey stability during streaming.
  // IMPORTANT: Must be set synchronously during render, not in an effect,
  // otherwise the first render with real messages won't have displayKey applied.
  const hasTransitionedRef = useRef(false);

  // Set transition flag synchronously when real messages arrive while we have an initial message
  // This ensures displayKey is applied on the SAME render where real messages first appear
  if (hasRealMessages && initialMessageRef.current) {
    hasTransitionedRef.current = true;
    initialMessageRef.current = null;
  }

  // Clear transition flag once the initial assistant message exists and streaming is complete.
  // We must wait for the assistant message before clearing — otherwise, in the intermediate
  // state where only the user message has arrived (assistant not yet created by startConversation),
  // the flag clears immediately (messageIsStreaming is false) and auto-retry fires, creating
  // a duplicate assistant response.
  const hasAssistantMessage = realMessages.some(m => m.role === "assistant");
  if (
    hasTransitionedRef.current &&
    !messageIsStreaming &&
    hasAssistantMessage
  ) {
    hasTransitionedRef.current = false;
  }

  // Messages to display with stable displayKey for React reconciliation
  const messages = (() => {
    if (isOptimistic && initialMessageRef.current) {
      return createOptimisticMessages(initialMessageRef.current, slug);
    }

    // When transitioning from optimistic to real, preserve displayKey
    // for the initial messages to prevent component remounting
    if (hasTransitionedRef.current && realMessages.length >= 2) {
      const firstUserIdx = realMessages.findIndex(m => m.role === "user");
      const firstAssistantIdx = realMessages.findIndex(
        m => m.role === "assistant"
      );

      // Only apply stable keys if we have the expected user + assistant pair
      if (firstUserIdx !== -1 && firstAssistantIdx !== -1) {
        return realMessages.map((msg, idx) => {
          if (idx === firstUserIdx && !msg.displayKey) {
            return { ...msg, displayKey: `user-${slug}` };
          }
          if (idx === firstAssistantIdx && !msg.displayKey) {
            return { ...msg, displayKey: `assistant-${slug}` };
          }
          return msg;
        });
      }
    }

    return realMessages;
  })();

  // Compute unified chat status
  const status: ChatStatus = (() => {
    if (isOptimistic || messageIsStreaming) {
      return "streaming";
    }
    if (chatIsLoading || hasApiKeys === undefined) {
      return "loading";
    }
    return "idle";
  })();

  // Conversation metadata
  const conversation = slugQuery?.conversation;
  const conversationTitle = conversation?.title ?? null;
  const pageTitle = conversationTitle?.trim() || "Polly";

  // Branching conversation action
  const createBranchingConversationAction = useAction(
    api.conversations.createBranchingConversation
  );

  const handleSendAsNewConversation = useCallback(
    async (
      content: string,
      shouldNavigate: boolean,
      attachments?: Attachment[],
      contextSummary?: string,
      sourceConversationId?: ConversationId,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      try {
        const result = await createBranchingConversationAction({
          firstMessage: content,
          sourceConversationId: sourceConversationId as Id<"conversations">,
          personaId: personaId ?? undefined,
          attachments,
          reasoningConfig:
            reasoningConfig?.enabled && reasoningConfig.effort
              ? {
                  enabled: reasoningConfig.enabled,
                  effort: reasoningConfig.effort,
                  maxTokens: reasoningConfig.maxTokens,
                }
              : undefined,
          contextSummary,
          useWebSearch: true,
          generateTitle: true,
        });

        if (result?.conversationId) {
          if (shouldNavigate) {
            navigate(ROUTES.CHAT_CONVERSATION(result.conversationId));
          }
          return result.conversationId;
        }
      } catch {
        // Handle error silently
      }
      return undefined;
    },
    [createBranchingConversationAction, navigate]
  );

  // Auto-retry logic for incomplete conversations
  const latestMessagesRef = useRef(messages);
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  const initialLoadHandledRef = useRef<string | null>(null);
  const lastAutoTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    // Don't auto-retry while busy (loading or streaming)
    if (status !== "idle") {
      return;
    }
    if (!messages || messages.length === 0) {
      return;
    }
    // Don't auto-retry during the transition from optimistic to real messages.
    // This prevents a race condition where the query returns with only the user message
    // before the startConversation action has created the assistant message.
    if (hasTransitionedRef.current) {
      return;
    }
    if (initialLoadHandledRef.current === resolvedId) {
      return;
    }

    initialLoadHandledRef.current = resolvedId || null;

    const current = latestMessagesRef.current;
    const last = current[current.length - 1];
    if (!last || last.role !== "user") {
      return;
    }
    if (lastAutoTriggeredRef.current === last.id) {
      return;
    }
    if (conversation?.isArchived) {
      return;
    }

    const hasActiveImageGen = current.some(
      m =>
        m.role === "assistant" &&
        m.imageGeneration &&
        (m.imageGeneration.status === "starting" ||
          m.imageGeneration.status === "processing")
    );
    if (hasActiveImageGen) {
      return;
    }

    (async () => {
      try {
        await retryFromMessage(last.id);
        lastAutoTriggeredRef.current = last.id;
      } catch {
        // no-op
      }
    })();
  }, [
    status,
    messages,
    resolvedId,
    conversation?.isArchived,
    retryFromMessage,
  ]);

  // Image generation retry handler
  const handleRetryImageGeneration = useCallback(
    async (messageId: string, overrideParams: ImageRetryParams) => {
      try {
        const currentMessages = latestMessagesRef.current;
        const message = currentMessages.find(m => m.id === messageId);
        if (!message?.imageGeneration) {
          throw new Error("Image generation message not found");
        }

        const messageIndex = currentMessages.findIndex(m => m.id === messageId);
        let userMessage = null;

        for (let i = messageIndex - 1; i >= 0; i--) {
          const candidate = currentMessages[i];
          if (candidate?.role === "user") {
            userMessage = candidate;
            break;
          }
        }

        if (!userMessage?.content) {
          throw new Error(
            "Could not find the original user message with prompt"
          );
        }

        const metadata = message.imageGeneration.metadata;

        // Use override params if provided, otherwise fall back to original metadata
        const modelToUse = overrideParams.model || metadata?.model;
        const aspectRatioToUse =
          overrideParams.aspectRatio || metadata?.params?.aspectRatio;

        if (!modelToUse) {
          throw new Error(
            "Missing model information. Please try generating a new image instead of retrying."
          );
        }

        await retryImageGeneration(
          convex,
          resolvedId as Id<"conversations">,
          messageId as Id<"messages">,
          {
            prompt: userMessage.content,
            model: modelToUse,
            params: {
              ...metadata?.params,
              aspectRatio: aspectRatioToUse as
                | "1:1"
                | "16:9"
                | "9:16"
                | "4:3"
                | "3:4"
                | undefined,
            },
          }
        );
      } catch (error) {
        managedToast.error("Failed to retry image generation", {
          description:
            error instanceof Error ? error.message : "Please try again",
        });
      }
    },
    [convex, resolvedId, managedToast.error]
  );

  // Sync generation mode with conversation context
  useEffect(() => {
    if (!resolvedId) {
      return;
    }

    const getStore = (
      useChatInputStore as unknown as {
        getState?: () => {
          setGenerationMode?: (mode: "text" | "image") => void;
          setImageParams?: (
            value:
              | import("@/types").ImageGenerationParams
              | ((
                  prev: import("@/types").ImageGenerationParams
                ) => import("@/types").ImageGenerationParams)
          ) => void;
          setNegativePromptEnabled?: (enabled: boolean) => void;
          generationMode?: "text" | "image";
          imageParams?: import("@/types").ImageGenerationParams;
          negativePromptEnabled?: boolean;
        };
      }
    ).getState;
    if (typeof getStore !== "function") {
      return;
    }

    const store = getStore();
    const {
      setGenerationMode,
      setImageParams,
      setNegativePromptEnabled,
      generationMode,
      imageParams,
      negativePromptEnabled,
    } = store ?? {};

    if (
      !store ||
      typeof setGenerationMode !== "function" ||
      typeof setImageParams !== "function" ||
      typeof setNegativePromptEnabled !== "function"
    ) {
      return;
    }

    const latestWithContext = (() => {
      if (!messages || messages.length === 0) {
        return undefined;
      }
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message) {
          continue;
        }
        const hasGeneratedAttachment = (message.attachments ?? []).some(
          att => att.type === "image" && att.generatedImage?.isGenerated
        );
        if (
          message.imageGeneration ||
          hasGeneratedAttachment ||
          (message.provider && message.model)
        ) {
          return message;
        }
      }
      return undefined;
    })();

    const targetMode: "text" | "image" = (() => {
      if (!latestWithContext) {
        return "text";
      }
      // Only switch to image mode for direct Replicate image generation,
      // not when a text model calls the generateImage tool.
      if (latestWithContext.provider === "replicate") {
        return "image";
      }
      return "text";
    })();

    if (generationMode !== targetMode) {
      setGenerationMode(targetMode);
    }

    if (targetMode === "image") {
      const metadata = latestWithContext?.imageGeneration?.metadata;
      const modelFromMessage = metadata?.model || latestWithContext?.model;

      const baseImageParams =
        imageParams ??
        ({ prompt: "", model: "" } as import("@/types").ImageGenerationParams);
      const nextParams = { ...baseImageParams };
      let paramsChanged = false;

      if (modelFromMessage && nextParams.model !== modelFromMessage) {
        nextParams.model = modelFromMessage;
        paramsChanged = true;
      }

      const incomingParams = metadata?.params;
      if (incomingParams) {
        const ratio = incomingParams.aspectRatio;
        if (
          ratio &&
          ["1:1", "16:9", "9:16", "4:3", "3:4"].includes(ratio) &&
          nextParams.aspectRatio !== ratio
        ) {
          nextParams.aspectRatio = ratio as typeof nextParams.aspectRatio;
          paramsChanged = true;
        }

        if (
          incomingParams.count !== undefined &&
          nextParams.count !== incomingParams.count
        ) {
          nextParams.count = incomingParams.count;
          paramsChanged = true;
        }

        if (incomingParams.negativePrompt !== undefined) {
          const trimmedNegative = incomingParams.negativePrompt.trim();
          const shouldEnableNegative = trimmedNegative.length > 0;
          if (negativePromptEnabled !== shouldEnableNegative) {
            setNegativePromptEnabled(shouldEnableNegative);
          }
        } else if (negativePromptEnabled) {
          setNegativePromptEnabled(false);
        }
      } else if (negativePromptEnabled) {
        setNegativePromptEnabled(false);
      }

      if (paramsChanged) {
        setImageParams(nextParams);
      }
    } else if (negativePromptEnabled) {
      setNegativePromptEnabled(false);
    }
  }, [resolvedId, messages]);

  // Extracted callbacks — stable references for UnifiedChatView memo boundary.
  // Must be before early returns to satisfy rules of hooks.
  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig,
      temperature?: number
    ) => {
      await sendMessage({
        content,
        attachments,
        personaId,
        reasoningConfig,
        temperature,
      });
    },
    [sendMessage]
  );

  const handleRefineMessage = useCallback(
    async (
      messageId: string,
      type: "custom" | "add_details" | "more_concise",
      instruction?: string
    ) => {
      await convex.action(api.messages.refineAssistantMessage, {
        messageId: messageId as Id<"messages">,
        mode: (() => {
          if (type === "custom") {
            return "custom";
          }
          if (type === "more_concise") {
            return "more_concise";
          }
          return "add_details";
        })(),
        instruction,
      });
    },
    [convex]
  );

  const handleRetryMessage = useCallback(
    async (
      messageId: string,
      modelId?: string,
      provider?: string,
      reasoningConfig?: ReasoningConfig,
      temperature?: number
    ) => {
      const options: Partial<{
        model: string;
        provider: string;
        reasoningConfig: ReasoningConfig;
        temperature: number;
      }> = {};
      if (modelId) {
        options.model = modelId;
      }
      if (provider) {
        options.provider = provider;
      }
      if (reasoningConfig) {
        options.reasoningConfig = reasoningConfig;
      }
      if (temperature !== undefined) {
        options.temperature = temperature;
      }

      await retryFromMessage(messageId, options);
    },
    [retryFromMessage]
  );

  // Error state: no optimistic message AND query definitively says not found/deleted
  const queryComplete = slugQuery !== undefined;
  const notFound =
    queryComplete && !slugQuery.resolvedId && !slugQuery.hasAccess;
  const isDeleted = queryComplete && slugQuery.isDeleted;

  // Safety net: redirect home when viewing a deleted conversation.
  // Must be in useEffect — navigating during render is unreliable in React 18+.
  useEffect(() => {
    if (!isOptimistic && isDeleted) {
      navigate(ROUTES.HOME);
    }
  }, [isOptimistic, isDeleted, navigate]);

  if (!isOptimistic && isDeleted) {
    return null;
  }

  if (!isOptimistic && notFound) {
    return <NotFoundPage />;
  }

  // Offline state
  const shouldShowOfflineOverlay = !(online || queryComplete || isOptimistic);

  return (
    <>
      <title>{pageTitle}</title>
      <div className="relative flex h-full min-h-0 w-full">
        <UnifiedChatView
          conversationId={resolvedId as ConversationId}
          messages={messages}
          status={status}
          currentPersonaId={conversation?.personaId ?? null}
          canSavePrivateChat={false}
          hasApiKeys={hasApiKeys === true}
          isArchived={conversation?.isArchived ?? undefined}
          onSendMessage={handleSendMessage}
          onSendAsNewConversation={handleSendAsNewConversation}
          onDeleteMessage={deleteMessage}
          onEditMessage={editMessage}
          onRefineMessage={handleRefineMessage}
          onStopGeneration={stopGeneration}
          onRetryUserMessage={handleRetryMessage}
          onRetryAssistantMessage={handleRetryMessage}
          onRetryImageGeneration={handleRetryImageGeneration}
        />

        {shouldShowOfflineOverlay ? (
          <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-background/95 backdrop-blur-sm">
            <OfflinePlaceholder
              title="Can't load conversation while offline"
              description="Reconnect to view this conversation or start a new one."
              onRetry={() => window.location.reload()}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
