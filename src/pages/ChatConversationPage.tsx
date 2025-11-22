import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLoaderData, useNavigate, useParams } from "react-router-dom";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { OfflinePlaceholder } from "@/components/ui/offline-placeholder";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { mapServerMessageToChatMessage, useChat } from "@/hooks/use-chat";
import { useConversationModelOverride } from "@/hooks/use-conversation-model-override";
import { useOnline } from "@/hooks/use-online";
import { retryImageGeneration } from "@/lib/ai/image-generation-handlers";
import { ROUTES } from "@/lib/routes";
import type { ConversationLoaderResult } from "@/loaders/conversation-loader";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useToast } from "@/providers/toast-context";
import { useChatInputStore } from "@/stores/chat-input-store";
import { useStreamOverlays } from "@/stores/stream-overlays";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";

type ConversationAccessInfo = {
  hasAccess: boolean;
  conversation?: {
    title?: string | null;
    personaId?: Id<"personas"> | null;
    isArchived?: boolean | null;
  } | null;
  isDeleted?: boolean;
} | null;

type LastUsedModel = {
  modelId: string;
  provider: string;
} | null;

function normalizeConversationAccess(raw: unknown): ConversationAccessInfo {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const data = raw as {
    hasAccess?: boolean;
    conversation?: {
      title?: string | null;
      personaId?: Id<"personas"> | null;
      isArchived?: boolean | null;
    } | null;
    isDeleted?: boolean;
  };

  if (typeof data.hasAccess !== "boolean") {
    return null;
  }

  return {
    hasAccess: data.hasAccess,
    conversation: data.conversation ?? null,
    isDeleted: data.isDeleted,
  };
}

function normalizeMessagesResult(raw: unknown): ChatMessage[] {
  if (!raw) {
    return [];
  }

  let docs: Doc<"messages">[] = [];

  if (Array.isArray(raw)) {
    docs = raw as Doc<"messages">[];
  } else if (
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as { page?: Doc<"messages">[] }).page)
  ) {
    docs = ((raw as { page?: Doc<"messages">[] }).page ??
      []) as Doc<"messages">[];
  }

  return docs.map(doc => mapServerMessageToChatMessage(doc));
}

function normalizeLastUsedModel(raw: unknown): LastUsedModel {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const data = raw as { modelId?: string; provider?: string };
  if (!(data.modelId && data.provider)) {
    return null;
  }
  return {
    modelId: data.modelId,
    provider: data.provider,
  };
}

function normalizeStreamingStatus(raw: unknown): boolean {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (raw && typeof raw === "object" && "isStreaming" in raw) {
    return Boolean((raw as { isStreaming?: boolean }).isStreaming);
  }
  return false;
}

export default function ConversationRoute() {
  const loaderData = useLoaderData() as ConversationLoaderResult;

  return (
    <ConversationRouteContent
      initialConversationAccessInfo={normalizeConversationAccess(
        loaderData.conversationAccessInfo
      )}
      initialMessages={normalizeMessagesResult(loaderData.messages)}
      initialLastUsedModel={normalizeLastUsedModel(loaderData.lastUsedModel)}
      initialStreaming={normalizeStreamingStatus(loaderData.streamingStatus)}
    />
  );
}

type ConversationRouteContentProps = {
  initialConversationAccessInfo: ConversationAccessInfo;
  initialMessages: ChatMessage[];
  initialLastUsedModel: LastUsedModel;
  initialStreaming: boolean;
};

