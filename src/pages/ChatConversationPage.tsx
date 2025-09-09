import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { useChat } from "@/hooks/use-chat";
import { useConversationModelOverride } from "@/hooks/use-conversation-model-override";
import { startAuthorStream } from "@/lib/ai/http-stream";
import { retryImageGeneration } from "@/lib/ai/image-generation-handlers";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useToast } from "@/providers/toast-context";
import { useStreamOverlays } from "@/stores/stream-overlays";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";

export default function ConversationRoute() {
  const { conversationId } = useParams();
  const { setPrivateMode } = usePrivateMode();
  const navigate = useNavigate();
  const convex = useConvex();
  const managedToast = useToast();
  const setStreaming = useMutation(api.conversations.setStreaming);
  const createBranchingConversationAction = useAction(
    api.conversations.createBranchingConversation
  );
  // temperature managed by store

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

          if ("assistantMessageId" in result && result.assistantMessageId) {
            setTimeout(() => {
              (async () => {
                try {
                  await startAuthorStream({
                    convexUrl: import.meta.env.VITE_CONVEX_URL,
                    conversationId: result.conversationId,
                    assistantMessageId:
                      result.assistantMessageId as Id<"messages">,
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
                  // Ignore errors when starting stream
                }
              })();
            }, 0);
          }

          return result.conversationId;
        }
      } catch {
        // Handle error silently for branching conversation creation
      }
      return undefined;
    },
    [createBranchingConversationAction, navigate, setStreaming]
  );

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  // Override the selected model to match the last used model in this conversation
  useConversationModelOverride(conversationId as ConversationId);

  const conversationAccessInfo = useQuery(api.conversations.getWithAccessInfo, {
    id: conversationId as Id<"conversations">,
  });

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

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
    conversationId: conversationId as ConversationId,
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

  // Handle conversation access scenarios
  if (conversationAccessInfo === undefined) {
    // Still loading
    return null;
  }

  if (conversationAccessInfo.isDeleted) {
    // Conversation was deleted, redirect to home
    navigate(ROUTES.HOME);
    return null;
  }

  if (!conversationAccessInfo.hasAccess) {
    // User doesn't have access to this conversation, show 404
    return <NotFoundPage />;
  }

  const conversation = conversationAccessInfo.conversation;

  return (
    <UnifiedChatView
      conversationId={conversationId as ConversationId}
      messages={messages}
      isLoading={isLoading || hasApiKeys === undefined}
      isLoadingMessages={conversationAccessInfo === undefined}
      isStreaming={messageIsStreaming}
      currentPersonaId={conversation?.personaId ?? null}
      canSavePrivateChat={false}
      hasApiKeys={hasApiKeys === true}
      isArchived={conversation?.isArchived}
      onSendMessage={async (
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
      }}
      onSendAsNewConversation={handleSendAsNewConversation}
      onDeleteMessage={deleteMessage}
      onEditMessage={editMessage}
      onRefineMessage={async (messageId, type, instruction) => {
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
      }}
      onStopGeneration={stopGeneration}
      onRetryUserMessage={async (
        messageId,
        modelId,
        provider,
        reasoningConfig,
        temperature
      ) => {
        // Optimistically prune UI after the user message: clear overlays for later messages
        try {
          const overlays = useStreamOverlays.getState();
          const index = messages.findIndex(m => m.id === messageId);
          if (index !== -1) {
            for (let i = index + 1; i < messages.length; i++) {
              const m = messages[i];
              if (m.role === "assistant") {
                const id = String(m.id);
                overlays.set(id, "");
                overlays.setReasoning(id, "");
                overlays.setStatus(id, undefined);
                overlays.clearCitations(id);
                overlays.clearTools(id);
              }
            }
          }
        } catch (_e) {
          // ignore
        }

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
      }}
      onRetryAssistantMessage={async (
        messageId,
        modelId,
        provider,
        reasoningConfig,
        temperature
      ) => {
        // Immediately clear the retried assistant message in the UI
        try {
          const overlays = useStreamOverlays.getState();
          const id = String(messageId);
          overlays.set(id, "");
          overlays.setReasoning(id, "");
          overlays.setStatus(id, "thinking");
          overlays.clearCitations(id);
          overlays.clearTools(id);
        } catch {
          // non-fatal
        }

        // If retrying with a different model, update the message model label optimistically
        if (modelId || provider) {
          try {
            // Update happens server-side; front-end displays from DB.
            // Optimistically reflect by setting thinking status (already done) until DB patch returns.
            // No direct local message update to avoid divergent state.
          } catch (_e) {
            // ignore
          }
        }

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
      }}
      onRetryImageGeneration={handleRetryImageGeneration}
    />
  );
}
