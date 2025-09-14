import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { useHoverLinger } from "@/hooks/use-hover-linger";
import { cn } from "@/lib/utils";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { AttachmentStrip } from "./AttachmentStrip";
import { MessageActions } from "./MessageActions";

type UserBubbleProps = {
  conversationId?: string;
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
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
};

export const UserBubble = memo(
  ({
    conversationId,
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
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Linger visibility state for actions
    const {
      isVisible: showActions,
      onMouseEnter,
      onMouseLeave,
    } = useHoverLinger({ delay: 700 });

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

    // Focus textarea and auto-size when entering edit mode
    useEffect(() => {
      const ta = textareaRef.current;
      if (isEditing && ta) {
        ta.focus();
        // Position caret at end
        ta.setSelectionRange(ta.value.length, ta.value.length);
        // Ensure height fits existing content on open
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
      }
    }, [isEditing]);

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
            // Full row width while editing for a roomy textarea; normal otherwise
            isEditing
              ? "w-full"
              : "max-w-[calc(100%-theme(spacing.8))] sm:max-w-[32rem] md:max-w-[36rem] lg:max-w-[40rem]"
          )}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <div
            className={cn(
              "transition-all duration-300 ease-out transform overflow-visible",
              // Use the same bubble style; in edit mode add a subtle emphasis ring
              "rounded-xl px-4 py-2.5 sm:px-5 sm:py-3 bg-muted/50 text-foreground shadow-sm ring-1",
              isEditing
                ? "ring-primary/30 shadow-md w-full"
                : "ring-border/20 hover:shadow-md hover:ring-primary/30 w-fit ml-auto",
              isPending && "opacity-60"
            )}
          >
            {isEditing ? (
              <div className="stack-lg">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="w-full resize-none border-0 bg-transparent text-[15px] leading-[1.75] sm:text-[16px] sm:leading-[1.8] text-foreground outline-none ring-0 placeholder:text-muted-foreground/60 focus:ring-0 selectable-auto"
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
                  onKeyDown={e => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      handleEditCancel();
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleEditSave();
                    }
                    // Shift+Enter will naturally create a newline (default behavior)
                  }}
                />
                <AttachmentStrip
                  attachments={message.attachments?.filter(
                    att => !att.generatedImage?.isGenerated
                  )}
                  variant="user"
                  onPreviewFile={onPreviewFile}
                  className="mt-2"
                />
                <div className="mt-2 flex justify-end gap-2 opacity-100 transition-all duration-200">
                  <Button
                    className="h-8 px-3"
                    size="sm"
                    variant="outline"
                    onClick={handleEditCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="h-8 px-3"
                    size="sm"
                    variant="primary"
                    onClick={handleEditSave}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.75] transition-all duration-300 ease-out sm:text-[16px] sm:leading-[1.8] selectable-text max-w-[74ch] min-w-0">
                {message.content}
                <AttachmentStrip
                  attachments={message.attachments?.filter(
                    att => !att.generatedImage?.isGenerated
                  )}
                  variant="user"
                  onPreviewFile={onPreviewFile}
                />
              </div>
            )}
          </div>

          <MessageActions
            isUser
            conversationId={conversationId}
            messageId={message.id}
            copyToClipboard={copyToClipboard}
            isCopied={isCopied}
            isDeleting={isDeleting}
            isEditing={isEditing}
            isRetrying={isRetrying}
            isStreaming={isStreaming}
            forceVisible={showActions}
            onDeleteMessage={onDeleteMessage}
            onEditMessage={onEditMessage ? handleEditStart : undefined}
            onRetryMessage={onRetryMessage}
            onRefineMessage={undefined}
          />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for better performance
    const message = nextProps.message;
    const prevMessage = prevProps.message;

    // Always re-render if message content changes (for editing)
    if (prevMessage.content !== message.content) {
      return false;
    }

    // Always re-render if attachments change
    if (prevMessage.attachments?.length !== message.attachments?.length) {
      return false;
    }

    // Check if any attachment changed
    if (prevMessage.attachments && message.attachments) {
      for (let i = 0; i < message.attachments.length; i++) {
        if (prevMessage.attachments[i]?.url !== message.attachments[i]?.url) {
          return false;
        }
      }
    }

    // Skip re-render if other props are the same
    return (
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.isCopied === nextProps.isCopied &&
      prevProps.isRetrying === nextProps.isRetrying &&
      prevProps.isDeleting === nextProps.isDeleting &&
      prevProps.onEditMessage === nextProps.onEditMessage &&
      prevProps.onRetryMessage === nextProps.onRetryMessage &&
      prevProps.onDeleteMessage === nextProps.onDeleteMessage &&
      prevProps.onPreviewFile === nextProps.onPreviewFile
    );
  }
);

UserBubble.displayName = "UserBubble";
