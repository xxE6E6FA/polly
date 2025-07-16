import { memo, useCallback, useState } from "react";
import { FilePreviewDialog } from "@/components/ui/file-preview-dialog";
import { cn, stripCitations } from "@/lib/utils";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { AssistantBubble } from "./chat-message/AssistantBubble";
import { UserBubble } from "./chat-message/UserBubble";

type ChatMessageProps = {
  message: ChatMessageType;
  isStreaming?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
};

const ChatMessageComponent = ({
  message,
  isStreaming = false,
  onEditMessage,
  onRetryMessage,
  onDeleteMessage,
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

  const handleRetry = useCallback(() => {
    if (onRetryMessage && !isRetrying) {
      setIsRetrying(true);
      try {
        onRetryMessage(message.id);
      } finally {
        setIsRetrying(false);
      }
    }
  }, [onRetryMessage, message.id, isRetrying]);

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

  const handlePreviewFileClose = useCallback((open: boolean) => {
    if (!open) {
      setPreviewFile(null);
    }
  }, []);

  return (
    <>
      <div
        data-message-role={message.role}
        data-message-id={message.id}
        className={cn(
          "group w-full px-3 py-2 sm:px-6 sm:py-2.5 transition-colors",
          "bg-transparent"
        )}
      >
        {isUser ? (
          <UserBubble
            message={message}
            isStreaming={isStreaming}
            isCopied={isCopied}
            isRetrying={isRetrying}
            isDeleting={isDeleting}
            copyToClipboard={copyToClipboard}
            onEditMessage={onEditMessage}
            onRetryMessage={onRetryMessage ? handleRetry : undefined}
            onDeleteMessage={onDeleteMessage ? handleDelete : undefined}
            onPreviewFile={setPreviewFile}
          />
        ) : (
          <AssistantBubble
            message={message}
            isStreaming={isStreaming}
            isCopied={isCopied}
            isRetrying={isRetrying}
            isDeleting={isDeleting}
            copyToClipboard={copyToClipboard}
            onRetryMessage={onRetryMessage ? handleRetry : undefined}
            onDeleteMessage={onDeleteMessage ? handleDelete : undefined}
            onPreviewFile={setPreviewFile}
          />
        )}
      </div>

      {/* File preview dialog */}
      <FilePreviewDialog
        attachment={previewFile}
        open={Boolean(previewFile)}
        onOpenChange={handlePreviewFileClose}
      />
    </>
  );
};

export const ChatMessage = memo(ChatMessageComponent);
