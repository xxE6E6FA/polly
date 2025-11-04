import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { usePrivateChat } from "@/hooks/use-private-chat";
import { usePrivatePersona } from "@/lib/ai/private-personas";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";

const processedInitialMessageKeys = new Set<string>();

export default function PrivateChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserDataContext();
  const { setPrivateMode } = usePrivateMode();
  const managedToast = useToast();

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  const selectedModel = useQuery(api.userModels.getUserSelectedModel, {});

  const saveConversationAction = useAction(
    api.conversations.savePrivateConversation
  );

  const [navigationState, setNavigationState] = useState<{
    initialMessage?: string;
    attachments?: Attachment[];
    personaId?: string | null;
    reasoningConfig?: ReasoningConfig;
    temperature?: number;
  } | null>(location.state);

  const [currentPersonaId, setCurrentPersonaId] =
    useState<Id<"personas"> | null>(
      navigationState?.personaId as Id<"personas"> | null
    );

  const initialMessageSentRef = useRef(false);

  const { systemPrompt } = usePrivatePersona(
    currentPersonaId,
    selectedModel?.modelId || "AI Model"
  );

  const privateChat = usePrivateChat({
    modelId: selectedModel?.modelId,
    provider: selectedModel?.provider,
    supportsReasoning: selectedModel?.supportsReasoning,
    personaId: currentPersonaId,
    systemPrompt,
    temperature: navigationState?.temperature,
    reasoningConfig: navigationState?.reasoningConfig,
  });

  useEffect(() => {
    setPrivateMode(true);

    return () => {
      setPrivateMode(false);
    };
  }, [setPrivateMode]);

  useEffect(() => {
    if (navigationState?.initialMessage) {
      initialMessageSentRef.current = false;
    }
  }, [navigationState?.initialMessage]);

  useEffect(() => {
    if (!navigationState?.initialMessage) {
      return;
    }

    if (processedInitialMessageKeys.has(location.key)) {
      if (navigationState !== null) {
        setNavigationState(null);
      }
      return;
    }

    if (initialMessageSentRef.current) {
      return;
    }

    if (!(selectedModel && privateChat.messages.length === 0)) {
      return;
    }

    initialMessageSentRef.current = true;
    processedInitialMessageKeys.add(location.key);

    privateChat
      .sendMessage(
        navigationState.initialMessage,
        navigationState.attachments,
        {
          personaId:
            navigationState.personaId !== null
              ? (navigationState.personaId as Id<"personas">)
              : undefined,
          reasoningConfig: navigationState.reasoningConfig,
          temperature: navigationState.temperature,
        }
      )
      .catch(error => {
        managedToast.error("Chat error", {
          description: error.message,
        });
      });

    setCurrentPersonaId(
      (navigationState.personaId as Id<"personas"> | null) ?? null
    );
    setNavigationState(null);
  }, [navigationState, privateChat, selectedModel, location.key, managedToast]);

  const canSave = useMemo(() => {
    return privateChat.messages.length > 0 && !user?.isAnonymous && user?._id;
  }, [privateChat.messages, user]);

  const handleSavePrivateChat = useCallback(async () => {
    if (!user?._id) {
      managedToast.error("Cannot save chat", {
        description: "User not authenticated",
      });
      return;
    }

    if (!canSave) {
      managedToast.error("No messages to save", {
        description: "Start a private conversation first",
      });
      return;
    }

    try {
      const convertedMessages = privateChat.messages
        .filter(msg => msg.role === "user" || msg.role === "assistant")
        .map(msg => {
          const hasContent = msg.content.trim().length > 0;
          const hasAttachments = Boolean(msg.attachments?.length);

          if (!hasContent) {
            if (!hasAttachments) {
              return null;
            }
          }

          return {
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt,
            model:
              msg.role === "assistant" ? selectedModel?.modelId : undefined,
            provider:
              msg.role === "assistant"
                ? (selectedModel?.provider as
                    | "openai"
                    | "anthropic"
                    | "google"
                    | "openrouter")
                : undefined,
            reasoning: msg.reasoning,
            attachments: msg.attachments || [],
            citations: [],
            metadata: {
              finishReason: "stop",
            },
          };
        })
        .filter(
          (
            msg
          ): msg is {
            role: "user" | "assistant";
            content: string;
            createdAt: number;
            model: string | undefined;
            provider:
              | "openai"
              | "anthropic"
              | "google"
              | "openrouter"
              | undefined;
            reasoning: string | undefined;
            attachments: Attachment[];
            citations: [];
            metadata: { finishReason: string };
          } => msg !== null
        );

      const conversationId = await saveConversationAction({
        messages: convertedMessages,
        title: undefined,
      });

      if (conversationId) {
        managedToast.success("Chat saved successfully");
        navigate(ROUTES.CHAT_CONVERSATION(conversationId));
      }
    } catch (error) {
      managedToast.error("Failed to save chat", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [
    user,
    canSave,
    privateChat.messages,
    selectedModel,
    saveConversationAction,
    navigate,
    managedToast,
  ]);

  const chatMessages: ChatMessage[] = useMemo(() => {
    return privateChat.messages.map(msg => ({
      _id: `private-${msg.id}` as Id<"messages">,
      _creationTime: msg.createdAt,
      id: msg.id,
      role: msg.role,
      content: msg.content,
      conversationId: "private" as Id<"conversations">,
      userId: user?._id || ("anonymous" as Id<"users">),
      isMainBranch: true,
      createdAt: msg.createdAt,
      status: msg.status,
      reasoning: msg.reasoning,
      model: msg.model,
      provider: msg.provider,
      attachments: msg.attachments || [],
      citations: [],
      metadata: {
        finishReason: "stop",
      },
    }));
  }, [privateChat.messages, user?._id]);

  const isStreaming = useMemo(() => {
    return (
      privateChat.status === "streaming" || privateChat.status === "submitted"
    );
  }, [privateChat.status]);

  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig,
      temperature?: number
    ) => {
      await privateChat.sendMessage(content, attachments, {
        personaId,
        reasoningConfig,
        temperature,
      });

      if (personaId !== currentPersonaId) {
        setCurrentPersonaId(personaId || null);
      }
    },
    [privateChat, currentPersonaId]
  );

  const handleSendAsNewConversation = useCallback(
    async (
      content: string,
      _shouldNavigate: boolean,
      attachments?: Attachment[],
      _contextSummary?: string,
      _sourceConversationId?: ConversationId,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ): Promise<ConversationId | undefined> => {
      await handleSendMessage(content, attachments, personaId, reasoningConfig);
      return undefined;
    },
    [handleSendMessage]
  );

  const handleDeleteMessage = useCallback(
    (_messageId: string) => {
      managedToast.error("Cannot delete messages in private mode");
      return Promise.resolve();
    },
    [managedToast]
  );

  const handleEditMessage = useCallback(
    (_messageId: string, _content: string) => {
      managedToast.error("Cannot edit messages in private mode");
      return Promise.resolve();
    },
    [managedToast]
  );

  const handleRetryUserMessage = useCallback(
    (
      messageId: string,
      modelId?: string,
      provider?: string,
      reasoningConfig?: ReasoningConfig,
      temperature?: number
    ) => {
      const messageIndex = privateChat.messages.findIndex(
        m => m.id === messageId
      );
      if (messageIndex === -1) {
        return;
      }

      const targetMessage = privateChat.messages[messageIndex];

      if (targetMessage && targetMessage.role === "user") {
        const messagesToKeep = privateChat.messages.slice(0, messageIndex + 1);
        privateChat.setMessages(messagesToKeep);

        privateChat
          .regenerate({
            modelId: modelId || selectedModel?.modelId,
            provider: provider || selectedModel?.provider,
            reasoningConfig,
            temperature,
          })
          .catch(error => {
            managedToast.error("Failed to regenerate", {
              description: error.message,
            });
          });
      } else {
        const previousUserMessageIndex = messageIndex - 1;
        const previousUserMessage =
          privateChat.messages[previousUserMessageIndex];

        if (!previousUserMessage || previousUserMessage.role !== "user") {
          managedToast.error("Cannot find previous user message to retry from");
          return;
        }

        const messagesToKeep = privateChat.messages.slice(
          0,
          previousUserMessageIndex + 1
        );
        privateChat.setMessages(messagesToKeep);

        privateChat
          .regenerate({
            modelId: modelId || selectedModel?.modelId,
            provider: provider || selectedModel?.provider,
            reasoningConfig,
            temperature,
          })
          .catch(error => {
            managedToast.error("Failed to regenerate", {
              description: error.message,
            });
          });
      }
    },
    [privateChat, selectedModel, managedToast]
  );

  const handleRetryAssistantMessage = useCallback(
    (
      messageId: string,
      modelId?: string,
      provider?: string,
      reasoningConfig?: ReasoningConfig,
      temperature?: number
    ) => {
      const messageIndex = privateChat.messages.findIndex(
        m => m.id === messageId
      );
      if (messageIndex === -1) {
        return;
      }

      const previousUserMessageIndex = messageIndex - 1;
      const previousUserMessage =
        privateChat.messages[previousUserMessageIndex];

      if (!previousUserMessage || previousUserMessage.role !== "user") {
        managedToast.error("Cannot find previous user message to retry from");
        return;
      }

      const messagesToKeep = privateChat.messages.slice(
        0,
        previousUserMessageIndex + 1
      );
      privateChat.setMessages(messagesToKeep);

      privateChat
        .regenerate({
          modelId: modelId || selectedModel?.modelId,
          provider: provider || selectedModel?.provider,
          reasoningConfig,
          temperature,
        })
        .catch(error => {
          managedToast.error("Failed to regenerate", {
            description: error.message,
          });
        });
    },
    [privateChat, selectedModel, managedToast]
  );

  return (
    <UnifiedChatView
      messages={chatMessages}
      isLoading={isStreaming}
      isLoadingMessages={false}
      isStreaming={isStreaming}
      currentPersonaId={currentPersonaId}
      canSavePrivateChat={!!canSave}
      hasApiKeys={hasApiKeys ?? false}
      onSendMessage={handleSendMessage}
      onSendAsNewConversation={handleSendAsNewConversation}
      onDeleteMessage={handleDeleteMessage}
      onEditMessage={handleEditMessage}
      onRefineMessage={async (messageId, type, instruction) => {
        const idx = privateChat.messages.findIndex(m => m.id === messageId);
        if (idx === -1) {
          return;
        }
        let targetIndex = idx;
        const messageAtIdx = privateChat.messages[idx];
        if (messageAtIdx && messageAtIdx.role === "assistant") {
          for (let i = idx - 1; i >= 0; i--) {
            const messageAtI = privateChat.messages[i];
            if (messageAtI && messageAtI.role === "user") {
              targetIndex = i;
              break;
            }
          }
        }
        const target = privateChat.messages[targetIndex];
        if (!target || target.role !== "user") {
          return;
        }
        let newContent = target.content;
        if (type === "custom" && instruction && instruction.trim().length > 0) {
          newContent = `${target.content}\n\n[Refine request]: ${instruction.trim()}`;
        } else if (type === "add_details") {
          newContent = `${target.content}\n\nPlease provide a more detailed and comprehensive response.`;
        } else if (type === "more_concise") {
          newContent = `${target.content}\n\nPlease provide a much more concise summary.`;
        }
        await privateChat.sendMessage(newContent, target.attachments);
      }}
      onStopGeneration={() => {
        privateChat.stop();
      }}
      onRetryUserMessage={handleRetryUserMessage}
      onRetryAssistantMessage={handleRetryAssistantMessage}
      onSavePrivateChat={handleSavePrivateChat}
      onRetryImageGeneration={undefined}
    />
  );
}
