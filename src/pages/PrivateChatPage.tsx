import { useChat } from "@ai-sdk/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { UnifiedChatView } from "@/components/unified-chat-view";
import { ROUTES } from "@/lib/routes";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";

export default function PrivateChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserDataContext();
  const { setPrivateMode } = usePrivateMode();
  const authToken = useAuthToken();

  const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

  // Get user's selected model
  const selectedModel = useQuery(api.userModels.getUserSelectedModel, {});

  // Save conversation action
  const saveConversationAction = useAction(
    api.conversations.savePrivateConversation
  );

  // Helper function to convert data URL back to base64 content
  const convertDataUrlToAttachment = useCallback(
    (dataUrl: string, name: string) => {
      const [header, base64] = dataUrl.split(",");
      const mimeTypeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeTypeMatch
        ? mimeTypeMatch[1]
        : "application/octet-stream";

      return {
        type: mimeType.startsWith("image/")
          ? ("image" as const)
          : ("text" as const),
        url: dataUrl, // Keep original data URL for compatibility
        name,
        size: Math.floor(base64.length * 0.75), // Approximate size from base64
        content: base64,
        mimeType,
      };
    },
    []
  );

  const [navigationState, setNavigationState] = useState<{
    initialMessage?: string;
    attachments?: Attachment[];
    personaId?: string | null;
    reasoningConfig?: ReasoningConfig;
  } | null>(location.state);

  const [currentPersonaId, setCurrentPersonaId] =
    useState<Id<"personas"> | null>(
      navigationState?.personaId as Id<"personas"> | null
    );

  // Stable timestamp management - moved outside useMemo to avoid mutation
  const messageTimestampsRef = useRef(new Map<string, number>());

  const getOrCreateTimestamp = useCallback((messageId: string) => {
    if (!messageTimestampsRef.current.has(messageId)) {
      messageTimestampsRef.current.set(messageId, Date.now());
    }
    return messageTimestampsRef.current.get(messageId) || Date.now();
  }, []);

  useEffect(() => {
    setPrivateMode(true);

    return () => {
      setPrivateMode(false);
    };
  }, [setPrivateMode]);

  // Prepare API request body for AI SDK
  const apiBody = useMemo(
    () => ({
      modelId: selectedModel?.modelId,
      provider: selectedModel?.provider,
      convexUrl: import.meta.env.VITE_CONVEX_URL,
    }),
    [selectedModel]
  );

  // Prepare headers with authentication
  const apiHeaders = useMemo(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    return headers;
  }, [authToken]);

  const { messages, append, stop, status, setMessages, reload } = useChat({
    api: `${import.meta.env.VITE_CONVEX_URL}/http/chat`,
    body: apiBody,
    headers: apiHeaders,
    onError: error => {
      console.error("Chat error:", error);
      toast.error("Chat error", {
        description: error.message,
      });
    },
  });

  // Handle initial message from navigation state
  useEffect(() => {
    if (
      navigationState?.initialMessage &&
      messages.length === 0 &&
      selectedModel &&
      authToken
    ) {
      append(
        {
          role: "user",
          content: navigationState.initialMessage,
        },
        {
          body: {
            ...apiBody,
            reasoningConfig: navigationState.reasoningConfig,
          },
          headers: apiHeaders,
          // biome-ignore lint/style/useNamingConvention: AI SDK uses this naming
          experimental_attachments: navigationState.attachments,
        }
      );
      // Clear navigation state after sending
      setNavigationState(null);
    }
  }, [
    navigationState,
    messages.length,
    append,
    selectedModel,
    authToken,
    apiBody,
    apiHeaders,
  ]);

  // Check if we can save (has messages and user is authenticated)
  const canSave = useMemo(() => {
    return messages.length > 0 && !user?.isAnonymous && user?._id;
  }, [messages, user]);

  // Handle saving private chat to Convex
  const handleSavePrivateChat = useCallback(async () => {
    if (!user?._id) {
      toast.error("Cannot save chat", {
        description: "User not authenticated",
      });
      return;
    }

    if (!canSave) {
      toast.error("No messages to save", {
        description: "Start a private conversation first",
      });
      return;
    }

    try {
      // Convert AI SDK messages to the format expected by savePrivateConversation
      const convertedMessages = messages
        .filter(
          (
            msg
          ): msg is typeof msg & { role: "user" | "assistant" | "system" } =>
            msg.role !== "data" &&
            typeof msg.content === "string" &&
            msg.content.trim() !== ""
        )
        .map((msg, index) => ({
          role: msg.role,
          content: msg.content,
          createdAt:
            typeof msg.createdAt === "number"
              ? msg.createdAt
              : msg.createdAt instanceof Date
                ? msg.createdAt.getTime()
                : Date.now() - (messages.length - index) * 1000, // Preserve relative timing
          // Only add model/provider for assistant messages
          model: msg.role === "assistant" ? selectedModel?.modelId : undefined,
          provider:
            msg.role === "assistant"
              ? (selectedModel?.provider as
                  | "openai"
                  | "anthropic"
                  | "google"
                  | "openrouter")
              : undefined,
          // Extract reasoning from AI SDK v4 message parts
          reasoning:
            msg.parts?.find(part => part.type === "reasoning")?.reasoning ||
            undefined,
          // Extract attachments from AI SDK message and convert data URLs to uploadable format
          attachments:
            (
              msg.experimental_attachments as
                | Array<{ contentType?: string; url?: string; name?: string }>
                | undefined
            )?.map(attachment => {
              if (attachment.url?.startsWith("data:")) {
                return convertDataUrlToAttachment(
                  attachment.url,
                  attachment.name || "attachment"
                );
              }
              // For non-data URLs, create a basic attachment structure
              return {
                type: attachment.contentType?.startsWith("image/")
                  ? ("image" as const)
                  : ("text" as const),
                url: attachment.url || "",
                name: attachment.name || "attachment",
                size: 0,
                content: undefined,
                mimeType: attachment.contentType,
              };
            }) || [],
          citations: [],
          metadata: {
            finishReason: "stop",
          },
        }));

      const conversationId = await saveConversationAction({
        messages: convertedMessages,
        title: undefined,
      });

      if (conversationId) {
        toast.success("Chat saved successfully");
        navigate(ROUTES.CHAT_CONVERSATION(conversationId));
      }
    } catch (error) {
      console.error("Failed to save private conversation:", error);
      toast.error("Failed to save chat", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [
    user,
    canSave,
    messages,
    selectedModel,
    saveConversationAction,
    navigate,
    convertDataUrlToAttachment,
  ]);

  // Convert AI SDK messages to ChatMessage format for UnifiedChatView
  const chatMessages: ChatMessage[] = useMemo(() => {
    const isLoading = status === "submitted";

    const convertedMessages = messages.map((msg, index) => {
      const messageId = msg.id || `msg-${index}`;
      const timestamp = getOrCreateTimestamp(messageId);

      // Determine status based on message completion and streaming state
      let messageStatus:
        | "thinking"
        | "streaming"
        | "done"
        | "error"
        | undefined;
      if (msg.role === "assistant" && index === messages.length - 1) {
        if (status === "submitted") {
          // We're waiting for the response to start
          messageStatus = "thinking";
        } else if (status === "streaming") {
          // We're actively streaming content or reasoning
          messageStatus = "streaming";
        } else {
          messageStatus = "done";
        }
      } else if (msg.role === "assistant") {
        messageStatus = "done";
      }

      return {
        _id: `private-${messageId}` as Id<"messages">,
        _creationTime: timestamp,
        id: messageId,
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
        conversationId: "private" as Id<"conversations">,
        userId: user?._id || ("anonymous" as Id<"users">),
        isMainBranch: true,
        createdAt: timestamp,
        status: messageStatus,
        // Extract reasoning from AI SDK v4 message parts
        reasoning:
          msg.parts?.find(part => part.type === "reasoning")?.reasoning ||
          undefined,
        model: selectedModel?.modelId,
        provider: selectedModel?.provider,
        // Extract attachments from AI SDK message
        attachments:
          (
            msg.experimental_attachments as
              | Array<{ contentType?: string; url?: string; name?: string }>
              | undefined
          )?.map(attachment => ({
            type: attachment.contentType?.startsWith("image/")
              ? ("image" as const)
              : ("text" as const),
            url: attachment.url || "",
            name: attachment.name || "attachment",
            size: 0, // Size not available from AI SDK format
            content: undefined,
            thumbnail: undefined,
            storageId: undefined,
          })) || [],
        citations: [],
        metadata: {
          finishReason: "stop",
        },
      };
    });

    // Add a thinking message if we're loading but have no assistant response yet
    if (isLoading && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const hasAssistantResponse = messages.some(
        msg => msg.role === "assistant"
      );

      // If the last message is from user and we don't have an assistant response yet,
      // or if we have messages but no assistant response, show thinking state
      if (lastMessage.role === "user" && !hasAssistantResponse) {
        const thinkingMessageId = `thinking-${Date.now()}`;
        convertedMessages.push({
          _id: `private-${thinkingMessageId}` as Id<"messages">,
          _creationTime: Date.now(),
          id: thinkingMessageId,
          role: "assistant" as const,
          content: "",
          conversationId: "private" as Id<"conversations">,
          userId: user?._id || ("anonymous" as Id<"users">),
          isMainBranch: true,
          createdAt: Date.now(),
          status: "thinking" as const,
          reasoning: undefined,
          model: selectedModel?.modelId,
          provider: selectedModel?.provider,
          attachments: [],
          citations: [],
          metadata: {
            finishReason: "stop",
          },
        });
      }
    }

    return convertedMessages;
  }, [messages, user?._id, selectedModel, getOrCreateTimestamp, status]);

  const isStreaming = useMemo(() => {
    return status === "streaming" && messages.length > 0;
  }, [status, messages.length]);

  // Handle sending messages through AI SDK
  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      // Convert attachments to clean format expected by AI SDK
      const aiSdkAttachments = attachments?.map(attachment => ({
        name: attachment.name,
        contentType: attachment.mimeType,
        url: attachment.url,
      }));

      await append(
        {
          role: "user",
          content,
        },
        {
          body: {
            ...apiBody,
            reasoningConfig,
            personaId,
          },
          headers: apiHeaders,
          // biome-ignore lint/style/useNamingConvention: AI SDK uses this naming
          experimental_attachments: aiSdkAttachments,
        }
      );

      if (personaId !== currentPersonaId) {
        setCurrentPersonaId(personaId || null);
      }
    },
    [append, apiBody, apiHeaders, currentPersonaId]
  );

  // Handle sending as new conversation (same as regular send in private mode)
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

  // These handlers are no-ops for private mode since AI SDK manages messages
  const handleDeleteMessage = useCallback((_messageId: string) => {
    toast.error("Cannot delete messages in private mode");
    return Promise.resolve();
  }, []);

  const handleEditMessage = useCallback(
    (_messageId: string, _content: string) => {
      toast.error("Cannot edit messages in private mode");
      return Promise.resolve();
    },
    []
  );

  const handleRetryUserMessage = useCallback(
    (
      messageId: string,
      modelId?: string,
      provider?: string,
      reasoningConfig?: ReasoningConfig
    ) => {
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        return;
      }

      const targetMessage = messages[messageIndex];

      if (targetMessage.role === "user") {
        // Retry from user message - keep the user message and regenerate assistant response
        const messagesToKeep = messages.slice(0, messageIndex + 1);
        setMessages(messagesToKeep);

        // Regenerate response from this point with new model options
        reload({
          body: {
            ...apiBody,
            modelId: modelId || selectedModel?.modelId,
            provider: provider || selectedModel?.provider,
            reasoningConfig: reasoningConfig || undefined,
          },
          headers: apiHeaders,
        });
      } else {
        // If retrying from assistant message, go back to previous user message
        const previousUserMessageIndex = messageIndex - 1;
        const previousUserMessage = messages[previousUserMessageIndex];

        if (!previousUserMessage || previousUserMessage.role !== "user") {
          toast.error("Cannot find previous user message to retry from");
          return;
        }

        // Keep messages up to (and including) the previous user message
        const messagesToKeep = messages.slice(0, previousUserMessageIndex + 1);
        setMessages(messagesToKeep);

        // Regenerate response from the previous user message
        reload({
          body: {
            ...apiBody,
            modelId: modelId || selectedModel?.modelId,
            provider: provider || selectedModel?.provider,
            reasoningConfig: reasoningConfig || undefined,
          },
          headers: apiHeaders,
        });
      }
    },
    [messages, apiBody, apiHeaders, selectedModel, setMessages, reload]
  );

  const handleRetryAssistantMessage = useCallback(
    (
      messageId: string,
      modelId?: string,
      provider?: string,
      reasoningConfig?: ReasoningConfig
    ) => {
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        return;
      }

      // For assistant messages, go back to the previous user message
      const previousUserMessageIndex = messageIndex - 1;
      const previousUserMessage = messages[previousUserMessageIndex];

      if (!previousUserMessage || previousUserMessage.role !== "user") {
        toast.error("Cannot find previous user message to retry from");
        return;
      }

      // Keep messages up to (and including) the previous user message
      const messagesToKeep = messages.slice(0, previousUserMessageIndex + 1);
      setMessages(messagesToKeep);

      // Regenerate response from the previous user message
      reload({
        body: {
          ...apiBody,
          modelId: modelId || selectedModel?.modelId,
          provider: provider || selectedModel?.provider,
          reasoningConfig: reasoningConfig || undefined,
        },
        headers: apiHeaders,
      });
    },
    [messages, apiBody, apiHeaders, selectedModel, setMessages, reload]
  );

  return (
    <UnifiedChatView
      messages={chatMessages}
      isLoading={status === "submitted"}
      isLoadingMessages={false}
      isStreaming={isStreaming}
      currentPersonaId={currentPersonaId}
      canSavePrivateChat={!!canSave}
      hasApiKeys={hasApiKeys ?? false}
      onSendMessage={handleSendMessage}
      onSendAsNewConversation={handleSendAsNewConversation}
      onDeleteMessage={handleDeleteMessage}
      onEditMessage={handleEditMessage}
      onStopGeneration={stop}
      onRetryUserMessage={handleRetryUserMessage}
      onRetryAssistantMessage={handleRetryAssistantMessage}
      onSavePrivateChat={handleSavePrivateChat}
    />
  );
}
