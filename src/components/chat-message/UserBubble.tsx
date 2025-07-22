import { memo, useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { AttachmentStrip } from "./AttachmentStrip";
import { MessageActions } from "./MessageActions";

type UserBubbleProps = {
  message: ChatMessageType;
  isStreaming?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  copyToClipboard: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryMessage?: (modelId?: string, provider?: string) => void;
  onDeleteMessage?: () => void;
  onPreviewFile?: (attachment: Attachment) => void;
};

export const UserBubble = memo(
  ({
    message,
    isStreaming = false,
    isCopied,
    isRetrying,
    isDeleting,
    copyToClipboard,
    onEditMessage,
    onRetryMessage,
    onDeleteMessage,
    onPreviewFile,
  }: UserBubbleProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content);
    const [showPendingSpinner, setShowPendingSpinner] = useState(false);

    const isPending = message.metadata?.status === "pending";

    // 400ms debounce for showing spinner
    useEffect(() => {
      if (isPending) {
        const timer = setTimeout(() => setShowPendingSpinner(true), 400);
        return () => clearTimeout(timer);
      }
      setShowPendingSpinner(false);
    }, [isPending]);

    const handleEditStart = useCallback(() => {
      setIsEditing(true);
      setEditContent(message.content);
    }, [message.content]);

    const handleEditCancel = useCallback(() => {
      setIsEditing(false);
      setEditContent(message.content);
    }, [message.content]);

    const handleEditSave = useCallback(() => {
      if (onEditMessage) {
        onEditMessage(message.id, editContent);
      }
      setIsEditing(false);
    }, [onEditMessage, message.id, editContent]);

    return (
      <div className="flex items-center justify-end gap-2">
        {showPendingSpinner && <Spinner aria-label="Sending message" />}
        <div
          className={cn(
            "min-w-0 transition-all duration-300 ease-out",
            isEditing
              ? "w-[600px] max-w-[calc(100vw-2rem)]"
              : "max-w-[calc(100%-theme(spacing.8))] sm:max-w-[32rem] md:max-w-[36rem] lg:max-w-[40rem]"
          )}
        >
          <div
            className={cn(
              "transition-all duration-300 ease-out transform",
              isEditing
                ? "rounded-xl border border-primary/30 bg-background p-4 sm:p-5 shadow-lg ring-1 ring-primary/10 w-full"
                : "rounded-xl px-4 py-2.5 sm:px-5 sm:py-3 bg-muted/50 border border-border text-foreground shadow-sm hover:shadow-md hover:border-primary/30 w-fit ml-auto",
              isPending && "opacity-60"
            )}
          >
            {isEditing ? (
              <div className="space-y-4">
                <textarea
                  className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-foreground outline-none ring-0 transition-opacity duration-200 placeholder:text-muted-foreground/60 focus:ring-0 sm:text-base selectable-auto"
                  placeholder="Edit your message..."
                  value={editContent}
                  style={{
                    fontFamily: "inherit",
                    height: "auto",
                    minHeight: "3rem",
                  }}
                  onChange={e => setEditContent(e.target.value)}
                  onInput={e => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                />
                <div className="flex translate-y-0 transform justify-end gap-3 opacity-100 transition-all duration-200">
                  <Button
                    className="px-5 py-2 hover:scale-105"
                    size="sm"
                    variant="outline"
                    onClick={handleEditCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="px-5 py-2 hover:scale-105"
                    size="sm"
                    variant="primary"
                    onClick={handleEditSave}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words text-sm transition-all duration-300 ease-out sm:text-base selectable-text">
                {message.content}
                <AttachmentStrip
                  attachments={message.attachments}
                  variant="user"
                  onPreviewFile={onPreviewFile}
                />
              </div>
            )}
          </div>

          <MessageActions
            isUser
            copyToClipboard={copyToClipboard}
            isCopied={isCopied}
            isDeleting={isDeleting}
            isEditing={isEditing}
            isRetrying={isRetrying}
            isStreaming={isStreaming}
            onDeleteMessage={onDeleteMessage}
            onEditMessage={onEditMessage ? handleEditStart : undefined}
            onRetryMessage={onRetryMessage}
          />
        </div>
      </div>
    );
  }
);

UserBubble.displayName = "UserBubble";
