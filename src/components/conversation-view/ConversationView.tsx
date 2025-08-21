import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { useChat } from "@/hooks/use-chat";
import { useConversationModelOverride } from "@/hooks/use-conversation-model-override";
import { useConversationPreload } from "@/hooks/use-conversation-preload";
import { retryImageGeneration } from "@/lib/ai/image-generation-handlers";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useToast } from "@/providers/toast-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";

/**
 * Handles dynamic conversation loading without unmounting the parent layout.
 * This allows the chat input and other persistent UI elements to remain mounted
 * while switching between conversations.
 */
export function ConversationView() {
  const { conversationId } = useParams<{ conversationId: ConversationId }>();
  const { setPrivateMode } = usePrivateMode();
  const navigate = useNavigate();
  const createBranchingConversationAction = useAction(
    api.conversations.createBranchingConversation
  );
  const [currentTemperature, setCurrentTemperature] = useState<
    number | undefined
  >(undefined);

  useEffect(() => {
    setPrivateMode(false);
  }, [setPrivateMode]);

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
        // Handle error silently for branching conversation creation
      }
      return undefined;
    },
    [createBranchingConversationAction, navigate]
  );

  // Only show conversation content if we have a valid conversationId
  if (!conversationId) {
    // This could be a landing page or conversation selection view
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Welcome to Polly</h2>
          <p className="text-muted-foreground">
            Select a conversation from the sidebar to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConversationContent
      conversationId={conversationId}
      currentTemperature={currentTemperature}
      onTemperatureChange={setCurrentTemperature}
      onSendAsNewConversation={handleSendAsNewConversation}
    />
  );
}