function ConversationRouteContent({
  initialConversationAccessInfo,
  initialMessages,
  initialLastUsedModel,
  initialStreaming,
}: ConversationRouteContentProps) {
  const { conversationId } = useParams();
  const { setPrivateMode } = usePrivateMode();
  const navigate = useNavigate();
  const convex = useConvex();
  const managedToast = useToast();
  const online = useOnline();
  const _setStreaming = useMutation(api.conversations.setStreaming);

  const createBranchingConversationAction = useAction(
    api.conversations.createBranchingConversation
  );

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

          // Server-side streaming is now handled automatically by the Convex action

          return result.conversationId;
        }
      } catch {
        // Handle error silently for branching conversation creation
      }
      return undefined;
    },
    [createBranchingConversationAction, navigate]
  );

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  useConversationModelOverride(
    conversationId as ConversationId,
    initialLastUsedModel
  );

  const conversationAccessInfoQuery = useQuery(
    api.conversations.getWithAccessInfo,
    {
      id: conversationId as Id<"conversations">,
    }
  );

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  const conversationAccessInfo =
    conversationAccessInfoQuery ?? initialConversationAccessInfo ?? null;
  const isAccessResolved = conversationAccessInfoQuery !== undefined;

  const conversationTitle = conversationAccessInfo?.conversation?.title ?? null;

  const pageTitle = useMemo(() => {
    if (conversationTitle && conversationTitle.trim().length > 0) {
      return conversationTitle;
    }
    return "Polly";
  }, [conversationTitle]);

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
    initialMessages,
  });

  const latestMessagesRef = useRef(messages);
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  const initialLoadHandledRef = useRef<string | null>(null);

  const lastAutoTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || messageIsStreaming) {
      return;
    }
    if (!messages || messages.length === 0) {
      return;
    }
    if (initialLoadHandledRef.current === conversationId) {
      return;
    }

    initialLoadHandledRef.current = conversationId || null;

    const current = latestMessagesRef.current;
    const last = current[current.length - 1];
    if (!last || last.role !== "user") {
      return;
    }
    if (lastAutoTriggeredRef.current === last.id) {
      return;
    }
    if (conversationAccessInfo?.conversation?.isArchived) {
      return;
    }

    const hasAssistantAfter = false;
    if (hasAssistantAfter) {
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
    isLoading,
    messageIsStreaming,
    messages,
    conversationId,
    conversationAccessInfo?.conversation?.isArchived,
    retryFromMessage,
  ]);

  const handleRetryImageGeneration = useCallback(
    async (messageId: string) => {
      try {
        const message = messages.find(m => m.id === messageId);
        if (!message?.imageGeneration) {
          throw new Error("Image generation message not found");
        }

        const messageIndex = messages.findIndex(m => m.id === messageId);
        let userMessage = null;

        for (let i = messageIndex - 1; i >= 0; i--) {
          const candidate = messages[i];
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
            prompt: userMessage.content,
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

  // Keep generation mode and image params in sync with the latest message context
  useEffect(() => {
    if (!conversationId) {
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
      if (
        latestWithContext.imageGeneration ||
        latestWithContext.provider === "replicate" ||
        (latestWithContext.attachments ?? []).some(
          att => att.type === "image" && att.generatedImage?.isGenerated
        )
      ) {
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
  }, [conversationId, messages]);

  useEffect(() => {
    if (
      online &&
      conversationAccessInfoQuery === undefined &&
      !initialConversationAccessInfo
    ) {
      (async () => {
        try {
          await convex.query(api.conversations.getWithAccessInfo, {
            id: conversationId as Id<"conversations">,
          });
          await convex.query(api.messages.list, {
            conversationId: conversationId as Id<"conversations">,
          });
        } catch (_e) {
          // Silent; useQuery updates once connection restores
        }
      })();
    }
  }, [
    online,
    conversationAccessInfoQuery,
    convex,
    conversationId,
    initialConversationAccessInfo,
  ]);

  const isConversationLoading =
    conversationAccessInfoQuery === undefined && !initialConversationAccessInfo;
  const shouldShowOfflineOverlay =
    !online &&
    conversationAccessInfoQuery === undefined &&
    !initialConversationAccessInfo;

  if (isAccessResolved && conversationAccessInfo?.isDeleted) {
    navigate(ROUTES.HOME);
    return null;
  }

  if (
    isAccessResolved &&
    conversationAccessInfo &&
    !conversationAccessInfo.hasAccess
  ) {
    return <NotFoundPage />;
  }

  const conversation = conversationAccessInfo?.conversation;

  const effectiveStreaming =
    messageIsStreaming || (isConversationLoading && initialStreaming);

  return (
    <>
      <title>{pageTitle}</title>
      <div className="relative flex h-full min-h-0 w-full">
        <UnifiedChatView
          conversationId={conversationId as ConversationId}
          messages={messages}
          isLoading={
            isLoading || hasApiKeys === undefined || isConversationLoading
          }
          isLoadingMessages={isLoading || isConversationLoading}
          isStreaming={effectiveStreaming}
          currentPersonaId={conversation?.personaId ?? null}
          canSavePrivateChat={false}
          hasApiKeys={hasApiKeys === true}
          isArchived={conversation?.isArchived ?? undefined}
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
          }}
          onStopGeneration={stopGeneration}
          onRetryUserMessage={async (
            messageId,
            modelId,
            provider,
            reasoningConfig,
            temperature
          ) => {
            try {
              const overlays = useStreamOverlays.getState();
              const index = messages.findIndex(m => m.id === messageId);
              if (index !== -1) {
                for (let i = index + 1; i < messages.length; i++) {
                  const m = messages[i];
                  if (!m) {
                    continue;
                  }
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
