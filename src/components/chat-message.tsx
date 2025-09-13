import { memo, useCallback, useMemo, useState } from "react";
import { AttachmentGalleryDialog } from "@/components/ui/attachment-gallery-dialog";
import { cn, stripCitations } from "@/lib/utils";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { AssistantBubble } from "./chat-message/AssistantBubble";
import { UserBubble } from "./chat-message/UserBubble";

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
  onRetryImageGeneration?: (messageId: string) => void;
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
}: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [isCopied, setIsCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);

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

  const handleRetryImageGeneration = useCallback(() => {
    if (onRetryImageGeneration) {
      onRetryImageGeneration(message.id);
    }
  }, [onRetryImageGeneration, message.id]);

  const handlePreviewFileClose = useCallback((open: boolean) => {
    if (!open) {
      setPreviewFile(null);
    }
  }, []);

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
    <>
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
            onPreviewFile={setPreviewFile}
          />
        ) : (
          <AssistantBubble
            conversationId={conversationId}
            message={message}
            isStreaming={isStreaming}
            isCopied={isCopied}
            isRetrying={isRetrying}
            isDeleting={isDeleting}
            copyToClipboard={copyToClipboard}
            onRetryMessage={onRetryMessage ? handleRetry : undefined}
            onRefineMessage={onRefineMessage}
            onDeleteMessage={onDeleteMessage ? handleDelete : undefined}
            onPreviewFile={setPreviewFile}
            onRetryImageGeneration={
              onRetryImageGeneration ? handleRetryImageGeneration : undefined
            }
          />
        )}
      </div>

      {previewFile && (
        <AttachmentGalleryDialog
          attachments={message.attachments || []}
          currentAttachment={previewFile}
          open={Boolean(previewFile)}
          onOpenChange={handlePreviewFileClose}
          onAttachmentChange={setPreviewFile}
        />
      )}
    </>
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

    // Default memo comparison for other props
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.status === nextProps.message.status &&
      prevProps.isStreaming === nextProps.isStreaming
    );
  }
);