interface ConversationContentProps {
  conversationId: ConversationId;
  currentTemperature?: number;
  onTemperatureChange: (temperature?: number) => void;
  onSendAsNewConversation: (
    content: string,
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<ConversationId | undefined>;
}

/**
 * Renders the actual conversation content. This component will re-render
 * when conversationId changes, but its parent remains mounted.
 */
function ConversationContent({
  conversationId,
  currentTemperature,
  onTemperatureChange,
  onSendAsNewConversation,
}: ConversationContentProps) {
  const navigate = useNavigate();
  const convex = useConvex();
  const managedToast = useToast();

  // Get cached data if available
  const { getCachedData, clearConversationCache, markConversationActive } =
    useConversationPreload();

  const cachedData = useMemo(() => {
    if (!conversationId) {
      return null;
    }
    return getCachedData(conversationId);
  }, [conversationId, getCachedData]);

  // Override the selected model to match the last used model in this conversation
  useConversationModelOverride(conversationId);

  const conversationAccessInfo = useQuery(api.conversations.getWithAccessInfo, {
    id: conversationId as Id<"conversations">,
  });

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  const conversationTitle = (
    conversationAccessInfo?.conversation as { title?: string } | undefined
  )?.title;

  useEffect(() => {
    if (conversationTitle && conversationTitle !== document.title) {
      document.title = conversationTitle;
    }

    return () => {
      if (!conversationId) {
        document.title = "Polly";
      }
    };
  }, [conversationTitle, conversationId]);

  // Defer redirect if conversation was deleted
  useEffect(() => {
    if (conversationAccessInfo?.isDeleted) {
      navigate(ROUTES.HOME);
    }
  }, [conversationAccessInfo?.isDeleted, navigate]);

  const {
    messages,
    isLoading,
    isStreaming: messageIsStreaming,
    sendMessage,
    editMessage,
    retryFromMessage,
    deleteMessage,
    stopGeneration,
  } = useChat({
    conversationId,
  });

  const handleRetryImageGeneration = useCallback(
    async (messageId: string) => {
      try {
        const message = messages.find(m => m.id === messageId);
        if (!message?.imageGeneration) {
          throw new Error("Image generation message not found");
        }

        // Find the previous user message to get the prompt
        const messageIndex = messages.findIndex(m => m.id === messageId);
        let userMessage = null;

        // Look backwards from the current message to find the most recent user message
        for (let i = messageIndex - 1; i >= 0; i--) {
          if (messages[i].role === "user") {
            userMessage = messages[i];
            break;
          }
        }

        if (!userMessage?.content) {
          throw new Error(
            "Could not find the original user message with prompt"
          );
        }

        // Use metadata for model and params, but user message content for prompt
        const metadata = message.imageGeneration.metadata;

        if (!metadata?.model) {
          throw new Error(
            "Missing model information. Please try generating a new image instead of retrying."
          );
        }
        if (!metadata?.params) {
          throw new Error(
            "Missing generation parameters. Please try generating a new image instead of retrying."
          );
        }

        await retryImageGeneration(
          convex,
          conversationId as Id<"conversations">,
          messageId as Id<"messages">,
          {
            prompt: userMessage.content, // Use the previous user message content
            model: metadata.model,
            params: {
              ...metadata.params,
              aspectRatio: metadata.params?.aspectRatio as
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
    [messages, convex, conversationId, managedToast.error]
  );

  // Mark conversation as active when it's being viewed and clear cache when it changes
  useEffect(() => {
    if (conversationId) {
      // Mark as active to prevent preloading conflicts
      markConversationActive(conversationId);
    }

    return () => {
      // Clear cache when component unmounts (conversation changes)
      if (conversationId) {
        clearConversationCache(conversationId);
      }
    };
  }, [conversationId, clearConversationCache, markConversationActive]);

  // Optimized handlers with cache clearing
  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig,
      temperature?: number
    ) => {
      clearConversationCache(conversationId);
      await sendMessage({
        content,
        attachments,
        personaId,
        reasoningConfig,
        temperature,
      });
    },
    [clearConversationCache, conversationId, sendMessage]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      clearConversationCache(conversationId);
      await deleteMessage(messageId);
    },
    [clearConversationCache, conversationId, deleteMessage]
  );

  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      clearConversationCache(conversationId);
      await editMessage(messageId, content);
    },
    [clearConversationCache, conversationId, editMessage]
  );

  const handleRefineMessage = useCallback(
    async (
      messageId: string,
      type: "custom" | "add_details" | "more_concise",
      instruction?: string
    ) => {
      await convex.action(api.messages.refineAssistantMessage, {
        messageId: messageId as Id<"messages">,
        mode:
          type === "custom"
            ? "custom"
            : type === "more_concise"
              ? "more_concise"
              : "add_details",
        instruction,
      });
    },
    [convex]
  );

  const createRetryHandler = useCallback(
    (
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

      return retryFromMessage(messageId, options);
    },
    [retryFromMessage]
  );

  // Handle conversation access scenarios
  if (conversationAccessInfo === undefined) {
    const hasCachedData = cachedData?.conversationAccessInfo;

    if (hasCachedData && cachedData?.conversationAccessInfo) {
      const cachedConversation = (
        cachedData.conversationAccessInfo as {
          conversation?: { personaId?: Id<"personas">; isArchived?: boolean };
        }
      )?.conversation;
      const cachedMessages = (cachedData.messages as ChatMessage[]) || [];
      const isStreaming = Boolean(cachedData.streamingStatus);

      return (
        <UnifiedChatView
          conversationId={conversationId}
          messages={cachedMessages}
          isLoading={false}
          isLoadingMessages={false}
          isStreaming={isStreaming}
          currentPersonaId={cachedConversation?.personaId ?? null}
          currentTemperature={currentTemperature}
          canSavePrivateChat={false}
          hasApiKeys={hasApiKeys ?? false}
          isArchived={cachedConversation?.isArchived}
          onSendMessage={async () => {
            // No-op during loading
          }}
          onDeleteMessage={async () => {
            // No-op during loading
          }}
          onStopGeneration={() => {
            // No-op during loading
          }}
        />
      );
    }

    // Still loading - render empty state
    return (
      <UnifiedChatView
        conversationId={conversationId}
        messages={[]}
        isLoading={false}
        isLoadingMessages={false}
        isStreaming={false}
        currentPersonaId={null}
        currentTemperature={currentTemperature}
        canSavePrivateChat={false}
        hasApiKeys={false}
        isArchived={false}
        onSendMessage={async () => {
          // No-op during loading
        }}
        onDeleteMessage={async () => {
          // No-op during loading
        }}
        onStopGeneration={() => {
          // No-op during loading
        }}
      />
    );
  }

  if (conversationAccessInfo.isDeleted) {
    // Defer navigation to an effect to avoid side effects during render
    // The effect below will handle redirection
    return null;
  }

  if (!conversationAccessInfo.hasAccess) {
    return (
      <div className="flex h-full items-center justify-center">
        <NotFoundPage />
      </div>
    );
  }

  const conversation = conversationAccessInfo.conversation;

  return (
    <UnifiedChatView
      conversationId={conversationId}
      messages={messages}
      isLoading={isLoading}
      isLoadingMessages={false}
      isStreaming={messageIsStreaming}
      currentPersonaId={conversation?.personaId ?? null}
      currentTemperature={currentTemperature}
      canSavePrivateChat={false}
      hasApiKeys={hasApiKeys ?? false}
      isArchived={conversation?.isArchived}
      onSendMessage={handleSendMessage}
      onSendAsNewConversation={onSendAsNewConversation}
      onDeleteMessage={handleDeleteMessage}
      onEditMessage={handleEditMessage}
      onRefineMessage={handleRefineMessage}
      onStopGeneration={stopGeneration}
      onTemperatureChange={onTemperatureChange}
      onRetryUserMessage={createRetryHandler}
      onRetryAssistantMessage={createRetryHandler}
      onRetryImageGeneration={handleRetryImageGeneration}
    />
  );
}
