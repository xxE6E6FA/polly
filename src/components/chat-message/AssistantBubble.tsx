import { memo } from "react";
import { Citations } from "@/components/citations";
import { Reasoning } from "@/components/reasoning";
import { SearchQuery } from "@/components/search-query";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { cn } from "@/lib/utils";
import type { Attachment, ChatMessage as ChatMessageType } from "@/types";
import { Spinner } from "../spinner";
import { AttachmentStrip } from "./AttachmentStrip";
import { MessageActions } from "./MessageActions";

type AssistantBubbleProps = {
  message: ChatMessageType;
  isStreaming?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  copyToClipboard: () => void;
  onRetryMessage?: (modelId?: string, provider?: string) => void;
  onDeleteMessage?: () => void;
  onPreviewFile?: (attachment: Attachment) => void;
};

export const AssistantBubble = memo(
  ({
    message,
    isStreaming = false,
    isCopied,
    isRetrying,
    isDeleting,
    copyToClipboard,
    onRetryMessage,
    onDeleteMessage,
    onPreviewFile,
  }: AssistantBubbleProps) => {
    const reasoning = message.reasoning;
    const displayContent = message.content;
    const hasSearch = Boolean(message.metadata?.searchQuery);
    const isThinking = message.status === "thinking";
    const isStreamingWithoutContent =
      message.status === "streaming" &&
      (!displayContent || displayContent.length === 0);

    return (
      <div className="w-full">
        <div className="min-w-0 flex-1">
          {message.metadata?.searchQuery && (
            <div className="mb-2.5">
              <SearchQuery
                feature={message.metadata.searchFeature}
                category={message.metadata.searchCategory}
                citations={message.citations}
                isLoading={
                  isStreaming &&
                  (!message.content || message.content.length === 0)
                }
              />
            </div>
          )}

          {reasoning && (
            <div className="mb-2.5">
              <Reasoning
                isLoading={isStreaming}
                reasoning={reasoning}
                hasSearch={hasSearch}
              />
            </div>
          )}

          <div className="relative">
            <StreamingMarkdown
              isStreaming={isStreaming || message.status === "streaming"}
              messageId={message.id}
            >
              {displayContent}
            </StreamingMarkdown>

            {/* Show status-based loading indicators */}
            {isThinking && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-2",
                  "@media (prefers-reduced-motion: reduce) { animation-play-state: paused }"
                )}
                aria-label="AI is thinking"
              >
                <Spinner size="sm" />
                <span className="text-xs text-muted-foreground/70 ml-2">
                  Thinking...
                </span>
              </div>
            )}

            {isStreamingWithoutContent && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-2",
                  "@media (prefers-reduced-motion: reduce) { animation-play-state: paused }"
                )}
                aria-label="AI is generating response"
              >
                <Spinner size="sm" />
                <span className="text-xs text-muted-foreground/70 ml-2">
                  Generating response...
                </span>
              </div>
            )}

            {/* Fallback to legacy isStreaming for backward compatibility */}
            {!message.status &&
              isStreaming &&
              (!displayContent || displayContent.length === 0) && (
                <div
                  className={cn(
                    "flex items-center gap-1 mt-2",
                    "@media (prefers-reduced-motion: reduce) { animation-play-state: paused }"
                  )}
                  aria-label="AI is thinking"
                >
                  <Spinner size="sm" />
                  <span className="text-xs text-muted-foreground/70 ml-2">
                    Thinking...
                  </span>
                </div>
              )}

            {message.status === "error" && (
              <div className="mt-2 text-xs text-red-500">
                An error occurred while generating the response.
              </div>
            )}
          </div>

          {message.metadata?.stopped && !isStreaming && (
            <div className="mt-3 flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-50 px-3 py-1.5 text-amber-700 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-400">
                <svg
                  className="h-3 w-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-xs font-medium">Stopped by user</span>
              </div>
            </div>
          )}

          {message.citations &&
            message.citations.length > 0 &&
            (!isStreaming || message.content.length > 0) && (
              <Citations
                key={`citations-${message.id}-${isStreaming ? "streaming" : "complete"}`}
                citations={message.citations}
                messageId={message.id}
                content={message.content}
              />
            )}

          <AttachmentStrip
            attachments={message.attachments}
            variant="assistant"
            onPreviewFile={onPreviewFile}
          />

          <MessageActions
            copyToClipboard={copyToClipboard}
            isCopied={isCopied}
            isDeleting={isDeleting}
            isRetrying={isRetrying}
            isStreaming={isStreaming}
            isUser={false}
            model={message.model}
            provider={message.provider}
            onDeleteMessage={onDeleteMessage}
            onRetryMessage={onRetryMessage}
          />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for better streaming performance
    const message = nextProps.message;
    const prevMessage = prevProps.message;

    // Always re-render if streaming state changes
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false;
    }

    // Always re-render if message content changes
    if (prevMessage.content !== message.content) {
      return false;
    }

    // Always re-render if message status changes
    if (prevMessage.status !== message.status) {
      return false;
    }

    // Always re-render if reasoning changes
    if (prevMessage.reasoning !== message.reasoning) {
      return false;
    }

    // Skip re-render if other props are the same
    return (
      prevProps.isCopied === nextProps.isCopied &&
      prevProps.isRetrying === nextProps.isRetrying &&
      prevProps.isDeleting === nextProps.isDeleting &&
      prevProps.onRetryMessage === nextProps.onRetryMessage &&
      prevProps.onDeleteMessage === nextProps.onDeleteMessage &&
      prevProps.onPreviewFile === nextProps.onPreviewFile
    );
  }
);

AssistantBubble.displayName = "AssistantBubble";
