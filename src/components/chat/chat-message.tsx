import { memo, useCallback, useMemo, useState } from "react";
import { cn, stripCitations } from "@/lib/utils";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { AssistantBubble } from "./message/assistant-bubble";
import type { ImageRetryParams } from "./message/image-actions";
import { UserBubble } from "./message/user-bubble";
import type { PersonaInfo } from "./virtualized-chat-messages";

type ChatMessageProps = {
  message: ChatMessageType;
  isStreaming?: boolean;
  conversationId?: string;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryMessage?: (
    messageId: string,
    modelId?: string,
    provider?: string
  ) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryImageGeneration?: (
    messageId: string,
    params: ImageRetryParams
  ) => void;
  onPreviewAttachment?: (attachment: Attachment) => void;
};

const ChatMessageComponent = ({
  message,
  isStreaming = false,
  onEditMessage,
  onRetryMessage,
  onRefineMessage,
  onDeleteMessage,
  onRetryImageGeneration,
  conversationId,
  onPreviewAttachment,
}: ChatMessageProps) => {
  const isUser = message.role === "user";

  // Only show persona when the message has its own snapshot — avoids retroactive
  // persona changes when the conversation-level persona is switched.
  const messagePersona: PersonaInfo = message.personaName
    ? { name: message.personaName, icon: message.personaIcon ?? "" }
    : null;

  const [isCopied, setIsCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const copyToClipboard = useCallback(async () => {
    const cleanText = stripCitations(message.content);
    await navigator.clipboard.writeText(cleanText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [message.content]);

  const handleRetry = useCallback(
    (modelId?: string, provider?: string) => {
      if (onRetryMessage && !isRetrying) {
        setIsRetrying(true);
        try {
          onRetryMessage(message.id, modelId, provider);
        } finally {
          setIsRetrying(false);
        }
      }
    },
    [onRetryMessage, message.id, isRetrying]
  );

  const handleDelete = useCallback(() => {
    if (onDeleteMessage && !isDeleting) {
      setIsDeleting(true);
      try {
        onDeleteMessage(message.id);
      } finally {
        setIsDeleting(false);
      }
    }
  }, [onDeleteMessage, message.id, isDeleting]);

  // Simple prop forwarding - React Compiler will optimize if needed
  const handlePreviewFile = (attachment: Attachment) => {
    onPreviewAttachment?.(attachment);
  };

  const hasImageGallery = useMemo(() => {
    if (
      message.role !== "assistant" ||
      message.imageGeneration?.status !== "succeeded"
    ) {
      return false;
    }
    const generatedImages =
      message.attachments?.filter(
        att => att.type === "image" && att.generatedImage?.isGenerated
      ) || [];
    const outputUrls = message.imageGeneration?.output || [];
    return generatedImages.length > 0 || outputUrls.length > 0;
  }, [message]);

  return (
    <div
      data-message-role={message.role}
      data-message-id={message.id}
      className={cn(
        "group w-full transition-colors",
        "bg-transparent",
        hasImageGallery ? "gallery-message-container" : "px-3 sm:px-6"
      )}
    >
      {isUser ? (
        <UserBubble
          conversationId={conversationId}
          message={message}
          isStreaming={isStreaming}
          isCopied={isCopied}
          isRetrying={isRetrying}
          isDeleting={isDeleting}
          copyToClipboard={copyToClipboard}
          onEditMessage={onEditMessage}
          onRetryMessage={onRetryMessage ? handleRetry : undefined}
          onRefineMessage={onRefineMessage}
          onDeleteMessage={onDeleteMessage ? handleDelete : undefined}
          onPreviewFile={handlePreviewFile}
        />
      ) : (
        <AssistantBubble
          conversationId={conversationId}
          message={message}
          persona={messagePersona}
          isStreaming={isStreaming}
          isCopied={isCopied}
          isRetrying={isRetrying}
          isDeleting={isDeleting}
          copyToClipboard={copyToClipboard}
          onRetryMessage={onRetryMessage ? handleRetry : undefined}
          onRefineMessage={onRefineMessage}
          onDeleteMessage={onDeleteMessage ? handleDelete : undefined}
          onPreviewFile={handlePreviewFile}
          onRetryImageGeneration={onRetryImageGeneration}
        />
      )}
    </div>
  );
};

export const ChatMessage = memo(
  ChatMessageComponent,
  (prevProps, nextProps) => {
    // Always re-render if image generation status changes
    if (
      prevProps.message.imageGeneration?.status !==
      nextProps.message.imageGeneration?.status
    ) {
      return false;
    }

    // Always re-render if image generation output changes
    if (
      prevProps.message.imageGeneration?.output?.length !==
      nextProps.message.imageGeneration?.output?.length
    ) {
      return false;
    }

    // Always re-render if attachments change (prevents skeleton flickering)
    if (
      prevProps.message.attachments?.length !==
      nextProps.message.attachments?.length
    ) {
      return false;
    }

    // Check if attachment URLs have changed (storage URLs resolved)
    if (prevProps.message.attachments && nextProps.message.attachments) {
      const prevAttachmentUrls = prevProps.message.attachments.map(
        att => att.url
      );
      const nextAttachmentUrls = nextProps.message.attachments.map(
        att => att.url
      );

      if (
        prevAttachmentUrls.some(
          (url, index) => url !== nextAttachmentUrls[index]
        )
      ) {
        return false;
      }
    }

    // Re-render when reasoning changes to ensure live updates
    if (prevProps.message.reasoning !== nextProps.message.reasoning) {
      return false;
    }

    // Re-render when tool calls change (e.g., generateImage running → completed)
    const prevToolCalls = prevProps.message.toolCalls;
    const nextToolCalls = nextProps.message.toolCalls;
    if ((prevToolCalls?.length ?? 0) !== (nextToolCalls?.length ?? 0)) {
      return false;
    }
    if (prevToolCalls && nextToolCalls) {
      for (let i = 0; i < prevToolCalls.length; i++) {
        if (prevToolCalls[i]?.status !== nextToolCalls[i]?.status) {
          return false;
        }
      }
    }

    // Default memo comparison for other props
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.status === nextProps.message.status &&
      prevProps.message.personaName === nextProps.message.personaName &&
      prevProps.isStreaming === nextProps.isStreaming
    );
  }
);
